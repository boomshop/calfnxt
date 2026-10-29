#include "aligner_dsp.h"

#include "base/source/fstreamer.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Aligner {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x414C474Eu; // 'ALGN'
constexpr uint32 kStateVersion = 3;

inline float panL(float pan)
{
  const float a = (pan + 1.f) * 0.25f * 3.14159265f;
  return std::cos(a);
}
inline float panR(float pan)
{
  const float a = (pan + 1.f) * 0.25f * 3.14159265f;
  return std::sin(a);
}
} // namespace

AlignerPlugin::AlignerPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API AlignerPlugin::initialize(FUnknown* context)
{
  tresult r = EffectBase::initialize(context);
  if (r != kResultOk)
    return r;
  addNMonoInStereoOutWithRef(kLanes, STR16("Stereo Out"), STR16("Reference"));
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

tresult PLUGIN_API AlignerPlugin::setupProcessing(ProcessSetup& setup)
{
  sampleRate_ = setup.sampleRate > 1.0 ? setup.sampleRate : 48000.0;
  maxPadSamples_ = std::max(
    1, static_cast<int>(std::ceil((kMaxLaneMs + kMaxMasterMs) * 0.001 * sampleRate_)));
  for (int i = 0; i < kLanes; ++i)
  {
    laneDelay_[i].reset();
    analysisDelay_[i].reset();
    analysis_[i].setSampleRate(static_cast<float>(sampleRate_));
    analysis_[i].reset();
    corrNum_[i] = corrEa_[i] = corrEb_[i] = corrSmooth_[i] = 0.f;
    lanes_[i].join = (i > 0) && params_[bandParam(i, kBandJoin)] >= 0.5f;
    lanes_[i].delayMs =
      std::clamp(params_[bandParam(i, kBandDelay)], -kMaxLaneMs, kMaxLaneMs);
  }
  syncJoinPrevFromParams();
  for (int c = 0; c < 2; ++c)
  {
    mixFiltDelay_[c].reset();
    mixRawDelay_[c].reset();
    refFiltDelay_[c].reset();
    refRawDelay_[c].reset();
    analysisRef_[c].setSampleRate(static_cast<float>(sampleRate_));
    analysisRef_[c].reset();
  }
  masterDelay_.reset();
  masterDelay_.setXfadeLen(static_cast<int>(0.005 * sampleRate_));
  {
    float lanePadMs = 0.f, masterMs = 0.f, masterDelayMs = 0.f, reportMs = 0.f;
    makeDelayPlan(std::clamp(params_[kParamMasterTrim], -kMaxMasterMs, kMaxMasterMs), lanePadMs,
                  masterMs, masterDelayMs, reportMs);
    vizLatencyMs_.store(reportMs, std::memory_order_relaxed);
    updateLatency(static_cast<uint32>(msToDelaySamples(reportMs)), /*notifyHost=*/false);
  }
  return EffectBase::setupProcessing(setup);
}

tresult PLUGIN_API AlignerPlugin::setActive(TBool state)
{
  if (state)
  {
    for (int i = 0; i < kLanes; ++i)
    {
      laneDelay_[i].reset();
      analysisDelay_[i].reset();
      analysis_[i].reset();
      corrNum_[i] = corrEa_[i] = corrEb_[i] = corrSmooth_[i] = 0.f;
    }
    for (int c = 0; c < 2; ++c)
    {
      mixFiltDelay_[c].reset();
      mixRawDelay_[c].reset();
      refFiltDelay_[c].reset();
      refRawDelay_[c].reset();
      analysisRef_[c].reset();
    }
    masterDelay_.reset();
    waveHave_ = false;
    wavePending_ = 0;
    waveCooldown_ = 0;
    waveEnv_ = wavePrevA_ = wavePrev2A_ = 0.f;
    waveRawLen_ = wavePeakIndex_ = waveViewPre_ = waveViewPost_ = 0;
    waveViewPreMs_ = 8.f;
    waveViewPostMs_ = 24.f;
  }
  else
  {
    updateLatency(0, /*notifyHost=*/false);
  }
  return EffectBase::setActive(state);
}

uint32 PLUGIN_API AlignerPlugin::getLatencySamples()
{
  return latencySamples_;
}

void AlignerPlugin::updateLatency(uint32 want, bool notifyHost)
{
  if (want == latencySamples_)
    return;
  latencySamples_ = want;
  if (notifyHost && componentHandler)
    componentHandler->restartComponent(kLatencyChanged);
}

int AlignerPlugin::groupRoot(int lane) const
{
  lane = std::clamp(lane, 0, kLanes - 1);
  while (lane > 0 && lanes_[lane].join)
    --lane;
  return lane;
}

float AlignerPlugin::effectiveLaneDelayMs(int lane) const
{
  const int root = groupRoot(lane);
  const float base = lanes_[root].delayMs;
  if (lane == root)
    return std::clamp(base, -kMaxLaneMs, kMaxLaneMs);
  // Joined child: delay knob is relative to the group root.
  return std::clamp(base + lanes_[lane].delayMs, -kMaxLaneMs, kMaxLaneMs);
}

void AlignerPlugin::writeLaneDelayPlain(int lane, float plainMs)
{
  plainMs = std::clamp(plainMs, -kMaxLaneMs, kMaxLaneMs);
  const ParamID id = static_cast<ParamID>(bandParam(lane, kBandDelay));
  params_[id] = plainMs;
  lanes_[lane].delayMs = plainMs;
  if (auto* p = getParameterObject(id))
    p->setNormalized(p->toNormalized(static_cast<double>(plainMs)));
}

void AlignerPlugin::syncJoinPrevFromParams()
{
  for (int i = 0; i < kLanes; ++i)
    joinPrev_[i] = (i > 0) && params_[bandParam(i, kBandJoin)] >= 0.5f;
}

void AlignerPlugin::makeDelayPlan(float trimMs, float& lanePadMs, float& masterMs,
                                 float& masterDelayMs, float& reportMs) const
{
  float minLane = effectiveLaneDelayMs(0);
  float maxLane = minLane;
  for (int i = 1; i < kLanes; ++i)
  {
    const float d = effectiveLaneDelayMs(i);
    minLane = std::min(minLane, d);
    maxLane = std::max(maxLane, d);
  }
  (void)maxLane;
  lanePadMs = std::max(0.f, -minLane);
  masterMs = std::clamp(trimMs, -kMaxMasterMs, kMaxMasterMs);
  // Positive master: delay audio, do not report (stem later vs mix).
  // Negative master / lane pad: report only (early via host PDC).
  masterDelayMs = std::max(0.f, masterMs);
  reportMs = lanePadMs + std::max(0.f, -masterMs);
}

int AlignerPlugin::msToDelaySamples(float ms) const
{
  if (ms <= 0.f)
    return 0;
  const int cap = std::min(maxPadSamples_ > 0 ? maxPadSamples_ : kDelaySize - 2, kDelaySize - 2);
  return std::clamp(static_cast<int>(std::lround(ms * 0.001 * sampleRate_)), 0, cap);
}

tresult PLUGIN_API AlignerPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);

  for (int i = 0; i < kLanes; ++i)
  {
    lanes_[i].mute = params_[bandParam(i, kBandMute)] >= 0.5f;
    lanes_[i].solo = params_[bandParam(i, kBandSolo)] >= 0.5f;
    lanes_[i].phase = params_[bandParam(i, kBandPhase)] >= 0.5f;
    lanes_[i].join = (i > 0) && params_[bandParam(i, kBandJoin)] >= 0.5f;
    lanes_[i].delayMs = std::clamp(params_[bandParam(i, kBandDelay)], -kMaxLaneMs, kMaxLaneMs);
    lanes_[i].gainLin = Dsp::dbToLin(params_[bandParam(i, kBandGain)]);
    lanes_[i].pan = std::clamp(params_[bandParam(i, kBandPan)], -1.f, 1.f);
  }
  // Join edge: keep audible delay continuous (abs ↔ relative to group root).
  for (int i = 1; i < kLanes; ++i)
  {
    const bool on = lanes_[i].join;
    if (on && !joinPrev_[i])
    {
      const float rootMs = lanes_[groupRoot(i)].delayMs;
      writeLaneDelayPlain(i, lanes_[i].delayMs - rootMs);
    }
    else if (!on && joinPrev_[i])
    {
      lanes_[i].join = true; // temp so groupRoot sees the old link
      const int root = groupRoot(i);
      lanes_[i].join = false;
      writeLaneDelayPlain(i, lanes_[root].delayMs + lanes_[i].delayMs);
    }
    joinPrev_[i] = on;
  }

  const bool bypass = params_[kParamBypass] >= 0.5f;
  const float inGain = bypass ? 1.f : Dsp::dbToLin(params_[kParamInGain]);
  const float outGain = bypass ? 1.f : Dsp::dbToLin(params_[kParamOutGain]);
  const float trimMs = std::clamp(params_[kParamMasterTrim], -kMaxMasterMs, kMaxMasterMs);
  const float hp = params_[kParamAnalysisHp];
  const float lp = params_[kParamAnalysisLp];
  const int hpStages = Dsp::filterModeToStages(params_[kParamAnalysisHpMode]);
  const int lpStages = Dsp::filterModeToStages(params_[kParamAnalysisLpMode]);
  const float masterVol = Dsp::dbToLin(params_[kParamMasterVolume]);
  const int anchor = std::clamp(static_cast<int>(std::lround(params_[kParamAnchor])), 0, kLanes - 1);
  const bool filterHit = params_[kParamFilterHit] >= 0.5f;
  const bool filterWaves = params_[kParamFilterWaves] >= 0.5f;
  const bool filterCorr = params_[kParamFilterCorr] >= 0.5f;
  filterWaves_ = filterWaves;

  for (int i = 0; i < kLanes; ++i)
  {
    analysis_[i].setParams(hp, lp, hpStages, lpStages);
    analysis_[i].sanitize();
  }
  for (int c = 0; c < 2; ++c)
  {
    analysisRef_[c].setParams(hp, lp, hpStages, lpStages);
    analysisRef_[c].sanitize();
  }

  if (data.numOutputs < 1 || !data.outputs || data.outputs[0].numChannels < 2)
    return kResultOk;

  const int32 nFrames = data.numSamples;
  if (nFrames <= 0)
    return kResultOk;

  data.outputs[0].silenceFlags = 0;

  bool anySolo = false;
  for (int i = 0; i < kLanes; ++i)
    anySolo = anySolo || lanes_[i].solo;

  float maxLaneMs = effectiveLaneDelayMs(0);
  for (int i = 1; i < kLanes; ++i)
    maxLaneMs = std::max(maxLaneMs, effectiveLaneDelayMs(i));
  vizMaxLag_.store(maxLaneMs, std::memory_order_relaxed);

  float lanePadMs = 0.f, masterMs = 0.f, masterDelayMs = 0.f, reportMs = 0.f;
  makeDelayPlan(trimMs, lanePadMs, masterMs, masterDelayMs, reportMs);
  vizLatencyMs_.store(reportMs, std::memory_order_relaxed);

  const int lanePadSamp = msToDelaySamples(lanePadMs);
  const int outDelayClamped = msToDelaySamples(masterDelayMs);
  const uint32 reportLat = static_cast<uint32>(msToDelaySamples(reportMs));
  updateLatency(reportLat, /*notifyHost=*/true);

  const float corrCoeff =
    1.f - std::exp(-1.f / std::max(1.f, 0.05f * static_cast<float>(sampleRate_)));

  const bool refActive = data.numInputs > kRefBus && isAudioInputActive(kRefBus);

  auto processBlock = [&](auto** outBuf, auto getIn, auto getRef) {
    for (int32 s = 0; s < nFrames; ++s)
    {
      float raw[kLanes] {};
      for (int i = 0; i < kLanes; ++i)
      {
        float x = 0.f;
        if (i < data.numInputs && data.inputs && isAudioInputActive(i))
          x = getIn(i, s) * inGain;
        raw[i] = x;
        peakIn_.accumulate(i, x);
      }

      float refIn[2] {};
      if (refActive)
      {
        refIn[0] = getRef(0, s) * inGain;
        refIn[1] = getRef(1, s) * inGain;
      }

      float filtered[kLanes] {};
      bool active[kLanes] {};
      int dSamp[kLanes] {};
      for (int i = 0; i < kLanes; ++i)
      {
        active[i] = isAudioInputActive(i);
        filtered[i] = analysis_[i].processMono(raw[i]);
        analysisDelay_[i].write(filtered[i]);
        laneDelay_[i].write(raw[i]);
        dSamp[i] = std::clamp(
          lanePadSamp
            + static_cast<int>(std::lround(effectiveLaneDelayMs(i) * 0.001 * sampleRate_)),
          0, kDelaySize - 2);
      }

      const float refF0 = analysisRef_[0].processMono(refIn[0]);
      const float refF1 = analysisRef_[1].processMono(refIn[1]);
      refFiltDelay_[0].write(refF0);
      refFiltDelay_[1].write(refF1);
      refRawDelay_[0].write(refIn[0]);
      refRawDelay_[1].write(refIn[1]);

      const float hitSample = filterHit ? filtered[anchor] : raw[anchor];
      tickHitWaveTrigger(anchor, hitSample, active[anchor]);

      float alignedFilt[kLanes] {};
      float alignedRaw[kLanes] {};
      for (int i = 0; i < kLanes; ++i)
      {
        float f = (dSamp[i] <= 0 || bypass)
                    ? filtered[i]
                    : analysisDelay_[i].read(std::max(1, dSamp[i]));
        float r = (dSamp[i] <= 0 || bypass)
                    ? raw[i]
                    : laneDelay_[i].read(std::max(1, dSamp[i]));
        if (lanes_[i].phase)
        {
          f = -f;
          r = -r;
        }
        alignedFilt[i] = f;
        alignedRaw[i] = r;
      }
      const float xa = filterCorr ? alignedFilt[anchor] : alignedRaw[anchor];
      for (int i = 0; i < kLanes; ++i)
      {
        if (!active[i])
        {
          corrSmooth_[i] *= 1.f - corrCoeff;
          continue;
        }
        const float xb = filterCorr ? alignedFilt[i] : alignedRaw[i];
        corrNum_[i] += corrCoeff * (xa * xb - corrNum_[i]);
        corrEa_[i] += corrCoeff * (xa * xa - corrEa_[i]);
        corrEb_[i] += corrCoeff * (xb * xb - corrEb_[i]);
        const float den = std::sqrt(std::max(0.f, corrEa_[i] * corrEb_[i])) + 1.0e-20f;
        const float r = std::clamp(corrNum_[i] / den, -1.f, 1.f);
        corrSmooth_[i] += corrCoeff * (r - corrSmooth_[i]);
      }

      float sumL = 0.f;
      float sumR = 0.f;
      float dryL = 0.f;
      float dryR = 0.f;
      float mixFiltL = 0.f;
      float mixFiltR = 0.f;
      float mixRawL = 0.f;
      float mixRawR = 0.f;

      for (int i = 0; i < kLanes; ++i)
      {
        float y = alignedRaw[i] * lanes_[i].gainLin;
        if (bypass)
        {
          y = raw[i] * lanes_[i].gainLin;
          if (lanes_[i].phase)
            y = -y;
        }

        const bool audible = !lanes_[i].mute && (!anySolo || lanes_[i].solo);
        const float gL = panL(lanes_[i].pan);
        const float gR = panR(lanes_[i].pan);
        if (audible)
        {
          sumL += y * gL;
          sumR += y * gR;
          mixFiltL += alignedFilt[i] * lanes_[i].gainLin * gL;
          mixFiltR += alignedFilt[i] * lanes_[i].gainLin * gR;
          mixRawL += alignedRaw[i] * lanes_[i].gainLin * gL;
          mixRawR += alignedRaw[i] * lanes_[i].gainLin * gR;
        }
        if (bypass && audible)
        {
          dryL += y * gL;
          dryR += y * gR;
        }
      }

      mixFiltDelay_[0].write(mixFiltL);
      mixFiltDelay_[1].write(mixFiltR);
      mixRawDelay_[0].write(mixRawL);
      mixRawDelay_[1].write(mixRawR);

      float useL = bypass ? dryL : sumL;
      float useR = bypass ? dryR : sumR;

      useL *= masterVol;
      useR *= masterVol;

      float oL = 0.f, oR = 0.f;
      const int delayForOut =
        bypass ? outDelayClamped + static_cast<int>(reportLat) : outDelayClamped;
      masterDelay_.process(useL, useR, delayForOut, oL, oR);
      oL *= outGain;
      oR *= outGain;
      outBuf[0][s] = oL;
      outBuf[1][s] = oR;
      peakOut_.accumulate(0, oL);
      peakOut_.accumulate(1, oR);
    }
  };

  if (data.symbolicSampleSize == kSample32)
  {
    auto** out = data.outputs[0].channelBuffers32;
    processBlock(
      out,
      [&](int bus, int32 s) -> float {
        if (!data.inputs[bus].channelBuffers32 || data.inputs[bus].numChannels < 1)
          return 0.f;
        return data.inputs[bus].channelBuffers32[0][s];
      },
      [&](int ch, int32 s) -> float {
        if (!data.inputs[kRefBus].channelBuffers32)
          return 0.f;
        const int nch = data.inputs[kRefBus].numChannels;
        if (ch >= nch)
          return nch > 0 ? data.inputs[kRefBus].channelBuffers32[0][s] : 0.f;
        return data.inputs[kRefBus].channelBuffers32[ch][s];
      });
  }
  else
  {
    auto** out = data.outputs[0].channelBuffers64;
    processBlock(
      out,
      [&](int bus, int32 s) -> double {
        if (!data.inputs[bus].channelBuffers64 || data.inputs[bus].numChannels < 1)
          return 0.0;
        return data.inputs[bus].channelBuffers64[0][s];
      },
      [&](int ch, int32 s) -> double {
        if (!data.inputs[kRefBus].channelBuffers64)
          return 0.0;
        const int nch = data.inputs[kRefBus].numChannels;
        if (ch >= nch)
          return nch > 0 ? data.inputs[kRefBus].channelBuffers64[0][s] : 0.0;
        return data.inputs[kRefBus].channelBuffers64[ch][s];
      });
  }

  for (int i = 0; i < kLanes; ++i)
    vizCorr_[i].store(corrSmooth_[i], std::memory_order_relaxed);

  return kResultOk;
}

