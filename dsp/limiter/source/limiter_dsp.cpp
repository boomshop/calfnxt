#include "limiter_dsp.h"

#include "base/source/fstreamer.h"
#include "dsp_math.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace calfNXT {
namespace Limiter {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e584cu; // 'CNXL'
constexpr uint32 kStateVersion = 4;

constexpr float kHistoryDisplayMs = 10000.f;

float ascCoeffFromPlain(float c)
{
  const float x = std::clamp(c, 0.f, 1.f);
  return std::pow(0.5f, (x - 0.5f) * -2.f);
}
} // namespace

LimiterPlugin::LimiterPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API LimiterPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

int LimiterPlugin::oversamplingFactor() const
{
  return std::clamp(static_cast<int>(std::lround(params_[kParamOversampling])), 1, 4);
}

int LimiterPlugin::effectiveOversampling() const
{
  int os = oversamplingFactor();
  // True Peak: ensure at least 2× so inter-sample peaks are visible to the core.
  if (params_[kParamTruePeak] >= 0.5f)
    os = std::max(os, 2);
  return os;
}

Dsp::LimitCurve LimiterPlugin::curveFromPlain(float v) const
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

float LimiterPlugin::applyColor(float x, float amount)
{
  if (amount < 1.0e-4f)
    return x;
  const float drive = 1.f + amount * 4.f;
  const float wet = std::tanh(x * drive) / std::tanh(drive);
  return x + (wet - x) * amount;
}

uint32_t LimiterPlugin::latencyForLook(int lookLat, int os) const
{
  os = std::max(1, os);
  const uint32 lookHost =
    static_cast<uint32>(std::max(1, (lookLat + os - 1) / os));
  const uint32 osDelay = (os > 1) ? 4u : 0u;
  return lookHost + osDelay;
}

uint32_t LimiterPlugin::actualLatencySamples() const
{
  const int os = std::max(1, oversamplingOld_ > 0 ? oversamplingOld_ : effectiveOversampling());
  return latencyForLook(limiter_.latencyFrames(), os);
}

uint32_t LimiterPlugin::reportedLatencySamples() const
{
  const int os = std::max(1, oversamplingOld_ > 0 ? oversamplingOld_ : effectiveOversampling());
  const uint32_t hostSr = static_cast<uint32_t>(std::max(1.0, sampleRate_));
  const int maxLookOs = std::max(
    1, static_cast<int>(static_cast<float>(hostSr * static_cast<uint32_t>(os)) *
                        (kMaxLookaheadMs * 0.001f)));
  return latencyForLook(maxLookOs, os);
}

void LimiterPlugin::updateLatency(bool forceZero)
{
  const uint32 want = forceZero ? 0u : reportedLatencySamples();
  if (want == latencySamples_)
    return;
  latencySamples_ = want;
  if (componentHandler)
    componentHandler->restartComponent(kLatencyChanged);
}

uint32 PLUGIN_API LimiterPlugin::getLatencySamples()
{
  return latencySamples_;
}

void LimiterPlugin::resetProcessing()
{
  const int os = effectiveOversampling();
  const uint32_t hostSr = static_cast<uint32_t>(std::max(1.0, sampleRate_));
  resamplerL_.setParams(hostSr, os, 2);
  resamplerR_.setParams(hostSr, os, 2);
  cleanResamplerL_.setParams(hostSr, os, 2);
  cleanResamplerR_.setParams(hostSr, os, 2);
  limiter_.setSampleRate(hostSr * static_cast<uint32_t>(os));
  limiter_.activate();
  grMeter_.reset(static_cast<float>(sampleRate_));
  attackOld_ = -1.f;
  limitOld_ = -1.f;
  oversamplingOld_ = -1;
  curveOld_ = -1;
  ascOld_ = true;
  lookPad_.reset();
  bypassDelay_.reset();
  lookPad_.setXfadeLen(static_cast<int>(std::max(1.0, sampleRate_ * 0.02)));
  bypassDelay_.setXfadeLen(static_cast<int>(std::max(1.0, sampleRate_ * 0.02)));
  bypassOld_ = params_[kParamBypass] >= 0.5f;
  bypassXfadePos_ = 0;
  bypassXfadeLen_ = 0;
  ascLed_.store(0.f, std::memory_order_relaxed);

  std::memset(histBuf_, 0, sizeof(histBuf_));
  histPos_ = 0;
  histSampleCount_ = 0;
  histSamplesPerSlot_ = 1;
  histVisibleSlots_ = 160;
  {
    std::lock_guard<std::mutex> lock(histMutex_);
    std::memset(histSnapshot_, 0, sizeof(histSnapshot_));
    histSnapshotPos_ = 0;
    histSnapshotSampleCount_ = 0;
    histSnapshotSamplesPerSlot_ = 1;
  }

  applyParams(true);
  updateLatency(false);
}

