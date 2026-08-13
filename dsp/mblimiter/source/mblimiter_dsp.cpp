#include "mblimiter_dsp.h"

#include "base/source/fstreamer.h"
#include "dsp_math.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace calfNXT {
namespace Mblimiter {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e584Eu; // 'CNXE'
constexpr uint32 kStateVersion = 1;
constexpr float kHistoryDisplayMs = 10000.f;

float ascCoeffFromPlain(float c)
{
  const float x = std::clamp(c, 0.f, 1.f);
  return std::pow(0.5f, (x - 0.5f) * -2.f);
}

float linToDbSafe(float lin)
{
  if (!(lin > 1.0e-12f))
    return -96.f;
  return 20.f * std::log10(lin);
}

/** Soft-clip sample to ±limit (signed), used for multi-band coefficient sum. */
float clipToLimit(float x, float limitLin)
{
  const float ax = std::fabs(x);
  if (ax > limitLin && ax > 1.0e-12f)
    return limitLin * (x / ax);
  return x;
}
} // namespace

MblimiterPlugin::MblimiterPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API MblimiterPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

int MblimiterPlugin::numBands() const
{
  return std::clamp(static_cast<int>(std::lround(params_[kParamNumBands])), 2, kMaxBands);
}

int MblimiterPlugin::oversamplingFactor() const
{
  return std::clamp(static_cast<int>(std::lround(params_[kParamOversampling])), 1, 4);
}

int MblimiterPlugin::effectiveOversampling() const
{
  int os = oversamplingFactor();
  if (params_[kParamTruePeak] >= 0.5f)
    os = std::max(os, 2);
  return os;
}

Dsp::LimitCurve MblimiterPlugin::curveFromPlain(float v) const
{
  switch (static_cast<int>(std::lround(std::clamp(v, 0.f, 2.f))))
  {
    case 1:
      return Dsp::LimitCurve::Log;
    case 2:
      return Dsp::LimitCurve::Cos;
    default:
      return Dsp::LimitCurve::Linear;
  }
}

float MblimiterPlugin::weightFromPlain(float w)
{
  return std::pow(0.25f, -w);
}

float MblimiterPlugin::stripReleaseMs(float masterMs, float relCoeff)
{
  return masterMs * std::pow(0.25f, -relCoeff);
}

float MblimiterPlugin::stripReleaseWithMinMs(int band, float masterMs, float relCoeff) const
{
  float rel = stripReleaseMs(masterMs, relCoeff);
  if (params_[kParamMinRelease] < 0.5f)
    return rel;
  // Band 0 floor uses 30 Hz (Calf); higher bands use the lower crossover edge.
  float loHz = 30.f;
  if (band > 0)
  {
    const float xovers[kMaxBands - 1] = {
      params_[kParamXover1],
      params_[kParamXover2],
      params_[kParamXover3],
      params_[kParamXover4],
      params_[kParamXover5],
    };
    loHz = std::max(20.f, xovers[band - 1]);
  }
  return std::max(2500.f / loHz, rel);
}

float MblimiterPlugin::applyColor(float x, float amount)
{
  if (amount < 1.0e-4f)
    return x;
  const float drive = 1.f + amount * 4.f;
  const float wet = std::tanh(x * drive) / std::tanh(drive);
  return x + (wet - x) * amount;
}

void MblimiterPlugin::ensureMultiBuffer()
{
  const int need = std::max(strip_[0].overallBufferSize(), broadband_.overallBufferSize());
  if (need <= 0)
    return;
  if (static_cast<int>(multiBuf_.size()) != need)
    multiBuf_.assign(static_cast<size_t>(need), 0.f);
}

void MblimiterPlugin::idleSanitize(int nFrames)
{
  applySplitParams();
  float bandsL[kMaxBands] {};
  float bandsR[kMaxBands] {};
  const int n = std::max(0, nFrames);
  for (int i = 0; i < n; ++i)
  {
    splitL_.process(0.f, bandsL);
    splitR_.process(0.f, bandsR);
  }
  for (int b = 0; b < kMaxBands; ++b)
  {
    resamplerL_[b].sanitize();
    resamplerR_[b].sanitize();
  }
  bbResamplerL_.sanitize();
  bbResamplerR_.sanitize();
  cleanResamplerL_.sanitize();
  cleanResamplerR_.sanitize();

  // One zero frame keeps sleeping limiters from holding denormal state.
  ensureMultiBuffer();
  float* multiBuf = multiBuf_.empty() ? nullptr : multiBuf_.data();
  const int bands = numBands();
  float zL = 0.f;
  float zR = 0.f;
  if (multiBuf)
    strip_[0].pokeMulti(multiBuf, 1.f);
  for (int b = 0; b < bands; ++b)
  {
    float tL = 0.f;
    float tR = 0.f;
    strip_[b].process(tL, tR, multiBuf);
    zL += tL;
    zR += tR;
  }
  broadband_.process(zL, zR, nullptr);
  Dsp::sanitizeDenormal(zL);
  Dsp::sanitizeDenormal(zR);
}