void AlignerPlugin::tickHitWaveTrigger(int anchor, float anchorSample, bool anchorActive)
{
  const float span = std::clamp(params_[kParamWaveSpan], kWaveSpanMsMin, kWaveSpanMsMax);
  const float preMs = span * 0.25f;
  const float postMs = span - preMs;
  int viewPre =
    std::clamp(static_cast<int>(std::lround(preMs * 0.001 * sampleRate_)), 16, 16384);
  int viewPost =
    std::clamp(static_cast<int>(std::lround(postMs * 0.001 * sampleRate_)), 32, 16384);
  int pad =
    std::clamp(static_cast<int>(std::lround(kWavePadMs * 0.001 * sampleRate_)), 64, 8192);
  int win = pad + viewPre + viewPost + pad;
  if (win > kWaveRawMax)
  {
    int room = kWaveRawMax - viewPre - viewPost;
    if (room < 128)
    {
      const float scale = static_cast<float>(kWaveRawMax - 128)
                          / static_cast<float>(viewPre + viewPost);
      viewPre = std::max(16, static_cast<int>(viewPre * scale));
      viewPost = std::max(32, kWaveRawMax - 128 - viewPre);
      room = kWaveRawMax - viewPre - viewPost;
    }
    pad = std::max(64, room / 2);
    win = pad + viewPre + viewPost + pad;
  }
  const int peakIndex = pad + viewPre;
  const int postTail = win - peakIndex;

  if (wavePending_ > 0)
  {
    --wavePending_;
    if (wavePending_ == 0)
      captureHitWave(anchor);
  }

  const float a = anchorActive ? std::fabs(anchorSample) : 0.f;
  waveEnv_ = std::max(a, waveEnv_ * 0.995f);
  const bool peak = wavePrevA_ > wavePrev2A_ && wavePrevA_ >= a && wavePrevA_ > 0.02f
                    && wavePrevA_ > waveEnv_ * 0.55f && wavePrevA_ > 1.0e-4f;
  wavePrev2A_ = wavePrevA_;
  wavePrevA_ = a;

  if (waveCooldown_ > 0)
  {
    --waveCooldown_;
    return;
  }
  if (wavePending_ > 0 || !peak || !anchorActive)
    return;

  wavePending_ = postTail;
  waveCooldown_ = postTail + static_cast<int>(0.12 * sampleRate_);
  wavePeakIndex_ = peakIndex;
  waveViewPre_ = viewPre;
  waveViewPost_ = viewPost;
  waveViewPreMs_ = static_cast<float>(viewPre) * 1000.f / static_cast<float>(sampleRate_);
  waveViewPostMs_ = static_cast<float>(viewPost) * 1000.f / static_cast<float>(sampleRate_);
  waveRawLen_ = win;
}