void LimiterPlugin::applyParams(bool force)
{
  const float limitDb = params_[kParamLimit];
  const float attackMs = params_[kParamAttack];
  const float releaseMs = params_[kParamRelease];
  const bool asc = params_[kParamAsc] >= 0.5f;
  const float ascCoeff = ascCoeffFromPlain(params_[kParamAscCoeff]);
  const bool truePeak = params_[kParamTruePeak] >= 0.5f;
  const float marginDb = std::clamp(params_[kParamMargin], 0.f, 3.f);
  // Working ceiling: optional TP margin below the displayed limit.
  const float limitLin =
    Dsp::dbToLin(limitDb) * (truePeak ? Dsp::dbToLin(-marginDb) : 1.f);
  const int os = effectiveOversampling();
  const int curve = static_cast<int>(std::lround(std::clamp(params_[kParamCurve], 0.f, 2.f)));

  const float holdMs =
    params_[kParamHoldEnable] >= 0.5f ? params_[kParamReleaseHold] : 0.f;
  const float emphasis =
    params_[kParamEmphasisEnable] >= 0.5f ? params_[kParamEmphasis] : 0.f;

  limiter_.setParams(limitLin, attackMs, releaseMs, 1.f, asc, ascCoeff);
  limiter_.setCurve(curveFromPlain(params_[kParamCurve]));
  limiter_.setDynamicsExtras(params_[kParamKnee], holdMs, emphasis);

  if (force || curve != curveOld_)
    curveOld_ = curve;

  if (force || attackMs != attackOld_)
  {
    attackOld_ = attackMs;
    if (!force)
      limiter_.setLookaheadMs(attackMs, false);
  }

  if (force || limitDb != limitOld_ || asc != ascOld_)
  {
    limitOld_ = limitDb;
    ascOld_ = asc;
    if (!force)
      limiter_.resetAsc();
  }

  if (force || os != oversamplingOld_)
  {
    oversamplingOld_ = os;
    const uint32_t hostSr = static_cast<uint32_t>(std::max(1.0, sampleRate_));
    resamplerL_.setParams(hostSr, os, 2);
    resamplerR_.setParams(hostSr, os, 2);
    cleanResamplerL_.setParams(hostSr, os, 2);
    cleanResamplerR_.setParams(hostSr, os, 2);
    limiter_.setSampleRate(hostSr * static_cast<uint32_t>(os));
    limiter_.setParams(limitLin, attackMs, releaseMs, 1.f, asc, ascCoeff);
    limiter_.setCurve(curveFromPlain(params_[kParamCurve]));
    limiter_.setDynamicsExtras(params_[kParamKnee], holdMs, emphasis);
    limiter_.setLookaheadMs(attackMs, true);
    attackOld_ = attackMs;
  }

  updateLatency(false);
}

void LimiterPlugin::histFeedSample(float audioPeakLin, float grLin)
{
  const int pos = histPos_;
  histBuf_[pos + 0] = std::max(histBuf_[pos + 0], audioPeakLin);
  if (histSampleCount_ == 0)
    histBuf_[pos + 1] = grLin;
  else
    histBuf_[pos + 1] = std::min(histBuf_[pos + 1], grLin);

  histSampleCount_ += 1;
  if (histSampleCount_ >= histSamplesPerSlot_)
  {
    histPos_ = (pos + kHistChannels) % kHistBufSize;
    histSampleCount_ = 0;
    histBuf_[histPos_ + 0] = audioPeakLin;
    histBuf_[histPos_ + 1] = grLin;
  }
}