void MblimiterPlugin::updateLatency(bool bypass)
{
  const int os = std::max(1, oversamplingOld_ > 0 ? oversamplingOld_ : effectiveOversampling());
  const int stripLat = strip_[0].latencyFrames();
  const int bbLat = broadband_.latencyFrames();
  const uint32 lookHost =
    bypass ? 0u
           : static_cast<uint32>(std::max(1, (stripLat + bbLat + os - 1) / os));
  const uint32 osDelay = (!bypass && os > 1) ? 4u : 0u;
  const uint32 want = lookHost + osDelay;
  if (want == latencySamples_)
    return;
  latencySamples_ = want;
  if (componentHandler)
    componentHandler->restartComponent(kLatencyChanged);
}

uint32 PLUGIN_API MblimiterPlugin::getLatencySamples()
{
  return latencySamples_;
}

void MblimiterPlugin::applySplitParams()
{
  const int bands = numBands();
  const float slopeDb = params_[kParamSlope];
  float xovers[kMaxBands - 1] {};
  xovers[0] = params_[kParamXover1];
  xovers[1] = params_[kParamXover2];
  xovers[2] = params_[kParamXover3];
  xovers[3] = params_[kParamXover4];
  xovers[4] = params_[kParamXover5];

  splitL_.setBands(bands);
  splitR_.setBands(bands);
  splitL_.setSlopeDb(slopeDb);
  splitR_.setSlopeDb(slopeDb);
  splitL_.setFreqs(xovers, bands - 1);
  splitR_.setFreqs(xovers, bands - 1);
  splitL_.prepareBlock();
  splitR_.prepareBlock();
}

void MblimiterPlugin::resetProcessing()
{
  const int os = effectiveOversampling();
  const uint32_t hostSr = static_cast<uint32_t>(std::max(1.0, sampleRate_));
  const float sr = static_cast<float>(sampleRate_);

  splitL_.setSampleRate(sr);
  splitR_.setSampleRate(sr);
  splitL_.reset();
  splitR_.reset();

  for (int b = 0; b < kMaxBands; ++b)
  {
    resamplerL_[b].setParams(hostSr, os, 2);
    resamplerR_[b].setParams(hostSr, os, 2);
    strip_[b].setSampleRate(hostSr * static_cast<uint32_t>(os));
    strip_[b].activate();
    strip_[b].setMulti(true);
    stripMeter_[b].reset(sr);
    bandInHold_[b].reset();
    bandOutHold_[b].reset();
    weightLin_[b] = 1.f;
    lastGrDb_[b] = 0.f;
    std::memset(histBuf_[b], 0, sizeof(histBuf_[b]));
    histPos_[b] = 0;
    histSampleCount_[b] = 0;
  }

  bbResamplerL_.setParams(hostSr, os, 2);
  bbResamplerR_.setParams(hostSr, os, 2);
  cleanResamplerL_.setParams(hostSr, os, 2);
  cleanResamplerR_.setParams(hostSr, os, 2);
  broadband_.setSampleRate(hostSr * static_cast<uint32_t>(os));
  broadband_.activate();
  broadband_.setMulti(false);
  bbMeter_.reset(sr);
  overallMeter_.reset(sr);

  attackOld_ = -1.f;
  limitOld_ = -1.f;
  releaseOld_ = -1.f;
  marginOld_ = -1.f;
  kneeOld_ = -1.f;
  holdMsOld_ = -1.f;
  emphasisOld_ = -1.f;
  ascCoeffPlainOld_ = -1.f;
  oversamplingOld_ = -1;
  curveOld_ = -1;
  numBandsOld_ = -1;
  slopeOld_ = -1;
  ascOld_ = true;
  minReleaseOld_ = false;
  truePeakOld_ = false;
  for (int b = 0; b < kMaxBands; ++b)
  {
    weightPlainOld_[b] = 1.0e9f;
    relCoeffOld_[b] = 1.0e9f;
  }
  for (int i = 0; i < kMaxBands - 1; ++i)
    xoverOld_[i] = -1.f;
  xfadeSamples_ = 0;
  xfadeTotal_ = 0;
  xfadeL_ = 0.f;
  xfadeR_ = 0.f;
  ascLed_.store(0.f, std::memory_order_relaxed);
  histSamplesPerSlot_ = 1;
  histVisibleSlots_ = 160;

  {
    std::lock_guard<std::mutex> lock(histMutex_);
    for (int b = 0; b < kMaxBands; ++b)
    {
      std::memset(histSnapshot_[b], 0, sizeof(histSnapshot_[b]));
      histSnapshotPos_[b] = 0;
      histSnapshotSampleCount_[b] = 0;
    }
    histSnapshotSamplesPerSlot_ = 1;
  }

  ensureMultiBuffer();
  applyParams(true);
  applySplitParams();
  updateLatency(params_[kParamBypass] >= 0.5f);
}