void AlignerPlugin::captureHitWave(int anchor)
{
  (void)anchor;
  const int win = waveRawLen_;
  const int peak = wavePeakIndex_;
  if (peak < 8 || win < peak + 8 || win > kWaveRawMax)
    return;

  for (int l = 0; l < kLanes; ++l)
  {
    auto& src = filterWaves_ ? analysisDelay_[l] : laneDelay_[l];
    for (int i = 0; i < win; ++i)
    {
      const int age = win - i;
      waveRaw_[l][i] = src.read(std::max(1, age));
    }
  }
  for (int c = 0; c < 2; ++c)
  {
    auto& mixSrc = filterWaves_ ? mixFiltDelay_[c] : mixRawDelay_[c];
    auto& refSrc = filterWaves_ ? refFiltDelay_[c] : refRawDelay_[c];
    for (int i = 0; i < win; ++i)
    {
      const int age = win - i;
      waveRawMix_[c][i] = mixSrc.read(std::max(1, age));
      waveRawRef_[c][i] = refSrc.read(std::max(1, age));
    }
  }
  waveHave_ = true;
}

int AlignerPlugin::takeIrWaveform(float* out, int maxOut)
{
  // [bins, nLanes, preBins, viewPreMs, viewPostMs, lanes…, mixL, mixR, refL, refR]
  constexpr int kHdr = 5;
  const int nCh = kLanes + kWaveExtra;
  if (!out || maxOut < kHdr + nCh * 8 || !waveHave_ || waveRawLen_ < 8)
    return 0;

  const int win = waveRawLen_;
  const int peak = std::clamp(wavePeakIndex_, 1, win - 2);
  const int viewPre = std::clamp(waveViewPre_, 1, peak);
  const int viewPost = std::clamp(waveViewPost_, 1, win - peak - 1);
  const int viewLen = viewPre + viewPost;
  const int viewStart = peak - viewPre;

  const int bins = std::clamp(
    std::min(kWaveBins, viewLen), 64, std::max(64, (maxOut - kHdr) / nCh));
  const int kNeed = kHdr + nCh * bins;
  if (maxOut < kNeed)
    return 0;

  const int preBins =
    std::clamp(static_cast<int>(std::lround(static_cast<double>(viewPre) / (viewLen - 1) * (bins - 1))),
               1, bins - 2);
  const int anchor = std::clamp(static_cast<int>(std::lround(params_[kParamAnchor])), 0, kLanes - 1);

  out[0] = static_cast<float>(bins);
  out[1] = static_cast<float>(kLanes);
  out[2] = static_cast<float>(preBins);
  out[3] = waveViewPreMs_;
  out[4] = waveViewPostMs_;

  const float anchorDelaySamp =
    effectiveLaneDelayMs(anchor) * 0.001f * static_cast<float>(sampleRate_);
  const float scale = static_cast<float>(viewLen - 1) / static_cast<float>(bins - 1);

  auto sampleRaw = [&](const float* src, float srcIdx) -> float {
    if (srcIdx <= 0.f)
      return src[0];
    if (srcIdx >= static_cast<float>(win - 1))
      return src[win - 1];
    const int i0 = static_cast<int>(srcIdx);
    const float frac = srcIdx - static_cast<float>(i0);
    return src[i0] + (src[i0 + 1] - src[i0]) * frac;
  };

  auto pack = [&](float* dst, const float* src, float delaySamp, float sign) {
    for (int b = 0; b < bins; ++b)
    {
      const float u = static_cast<float>(viewStart) + static_cast<float>(b) * scale;
      dst[b] = sampleRaw(src, u - delaySamp) * sign;
    }
  };

  for (int l = 0; l < kLanes; ++l)
  {
    const float delaySamp =
      effectiveLaneDelayMs(l) * 0.001f * static_cast<float>(sampleRate_) - anchorDelaySamp;
    const float sign = lanes_[l].phase ? -1.f : 1.f;
    pack(out + kHdr + l * bins, waveRaw_[l], delaySamp, sign);
  }

  // Mix is delay-aligned in capture; shift vs anchor, then Master Delay vs ref.
  const float masterTrimSamp =
    std::clamp(params_[kParamMasterTrim], -kMaxMasterMs, kMaxMasterMs) * 0.001f
    * static_cast<float>(sampleRate_);
  const float mixDelaySamp = -anchorDelaySamp + masterTrimSamp;
  pack(out + kHdr + kLanes * bins, waveRawMix_[0], mixDelaySamp, 1.f);
  pack(out + kHdr + (kLanes + 1) * bins, waveRawMix_[1], mixDelaySamp, 1.f);
  // Ref stays on the anchor timeline (no master trim) so Delay moves mix vs SC.
  const float refDelaySamp = -anchorDelaySamp;
  pack(out + kHdr + (kLanes + 2) * bins, waveRawRef_[0], refDelaySamp, 1.f);
  pack(out + kHdr + (kLanes + 3) * bins, waveRawRef_[1], refDelaySamp, 1.f);

  return kNeed;
}