void LimiterPlugin::publishHistSnapshot()
{
  std::lock_guard<std::mutex> lock(histMutex_);
  std::memcpy(histSnapshot_, histBuf_, sizeof(histBuf_));
  histSnapshotPos_ = histPos_;
  histSnapshotSampleCount_ = histSampleCount_;
  histSnapshotSamplesPerSlot_ = histSamplesPerSlot_;
}

tresult PLUGIN_API LimiterPlugin::setActive(TBool state)
{
  tresult result = EffectBase::setActive(state);
  if (result != kResultOk)
    return result;
  if (state)
    resetProcessing();
  else
  {
    limiter_.deactivate();
    updateLatency(/*forceZero=*/true);
  }
  return kResultOk;
}

tresult PLUGIN_API LimiterPlugin::setupProcessing(ProcessSetup& newSetup)
{
  tresult result = EffectBase::setupProcessing(newSetup);
  if (result != kResultOk)
    return result;
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  resetProcessing();
  return kResultOk;
}

int LimiterPlugin::takeGainReductionDb(float* out, int maxOut)
{
  if (!out || maxOut < 1)
    return 0;
  out[0] = grMeter_.takeDb();
  return 1;
}

int LimiterPlugin::takeEnvelopeDisplay(float* out, int maxOut)
{
  const int slots = std::max(kHistMinSlots, std::min(kHistSlots, histVisibleSlots_));
  const int outCount = slots * kHistChannels;
  if (maxOut < outCount + 1)
    return 0;

  float phase = 0.f;
  {
    std::lock_guard<std::mutex> lock(histMutex_);
    const int startPos =
      (kHistBufSize + histSnapshotPos_ - (slots - 1) * kHistChannels) % kHistBufSize;
    const int sps = std::max(1, histSnapshotSamplesPerSlot_);
    phase = static_cast<float>(histSnapshotSampleCount_) / static_cast<float>(sps);
    for (int i = 0; i < slots; ++i)
    {
      const int srcIdx = (startPos + i * kHistChannels) % kHistBufSize;
      out[i * kHistChannels + 0] = std::fabs(histSnapshot_[srcIdx + 0]);
      float gr = histSnapshot_[srcIdx + 1];
      if (!(gr > 0.f))
        gr = 1.f;
      out[i * kHistChannels + 1] = std::clamp(gr, 1.0e-6f, 1.f);
    }
  }
  out[outCount] = std::clamp(phase, 0.f, 1.f);
  return outCount + 1;
}

void LimiterPlugin::configureVizBins(const char* id, int bins)
{
  if (!id || std::strcmp(id, vizEnvelopeId()) != 0)
    return;
  histVisibleSlots_ = std::max(kHistMinSlots, std::min(kHistSlots, bins));
}