void MblimiterPlugin::applyParams(bool force)
{
  const float limitDb = params_[kParamLimit];
  const float attackMs = params_[kParamAttack];
  const float releaseMs = params_[kParamRelease];
  const bool asc = params_[kParamAsc] >= 0.5f;
  const float ascCoeff = ascCoeffFromPlain(params_[kParamAscCoeff]);
  const bool truePeak = params_[kParamTruePeak] >= 0.5f;
  const float marginDb = std::clamp(params_[kParamMargin], 0.f, 3.f);
  const float limitLin =
    Dsp::dbToLin(limitDb) * (truePeak ? Dsp::dbToLin(-marginDb) : 1.f);
  const int os = effectiveOversampling();
  const int curve = static_cast<int>(std::lround(std::clamp(params_[kParamCurve], 0.f, 2.f)));
  const int bands = numBands();
  const int slopeI = static_cast<int>(std::lround(params_[kParamSlope]));

  const float holdMs =
    params_[kParamHoldEnable] >= 0.5f ? params_[kParamReleaseHold] : 0.f;
  const float emphasis =
    params_[kParamEmphasisEnable] >= 0.5f ? params_[kParamEmphasis] : 0.f;
  const float kneeDb = params_[kParamKnee];
  const bool minRel = params_[kParamMinRelease] >= 0.5f;
  const auto curveEnum = curveFromPlain(params_[kParamCurve]);

  const float xoversNow[kMaxBands - 1] = {
    params_[kParamXover1],
    params_[kParamXover2],
    params_[kParamXover3],
    params_[kParamXover4],
    params_[kParamXover5],
  };
  bool xoverDirty = false;
  for (int i = 0; i < kMaxBands - 1; ++i)
  {
    if (xoversNow[i] != xoverOld_[i])
    {
      xoverDirty = true;
      break;
    }
  }

  bool stripsDirty = force
    || releaseMs != releaseOld_
    || limitDb != limitOld_
    || attackMs != attackOld_
    || asc != ascOld_
    || ascCoeffPlainOld_ != params_[kParamAscCoeff]
    || minRel != minReleaseOld_
    || truePeak != truePeakOld_
    || marginDb != marginOld_
    || kneeDb != kneeOld_
    || holdMs != holdMsOld_
    || emphasis != emphasisOld_
    || curve != curveOld_
    || bands != numBandsOld_
    || (minRel && xoverDirty);
  if (!stripsDirty)
  {
    for (int b = 0; b < bands; ++b)
    {
      if (params_[bandParam(b, kBandWeight)] != weightPlainOld_[b]
          || params_[bandParam(b, kBandRelease)] != relCoeffOld_[b])
      {
        stripsDirty = true;
        break;
      }
    }
  }

  if (stripsDirty)
  {
    for (int b = 0; b < bands; ++b)
    {
      const float wPlain = params_[bandParam(b, kBandWeight)];
      const float relCoeff = params_[bandParam(b, kBandRelease)];
      weightPlainOld_[b] = wPlain;
      relCoeffOld_[b] = relCoeff;
      weightLin_[b] = weightFromPlain(wPlain);
      const float stripRel = stripReleaseWithMinMs(b, releaseMs, relCoeff);
      strip_[b].setParams(limitLin, attackMs, stripRel, weightLin_[b], asc, ascCoeff);
      strip_[b].setCurve(curveEnum);
      strip_[b].setDynamicsExtras(kneeDb, holdMs, emphasis);
      strip_[b].setMulti(true);
    }
    for (int b = bands; b < kMaxBands; ++b)
      weightLin_[b] = 1.f;

    broadband_.setParams(limitLin, attackMs, releaseMs, 1.f, asc, ascCoeff);
    broadband_.setCurve(curveEnum);
    broadband_.setDynamicsExtras(kneeDb, holdMs, emphasis);
    broadband_.setMulti(false);

    releaseOld_ = releaseMs;
    marginOld_ = marginDb;
    kneeOld_ = kneeDb;
    holdMsOld_ = holdMs;
    emphasisOld_ = emphasis;
    ascCoeffPlainOld_ = params_[kParamAscCoeff];
    minReleaseOld_ = minRel;
    truePeakOld_ = truePeak;
  }

  if (force || curve != curveOld_)
    curveOld_ = curve;

  if (force || bands != numBandsOld_ || slopeI != slopeOld_ || xoverDirty)
  {
    numBandsOld_ = bands;
    slopeOld_ = slopeI;
    for (int i = 0; i < kMaxBands - 1; ++i)
      xoverOld_[i] = xoversNow[i];
    applySplitParams();
  }

  if (force || attackMs != attackOld_)
  {
    attackOld_ = attackMs;
    if (!force)
    {
      for (int b = 0; b < kMaxBands; ++b)
        strip_[b].setLookaheadMs(attackMs, false);
      broadband_.setLookaheadMs(attackMs, false);
      xfadeTotal_ = static_cast<uint32_t>(std::max(1.0, sampleRate_ * 0.02));
      xfadeSamples_ = xfadeTotal_;
    }
  }

  if (force || limitDb != limitOld_ || asc != ascOld_)
  {
    limitOld_ = limitDb;
    ascOld_ = asc;
    if (!force)
    {
      for (int b = 0; b < kMaxBands; ++b)
        strip_[b].resetAsc();
      broadband_.resetAsc();
    }
  }

  if (force || os != oversamplingOld_)
  {
    oversamplingOld_ = os;
    const uint32_t hostSr = static_cast<uint32_t>(std::max(1.0, sampleRate_));
    for (int b = 0; b < kMaxBands; ++b)
    {
      resamplerL_[b].setParams(hostSr, os, 2);
      resamplerR_[b].setParams(hostSr, os, 2);
      strip_[b].setSampleRate(hostSr * static_cast<uint32_t>(os));
      const float stripRel =
        stripReleaseWithMinMs(b, releaseMs, params_[bandParam(b, kBandRelease)]);
      strip_[b].setParams(limitLin, attackMs, stripRel, weightLin_[b], asc, ascCoeff);
      strip_[b].setCurve(curveEnum);
      strip_[b].setDynamicsExtras(params_[kParamKnee], holdMs, emphasis);
      strip_[b].setLookaheadMs(attackMs, true);
      strip_[b].setMulti(true);
    }
    bbResamplerL_.setParams(hostSr, os, 2);
    bbResamplerR_.setParams(hostSr, os, 2);
    cleanResamplerL_.setParams(hostSr, os, 2);
    cleanResamplerR_.setParams(hostSr, os, 2);
    broadband_.setSampleRate(hostSr * static_cast<uint32_t>(os));
    broadband_.setParams(limitLin, attackMs, releaseMs, 1.f, asc, ascCoeff);
    broadband_.setCurve(curveEnum);
    broadband_.setDynamicsExtras(params_[kParamKnee], holdMs, emphasis);
    broadband_.setLookaheadMs(attackMs, true);
    broadband_.setMulti(false);
    attackOld_ = attackMs;
    ensureMultiBuffer();
    xfadeTotal_ = static_cast<uint32_t>(std::max(1.0, sampleRate_ * 0.005));
    xfadeSamples_ = xfadeTotal_;
  }

  ensureMultiBuffer();
  updateLatency(params_[kParamBypass] >= 0.5f);
}