int AlignerPlugin::takeInputLevelsDb(float* out, int maxOut)
{
  return peakIn_.takeDb(out, maxOut);
}

int AlignerPlugin::takeOutputLevelsDb(float* out, int maxOut)
{
  return peakOut_.takeDb(out, maxOut);
}

int AlignerPlugin::takeEnvelopeDisplay(float* out, int maxOut)
{
  // [latencyMs, maxLaneMs, corr×8]
  constexpr int kNeed = 2 + kLanes;
  if (!out || maxOut < kNeed)
    return 0;
  out[0] = vizLatencyMs_.load(std::memory_order_relaxed);
  out[1] = vizMaxLag_.load(std::memory_order_relaxed);
  for (int i = 0; i < kLanes; ++i)
    out[2 + i] = vizCorr_[i].load(std::memory_order_relaxed);
  return kNeed;
}

tresult PLUGIN_API AlignerPlugin::setState(IBStream* state)
{
  if (!state)
    return kResultFalse;
  IBStreamer streamer(state, kLittleEndian);
  uint32 magic = 0, version = 0;
  int32 count = 0;
  if (!streamer.readInt32u(magic) || magic != kStateMagic)
    return kResultFalse;
  if (!streamer.readInt32u(version) || version < 1)
    return kResultFalse;
  if (!streamer.readInt32(count) || count <= 0)
    return kResultFalse;
  // v2 dropped learn/mix params — accept shorter/longer by matching IDs via plains length.
  const int n = std::min(count, kParamCount);
  float plains[kParamCount] {};
  for (int i = 0; i < count; ++i)
  {
    float v = 0.f;
    if (!streamer.readFloat(v))
      return kResultFalse;
    if (i < n)
      plains[i] = v;
  }
  // v2+ : apply as many plains as stored; newer trailing params keep defaults.
  if (version >= 2 && count > 0)
  {
    for (int i = 0; i < n; ++i)
    {
      if (auto* p = getParameterObject(static_cast<ParamID>(i)))
        p->setNormalized(p->toNormalized(plains[i]));
    }
    readParamPlains(params_, kParamCount);
    syncJoinPrevFromParams();
  }
  notifyHostStateRestored();
  return kResultOk;
}

tresult PLUGIN_API AlignerPlugin::getState(IBStream* state)
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

} // namespace Aligner
} // namespace calfNXT