tresult PLUGIN_API LimiterPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);

  const bool bypass = params_[kParamBypass] >= 0.5f;
  applyParams(false);

  const int slots = std::max(kHistMinSlots, std::min(kHistSlots, histVisibleSlots_));
  histSamplesPerSlot_ = std::max(
    1, static_cast<int>(sampleRate_ * kHistoryDisplayMs * 0.001f / static_cast<float>(slots)));

  io_.setBypassGains(bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  if (!io_.begin(data))
  {
    publishHistSnapshot();
    return kResultOk;
  }

  updateLatency(false);

  if (bypass != bypassOld_)
  {
    bypassOld_ = bypass;
    bypassXfadeLen_ = static_cast<uint32_t>(std::max(1.0, sampleRate_ * 0.01));
    bypassXfadePos_ = 0;
  }

  const float displayLimit = Dsp::dbToLin(params_[kParamLimit]);
  const bool autoLevel = params_[kParamAutoLevel] >= 0.5f;
  const bool diffListen = params_[kParamDiffListen] >= 0.5f;
  const float color = params_[kParamColorEnable] >= 0.5f
                        ? std::clamp(params_[kParamColor], 0.f, 1.f)
                        : 0.f;
  const int os = oversamplingOld_ > 0 ? oversamplingOld_ : effectiveOversampling();
  const float invLimit = (autoLevel && displayLimit > 1.0e-12f) ? (1.f / displayLimit) : 1.f;
  const bool useOs = os > 1;

  uint32_t ascHold = static_cast<uint32_t>(
    std::max(0.f, ascLed_.load(std::memory_order_relaxed)));

  // Scratch for matched clean (pre-GR) downsample when oversampling.
  double cleanOsL[Dsp::ResampleN::kMaxFactor] {};
  double cleanOsR[Dsp::ResampleN::kMaxFactor] {};

  const int32 nFrames = data.numSamples;
  auto processFrame = [&](float& outL, float& outR) {
    const float inL = outL;
    const float inR = outR;

    if (color > 0.f)
    {
      outL = applyColor(outL, color);
      outR = applyColor(outR, color);
    }

    const float inPeak = std::max(std::fabs(outL), std::fabs(outR));
    float cleanL = outL;
    float cleanR = outR;

    if (useOs)
    {
      double* samplesL = resamplerL_.upsample(static_cast<double>(outL));
      double* samplesR = resamplerR_.upsample(static_cast<double>(outR));
      for (int s = 0; s < os; ++s)
      {
        float tmpL = static_cast<float>(samplesL[s]);
        float tmpR = static_cast<float>(samplesR[s]);
        limiter_.process(tmpL, tmpR, nullptr);
        samplesL[s] = tmpL;
        samplesR[s] = tmpR;
        cleanOsL[s] = limiter_.cleanLeft();
        cleanOsR[s] = limiter_.cleanRight();
        if (limiter_.takeAsc())
          ascHold = static_cast<uint32_t>(sampleRate_) >> 3;
      }
      outL = static_cast<float>(resamplerL_.downsample(samplesL));
      outR = static_cast<float>(resamplerR_.downsample(samplesR));
      // Same OS filters as wet → Diff is silent when att == 1 (no path mismatch).
      cleanL = static_cast<float>(cleanResamplerL_.downsample(cleanOsL));
      cleanR = static_cast<float>(cleanResamplerR_.downsample(cleanOsR));
    }
    else
    {
      limiter_.process(outL, outR, nullptr);
      cleanL = limiter_.cleanLeft();
      cleanR = limiter_.cleanRight();
      if (limiter_.takeAsc())
        ascHold = static_cast<uint32_t>(sampleRate_) >> 3;
    }

    // Brickwall at the *displayed* ceiling (margin is internal only).
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
      // Removed by GR + clamp (pre-GR delayed tap minus limited output).
      outL = cleanL - outL;
      outR = cleanR - outR;
    }

    const int pad = std::max(
      0, static_cast<int>(latencySamples_) - static_cast<int>(actualLatencySamples()));
    lookPad_.process(outL, outR, pad, outL, outR);

    float dryL = inL;
    float dryR = inR;
    bypassDelay_.process(
      inL, inR, static_cast<int>(latencySamples_), dryL, dryR);

    if (bypassXfadePos_ < bypassXfadeLen_)
    {
      const float t = static_cast<float>(bypassXfadePos_) /
                      static_cast<float>(std::max(1u, bypassXfadeLen_));
      const float a = std::sin(t * 1.5707963267948966f);
      const float b = std::cos(t * 1.5707963267948966f);
      if (bypass)
      {
        outL = outL * b + dryL * a;
        outR = outR * b + dryR * a;
      }
      else
      {
        outL = dryL * b + outL * a;
        outR = dryR * b + outR * a;
      }
      ++bypassXfadePos_;
    }
    else if (bypass)
    {
      outL = dryL;
      outR = dryR;
    }

    Dsp::sanitizeDenormal(outL);
    Dsp::sanitizeDenormal(outR);

    if (bypass)
    {
      histFeedSample(inPeak, 1.f);
      grMeter_.forceZero();
      ascHold = 0;
      return;
    }

    // Per host sample — GrMeter ballistics are sample-rate based.
    const float grLin = limiter_.attenuation();
    histFeedSample(inPeak, grLin);
    grMeter_.process(grLin);
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

  if (limiter_.isSleeping())
  {
    resamplerL_.sanitize();
    resamplerR_.sanitize();
    cleanResamplerL_.sanitize();
    cleanResamplerR_.sanitize();
  }

  publishHistSnapshot();
  io_.end(data);
  return kResultOk;
}

tresult PLUGIN_API LimiterPlugin::setState(IBStream* state)
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

tresult PLUGIN_API LimiterPlugin::getState(IBStream* state)
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

} // namespace Limiter
} // namespace calfNXT