void MblimiterPlugin::histFeedSample(int band, float fullPeak, float bandPeak, float grLin)
{
  if (band < 0 || band >= kMaxBands)
    return;
  const int sps = std::max(1, histSamplesPerSlot_);
  float* buf = histBuf_[band];
  int& pos = histPos_[band];
  int& count = histSampleCount_[band];

  buf[pos + 0] = std::max(buf[pos + 0], fullPeak);
  buf[pos + 1] = std::max(buf[pos + 1], bandPeak);
  if (count == 0)
    buf[pos + 2] = grLin;
  else
    buf[pos + 2] = std::min(buf[pos + 2], grLin);

  ++count;
  if (count >= sps)
  {
    pos = (pos + kHistChannels) % kHistBufSize;
    count = 0;
    buf[pos + 0] = 0.f;
    buf[pos + 1] = 0.f;
    buf[pos + 2] = 1.f;
  }
}

void MblimiterPlugin::publishHistSnapshot()
{
  std::lock_guard<std::mutex> lock(histMutex_);
  for (int b = 0; b < kMaxBands; ++b)
  {
    std::memcpy(histSnapshot_[b], histBuf_[b], sizeof(histBuf_[b]));
    histSnapshotPos_[b] = histPos_[b];
    histSnapshotSampleCount_[b] = histSampleCount_[b];
  }
  histSnapshotSamplesPerSlot_ = histSamplesPerSlot_;
}

int MblimiterPlugin::takeGainReductionDb(float* out, int maxOut)
{
  if (!out || maxOut < 1)
    return 0;
  const int n = numBands();
  if (maxOut < n + 1)
    return 0;
  for (int b = 0; b < n; ++b)
    out[b] = stripMeter_[b].takeDb();
  // Last slot: overall deepest GR (not broadband-only) for the master meter.
  out[n] = overallMeter_.takeDb();
  return n + 1;
}

int MblimiterPlugin::takeBandGainsDb(float* out, int maxOut)
{
  if (!out || maxOut < 1)
    return 0;
  const int n = std::min(numBands(), maxOut);
  for (int b = 0; b < n; ++b)
    out[b] = lastGrDb_[b];
  return n;
}

int MblimiterPlugin::takeBandIoLevelsDb(float* out, int maxOut)
{
  if (!out || maxOut < 2)
    return 0;
  const int n = numBands();
  if (maxOut < n * 2)
    return 0;
  for (int b = 0; b < n; ++b)
  {
    float inDb = -96.f;
    float outDb = -96.f;
    bandInHold_[b].takeDb(&inDb, 1);
    bandOutHold_[b].takeDb(&outDb, 1);
    out[b * 2 + 0] = inDb;
    out[b * 2 + 1] = outDb;
  }
  return n * 2;
}

int MblimiterPlugin::takeEnvelopeDisplay(float* out, int maxOut)
{
  const int bands = numBands();
  const int slots = std::max(kHistMinSlots, std::min(kHistSlots, histVisibleSlots_));
  const int perBand = slots * kHistChannels;
  const int outCount = bands * perBand + 1;
  if (maxOut < outCount)
    return 0;

  float phase = 0.f;
  {
    std::lock_guard<std::mutex> lock(histMutex_);
    const int sps = std::max(1, histSnapshotSamplesPerSlot_);
    phase = static_cast<float>(histSnapshotSampleCount_[0]) / static_cast<float>(sps);
    for (int b = 0; b < bands; ++b)
    {
      const int startPos =
        (kHistBufSize + histSnapshotPos_[b] - (slots - 1) * kHistChannels) % kHistBufSize;
      float* dst = out + b * perBand;
      for (int i = 0; i < slots; ++i)
      {
        const int srcIdx = (startPos + i * kHistChannels) % kHistBufSize;
        dst[i * kHistChannels + 0] = std::fabs(histSnapshot_[b][srcIdx + 0]);
        dst[i * kHistChannels + 1] = std::fabs(histSnapshot_[b][srcIdx + 1]);
        float gr = histSnapshot_[b][srcIdx + 2];
        if (!(gr > 0.f))
          gr = 1.f;
        dst[i * kHistChannels + 2] = std::clamp(gr, 1.0e-6f, 1.f);
      }
    }
  }
  out[outCount - 1] = std::clamp(phase, 0.f, 1.f);
  return outCount;
}

void MblimiterPlugin::configureVizBins(const char* id, int bins)
{
  if (!id || std::strcmp(id, vizEnvelopeId()) != 0)
    return;
  histVisibleSlots_ = std::max(kHistMinSlots, std::min(kHistSlots, bins));
}

tresult PLUGIN_API MblimiterPlugin::setActive(TBool state)
{
  tresult result = EffectBase::setActive(state);
  if (result != kResultOk)
    return result;
  if (state)
    resetProcessing();
  else
  {
    for (int b = 0; b < kMaxBands; ++b)
      strip_[b].deactivate();
    broadband_.deactivate();
    updateLatency(true);
  }
  return kResultOk;
}

tresult PLUGIN_API MblimiterPlugin::setupProcessing(ProcessSetup& newSetup)
{
  tresult result = EffectBase::setupProcessing(newSetup);
  if (result != kResultOk)
    return result;
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  resetProcessing();
  return kResultOk;
}

tresult PLUGIN_API MblimiterPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);

  const bool bypass = params_[kParamBypass] >= 0.5f;
  applyParams(false);

  const int bands = numBands();
  const int slots = std::max(kHistMinSlots, std::min(kHistSlots, histVisibleSlots_));
  histSamplesPerSlot_ = std::max(
    1, static_cast<int>(sampleRate_ * kHistoryDisplayMs * 0.001f / static_cast<float>(slots)));

  bool solo[kMaxBands] {};
  bool anySolo = false;
  for (int b = 0; b < bands; ++b)
  {
    solo[b] = params_[bandParam(b, kBandListen)] >= 0.5f;
    if (solo[b])
      anySolo = true;
  }
  const bool noSolo = !anySolo;

  io_.setBypassGains(bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  if (!io_.begin(data))
  {
    idleSanitize(data.numSamples);
    publishHistSnapshot();
    return kResultOk;
  }

  if (bypass)
  {
    applySplitParams();
    for (int b = 0; b < kMaxBands; ++b)
    {
      stripMeter_[b].forceZero();
      lastGrDb_[b] = 0.f;
    }
    bbMeter_.forceZero();
    overallMeter_.forceZero();
    ascLed_.store(0.f, std::memory_order_relaxed);

    if (data.symbolicSampleSize == kSample32 && data.outputs && data.outputs[0].numChannels >= 2)
    {
      float* outL = data.outputs[0].channelBuffers32[0];
      float* outR = data.outputs[0].channelBuffers32[1];
      float bandsL[kMaxBands];
      float bandsR[kMaxBands];
      for (int32 i = 0; i < data.numSamples; ++i)
      {
        const float fullPeak = std::max(std::fabs(outL[i]), std::fabs(outR[i]));
        splitL_.process(outL[i], bandsL);
        splitR_.process(outR[i], bandsR);
        for (int b = 0; b < bands; ++b)
        {
          const float bandPeak =
            std::max(std::fabs(bandsL[b]), std::fabs(bandsR[b]));
          histFeedSample(b, fullPeak, bandPeak, 1.f);
        }
      }
    }
    publishHistSnapshot();
    updateLatency(true);
    io_.end(data);
    return kResultOk;
  }

  updateLatency(false);
  applySplitParams();
  ensureMultiBuffer();

  const float displayLimit = Dsp::dbToLin(params_[kParamLimit]);
  const bool truePeak = params_[kParamTruePeak] >= 0.5f;
  const float marginDb = std::clamp(params_[kParamMargin], 0.f, 3.f);
  const float limitLin =
    displayLimit * (truePeak ? Dsp::dbToLin(-marginDb) : 1.f);
  const bool autoLevel = params_[kParamAutoLevel] >= 0.5f;
  const bool diffListen = params_[kParamDiffListen] >= 0.5f;
  const float color = params_[kParamColorEnable] >= 0.5f
                        ? std::clamp(params_[kParamColor], 0.f, 1.f)
                        : 0.f;
  const int os = oversamplingOld_ > 0 ? oversamplingOld_ : effectiveOversampling();
  const float invLimit = (autoLevel && displayLimit > 1.0e-12f) ? (1.f / displayLimit) : 1.f;
  const bool useOs = os > 1;
  float* multiBuf = multiBuf_.empty() ? nullptr : multiBuf_.data();

  uint32_t ascHold = static_cast<uint32_t>(
    std::max(0.f, ascLed_.load(std::memory_order_relaxed)));

  double overL[kMaxBands][Dsp::ResampleN::kMaxFactor] {};
  double overR[kMaxBands][Dsp::ResampleN::kMaxFactor] {};
  double resOsL[Dsp::ResampleN::kMaxFactor] {};
  double resOsR[Dsp::ResampleN::kMaxFactor] {};
  double cleanOsL[Dsp::ResampleN::kMaxFactor] {};
  double cleanOsR[Dsp::ResampleN::kMaxFactor] {};

  const int32 nFrames = data.numSamples;

  auto processFrame = [&](float& outL, float& outR) {
    if (color > 0.f)
    {
      outL = applyColor(outL, color);
      outR = applyColor(outR, color);
    }

    const float fullPeak = std::max(std::fabs(outL), std::fabs(outR));
    float bandsL[kMaxBands] {};
    float bandsR[kMaxBands] {};
    splitL_.process(outL, bandsL);
    splitR_.process(outR, bandsR);

    float bandPeak[kMaxBands] {};
    for (int b = 0; b < bands; ++b)
    {
      Dsp::sanitizeDenormal(bandsL[b]);
      Dsp::sanitizeDenormal(bandsR[b]);
      bandPeak[b] = std::max(std::fabs(bandsL[b]), std::fabs(bandsR[b]));
      bandInHold_[b].accumulate(0, bandPeak[b]);
    }

    float cleanL = outL;
    float cleanR = outR;
    bool ascActive = false;
    float stripOutPeak[kMaxBands] {};

    if (useOs)
    {
      for (int b = 0; b < bands; ++b)
      {
        double* samplesL = resamplerL_[b].upsample(static_cast<double>(bandsL[b]));
        double* samplesR = resamplerR_[b].upsample(static_cast<double>(bandsR[b]));
        std::memcpy(overL[b], samplesL, sizeof(double) * static_cast<size_t>(os));
        std::memcpy(overR[b], samplesR, sizeof(double) * static_cast<size_t>(os));
      }

      for (int s = 0; s < os; ++s)
      {
        float sumClipL = 0.f;
        float sumClipR = 0.f;
        for (int b = 0; b < bands; ++b)
        {
          sumClipL += clipToLimit(static_cast<float>(overL[b][s]), limitLin) * weightLin_[b];
          sumClipR += clipToLimit(static_cast<float>(overR[b][s]), limitLin) * weightLin_[b];
        }
        const float peakSum = std::max(std::fabs(sumClipL), std::fabs(sumClipR));
        const float multiCoeff =
          peakSum > 1.0e-12f ? std::min(limitLin / peakSum, 1.f) : 1.f;
        if (multiBuf)
          strip_[0].pokeMulti(multiBuf, multiCoeff);

        float sumL = 0.f;
        float sumR = 0.f;
        for (int b = 0; b < bands; ++b)
        {
          float tmpL = static_cast<float>(overL[b][s]);
          float tmpR = static_cast<float>(overR[b][s]);
          strip_[b].process(tmpL, tmpR, multiBuf);
          stripOutPeak[b] =
            std::max(stripOutPeak[b], std::max(std::fabs(tmpL), std::fabs(tmpR)));
          if (solo[b] || noSolo)
          {
            sumL += tmpL;
            sumR += tmpR;
            if (strip_[b].takeAsc())
              ascActive = true;
          }
        }

        Dsp::sanitizeDenormal(sumL);
        Dsp::sanitizeDenormal(sumR);
        broadband_.process(sumL, sumR, nullptr);
        resOsL[s] = sumL;
        resOsR[s] = sumR;
        cleanOsL[s] = broadband_.cleanLeft();
        cleanOsR[s] = broadband_.cleanRight();
        if (broadband_.takeAsc())
          ascActive = true;
      }

      outL = static_cast<float>(bbResamplerL_.downsample(resOsL));
      outR = static_cast<float>(bbResamplerR_.downsample(resOsR));
      cleanL = static_cast<float>(cleanResamplerL_.downsample(cleanOsL));
      cleanR = static_cast<float>(cleanResamplerR_.downsample(cleanOsR));
    }
    else
    {
      float sumClipL = 0.f;
      float sumClipR = 0.f;
      for (int b = 0; b < bands; ++b)
      {
        sumClipL += clipToLimit(bandsL[b], limitLin) * weightLin_[b];
        sumClipR += clipToLimit(bandsR[b], limitLin) * weightLin_[b];
      }
      const float peakSum = std::max(std::fabs(sumClipL), std::fabs(sumClipR));
      const float multiCoeff =
        peakSum > 1.0e-12f ? std::min(limitLin / peakSum, 1.f) : 1.f;
      if (multiBuf)
        strip_[0].pokeMulti(multiBuf, multiCoeff);

      float sumL = 0.f;
      float sumR = 0.f;
      for (int b = 0; b < bands; ++b)
      {
        float tmpL = bandsL[b];
        float tmpR = bandsR[b];
        strip_[b].process(tmpL, tmpR, multiBuf);
        stripOutPeak[b] = std::max(std::fabs(tmpL), std::fabs(tmpR));
        if (solo[b] || noSolo)
        {
          sumL += tmpL;
          sumR += tmpR;
          if (strip_[b].takeAsc())
            ascActive = true;
        }
      }

      Dsp::sanitizeDenormal(sumL);
      Dsp::sanitizeDenormal(sumR);
      broadband_.process(sumL, sumR, nullptr);
      outL = sumL;
      outR = sumR;
      cleanL = broadband_.cleanLeft();
      cleanR = broadband_.cleanRight();
      if (broadband_.takeAsc())
        ascActive = true;
    }

    if (ascActive)
      ascHold = static_cast<uint32_t>(sampleRate_) >> 3;

    outL = std::clamp(outL, -displayLimit, displayLimit);
    outR = std::clamp(outR, -displayLimit, displayLimit);

    if (autoLevel)
    {
      outL *= invLimit;
      outR *= invLimit;
      cleanL *= invLimit;
      cleanR *= invLimit;
    }

    if (diffListen)
    {
      Dsp::sanitizeDenormal(cleanL);
      Dsp::sanitizeDenormal(cleanR);
      outL = cleanL - outL;
      outR = cleanR - outR;
    }

    if (xfadeSamples_ > 0 && xfadeTotal_ > 0)
    {
      const float a =
        1.f - static_cast<float>(xfadeSamples_) / static_cast<float>(xfadeTotal_);
      outL = xfadeL_ + (outL - xfadeL_) * a;
      outR = xfadeR_ + (outR - xfadeR_) * a;
      --xfadeSamples_;
    }
    xfadeL_ = outL;
    xfadeR_ = outR;

    Dsp::sanitizeDenormal(outL);
    Dsp::sanitizeDenormal(outR);

    const float bbAtt = broadband_.attenuation();
    bbMeter_.process(bbAtt);
    float deepestLin = 1.f;
    for (int b = 0; b < bands; ++b)
    {
      const float stripAtt = strip_[b].attenuation();
      const float combined = stripAtt * bbAtt;
      float safe = combined;
      if (!(safe > 0.f) || !std::isfinite(safe))
        safe = 1.f;
      stripMeter_[b].process(safe);
      if (safe < deepestLin)
        deepestLin = safe;
      lastGrDb_[b] = linToDbSafe(safe);
      bandOutHold_[b].accumulate(0, stripOutPeak[b]);
      histFeedSample(b, fullPeak, bandPeak[b], safe);
    }
    overallMeter_.process(deepestLin);
    for (int b = bands; b < kMaxBands; ++b)
    {
      stripMeter_[b].forceZero();
      lastGrDb_[b] = 0.f;
    }
  };

  if (data.symbolicSampleSize == kSample32)
  {
    auto** out = data.outputs[0].channelBuffers32;
    const int32 nCh = data.outputs[0].numChannels;
    for (int32 i = 0; i < nFrames; ++i)
    {
      float L = nCh > 0 ? out[0][i] : 0.f;
      float R = nCh > 1 ? out[1][i] : L;
      processFrame(L, R);
      if (nCh > 0)
        out[0][i] = L;
      if (nCh > 1)
        out[1][i] = R;
    }
  }
  else
  {
    auto** out = data.outputs[0].channelBuffers64;
    const int32 nCh = data.outputs[0].numChannels;
    for (int32 i = 0; i < nFrames; ++i)
    {
      float L = nCh > 0 ? static_cast<float>(out[0][i]) : 0.f;
      float R = nCh > 1 ? static_cast<float>(out[1][i]) : L;
      processFrame(L, R);
      if (nCh > 0)
        out[0][i] = L;
      if (nCh > 1)
        out[1][i] = R;
    }
  }

  if (ascHold > static_cast<uint32_t>(std::max(0, nFrames)))
    ascHold -= static_cast<uint32_t>(nFrames);
  else
    ascHold = 0;
  ascLed_.store(static_cast<float>(ascHold), std::memory_order_relaxed);

  if (broadband_.isSleeping())
  {
    bool allSleeping = true;
    for (int b = 0; b < bands; ++b)
    {
      if (!strip_[b].isSleeping())
      {
        allSleeping = false;
        break;
      }
    }
    if (allSleeping)
    {
      for (int b = 0; b < bands; ++b)
      {
        resamplerL_[b].sanitize();
        resamplerR_[b].sanitize();
      }
      bbResamplerL_.sanitize();
      bbResamplerR_.sanitize();
      cleanResamplerL_.sanitize();
      cleanResamplerR_.sanitize();
    }
  }

  publishHistSnapshot();
  io_.end(data);
  return kResultOk;
}

tresult PLUGIN_API MblimiterPlugin::setState(IBStream* state)
{
  if (!state)
    return kResultFalse;
  IBStreamer streamer(state, kLittleEndian);

  uint32 magic = 0;
  uint32 version = 0;
  int32 count = 0;
  if (!streamer.readInt32u(magic) || magic != kStateMagic)
    return kResultFalse;
  if (!streamer.readInt32u(version) || version < 1 || version > kStateVersion)
    return kResultFalse;
  if (!streamer.readInt32(count) || count < 10 || count > kParamCount)
    return kResultFalse;

  float plains[kParamCount] {};
  for (int i = 0; i < count; ++i)
  {
    if (!streamer.readFloat(plains[i]))
      return kResultFalse;
  }

  for (int i = 0; i < kParamCount; ++i)
  {
    if (auto* p = getParameterObject(static_cast<ParamID>(i)))
      p->setNormalized(p->toNormalized(plains[i]));
  }
  readParamPlains(params_, kParamCount);
  notifyHostStateRestored();
  resetProcessing();
  return kResultOk;
}

tresult PLUGIN_API MblimiterPlugin::getState(IBStream* state)
{
  if (!state)
    return kResultFalse;
  IBStreamer streamer(state, kLittleEndian);
  streamer.writeInt32u(kStateMagic);
  streamer.writeInt32u(kStateVersion);
  streamer.writeInt32(kParamCount);
  readParamPlains(params_, kParamCount);
  for (int i = 0; i < kParamCount; ++i)
    streamer.writeFloat(params_[i]);
  return kResultOk;
}

} // namespace Mblimiter
} // namespace calfNXT
