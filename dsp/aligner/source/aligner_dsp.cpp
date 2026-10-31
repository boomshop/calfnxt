#include "aligner_dsp.h"

#include "base/source/fstreamer.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>
#include <cstring>

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
  addMultiChannelInStereoOutWithRef(kLanes, STR16("Stereo Out"), STR16("Reference"));
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
    resetWaveHit();
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
  // Master Trim is the only intentional stem delay; on bypass it is skipped in
  // audio (PDC hold still uses reportLat below) and in the wave pack.
  const float trimMs =
    bypass ? 0.f : std::clamp(params_[kParamMasterTrim], -kMaxMasterMs, kMaxMasterMs);
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

  float maxLaneMs = bypass ? 0.f : effectiveLaneDelayMs(0);
  if (!bypass)
  {
    for (int i = 1; i < kLanes; ++i)
      maxLaneMs = std::max(maxLaneMs, effectiveLaneDelayMs(i));
  }
  vizMaxLag_.store(maxLaneMs, std::memory_order_relaxed);

  float lanePadMs = 0.f, masterMs = 0.f, masterDelayMs = 0.f, reportMs = 0.f;
  if (bypass)
  {
    // Hold the last reported latency so the host PDC does not jump; do not
    // apply Master Trim or lane pads as audible delay while bypassed.
    reportMs = vizLatencyMs_.load(std::memory_order_relaxed);
  }
  else
  {
    makeDelayPlan(trimMs, lanePadMs, masterMs, masterDelayMs, reportMs);
    vizLatencyMs_.store(reportMs, std::memory_order_relaxed);
  }

  const int lanePadSamp = bypass ? 0 : msToDelaySamples(lanePadMs);
  const int outDelayClamped = bypass ? 0 : msToDelaySamples(masterDelayMs);
  const uint32 reportLat = static_cast<uint32>(msToDelaySamples(reportMs));
  updateLatency(reportLat, /*notifyHost=*/true);

  // Bypass edge: re-snapshot so packs match undelayed / delayed taps.
  if (bypass != bypassPrev_ && waveHave_)
    snapshotWaveFromRing(std::max(1, wavePeakAge_), /*publish=*/true);
  bypassPrev_ = bypass;

  const float corrCoeff =
    1.f - std::exp(-1.f / std::max(1.f, 0.05f * static_cast<float>(sampleRate_)));

  // Bus 0 = N-channel main (lanes), bus 1 = stereo Reference aux.
  const bool mainActive = data.numInputs > 0 && isAudioInputActive(0);
  const int mainCh =
    (mainActive && data.inputs) ? static_cast<int>(data.inputs[0].numChannels) : 0;
  const bool refActive = data.numInputs > kRefBus && isAudioInputActive(kRefBus);

  auto processBlock = [&](auto** outBuf, auto getIn, auto getRef) {
    for (int32 s = 0; s < nFrames; ++s)
    {
      float raw[kLanes] {};
      for (int i = 0; i < kLanes; ++i)
      {
        float x = 0.f;
        if (i < mainCh)
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
        active[i] = i < mainCh;
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
      tickWaveHit(hitSample, active[anchor]);

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
        // Phase is part of alignment (with Delay), not the mix — skip on Bypass.
        if (!bypass && lanes_[i].phase)
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
        // Bypass: undelayed, unflipped raw — Gain/Pan/Mute/Solo still apply.
        float y =
          bypass ? raw[i] * lanes_[i].gainLin : alignedRaw[i] * lanes_[i].gainLin;

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
      // Active: only Master Trim (positive) through the delay line; negative
      // trim + lane pad are host PDC (reportLat). Bypass: delay by reportLat
      // only so dry stays aligned with the host's compensation.
      const int delayForOut =
        bypass ? static_cast<int>(reportLat) : outDelayClamped;
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
      [&](int ch, int32 s) -> float {
        if (!data.inputs || !data.inputs[0].channelBuffers32)
          return 0.f;
        if (ch < 0 || ch >= data.inputs[0].numChannels || !data.inputs[0].channelBuffers32[ch])
          return 0.f;
        return data.inputs[0].channelBuffers32[ch][s];
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
      [&](int ch, int32 s) -> double {
        if (!data.inputs || !data.inputs[0].channelBuffers64)
          return 0.0;
        if (ch < 0 || ch >= data.inputs[0].numChannels || !data.inputs[0].channelBuffers64[ch])
          return 0.0;
        return data.inputs[0].channelBuffers64[ch][s];
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

void AlignerPlugin::waveGeomForSpan(float spanMs, int& viewPre, int& viewPost, int& pad,
                                    int& win) const
{
  const float span = std::clamp(spanMs, kWaveSpanMsMin, kWaveSpanMsMax);
  const float preMs = span * 0.25f;
  const float postMs = span - preMs;
  viewPre =
    std::clamp(static_cast<int>(std::lround(preMs * 0.001 * sampleRate_)), 16, 16384);
  viewPost =
    std::clamp(static_cast<int>(std::lround(postMs * 0.001 * sampleRate_)), 32, 16384);
  pad = std::clamp(static_cast<int>(std::lround(kWavePadMs * 0.001 * sampleRate_)), 64, 8192);
  win = pad + viewPre + viewPost + pad;
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
}

void AlignerPlugin::fillWaveVizSig(WaveVizSig& sig) const
{
  sig = {};
  sig.gen = waveCapGen_;
  sig.fillSeq = waveFillSeq_;
  sig.spanMs = std::clamp(params_[kParamWaveSpan], kWaveSpanMsMin, kWaveSpanMsMax);
  sig.masterTrimMs = std::clamp(params_[kParamMasterTrim], -kMaxMasterMs, kMaxMasterMs);
  sig.bypass = params_[kParamBypass] >= 0.5f ? 1 : 0;
  sig.anchor =
    static_cast<std::uint8_t>(std::clamp(static_cast<int>(std::lround(params_[kParamAnchor])),
                                         0, kLanes - 1));
  for (int i = 0; i < kLanes; ++i)
  {
    sig.laneDelayMs[i] = effectiveLaneDelayMs(i);
    sig.phase[i] = lanes_[i].phase ? 1 : 0;
  }
}

void AlignerPlugin::resetWaveHit()
{
  waveHave_ = false;
  waveFilling_ = false;
  wavePendingViz_ = false;
  wavePeakAge_ = 1;
  wavePostTail_ = 0;
  waveRawLen_ = wavePeakIndex_ = waveCapPre_ = waveCapPost_ = 0;
  waveCapGen_ = 0;
  waveFillSeq_ = 0;
  waveVizSent_ = {};
  waveVizHaveSent_ = false;
  waveHitPhase_ = WaveHitPhase::Armed;
  waveHitMax_ = waveLastHump_ = 0.f;
  waveHitPrev_ = 0.f;
  wavePeriodPeak_ = 0.f;
  wavePeriodPeakAge_ = 1;
  waveRefractoryLeft_ = 0;
}

void AlignerPlugin::armWaveLock(int peakAge)
{
  int viewPre = 0, viewPost = 0, pad = 0, win = 0;
  waveGeomForSpan(kWaveSpanMsMax, viewPre, viewPost, pad, win);
  wavePeakIndex_ = pad + viewPre;
  waveCapPre_ = viewPre;
  waveCapPost_ = viewPost;
  wavePostTail_ = win - wavePeakIndex_;
  wavePeakAge_ = std::clamp(peakAge, 1, wavePostTail_);
  waveFilling_ = true;
  wavePendingViz_ = true;
  ++waveCapGen_;
  // Seed raw only — keep the previous UI pack until the Wave window is full.
  snapshotWaveFromRing(wavePeakAge_, /*publish=*/false);
}

void AlignerPlugin::snapshotWaveFromRing(int peakAge, bool publish)
{
  int viewPre = 0, viewPost = 0, pad = 0, fullWin = 0;
  waveGeomForSpan(kWaveSpanMsMax, viewPre, viewPost, pad, fullWin);
  const int peakIndex = pad + viewPre;
  const int postTail = fullWin - peakIndex;
  peakAge = std::clamp(peakAge, 1, postTail);
  const int win = peakIndex + peakAge;
  if (peakIndex < 8 || win < peakIndex + 1 || win > kWaveRawMax)
    return;

  wavePeakIndex_ = peakIndex;
  waveRawLen_ = win;
  waveCapPre_ = viewPre;
  waveCapPost_ = viewPost;
  wavePostTail_ = postTail;
  wavePeakAge_ = peakAge;

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
  if (publish)
  {
    ++waveFillSeq_;
    waveVizHaveSent_ = false;
  }
}

void AlignerPlugin::tickWaveHit(float sample, bool active)
{
  // Grow post after the locked hump until max span (+ pad) is present.
  // UI sees one publish when the current Wave window is full; older pack stays.
  if (waveFilling_)
  {
    ++wavePeakAge_;
    int wantPre = 0, wantPost = 0, wantPad = 0, wantWin = 0;
    waveGeomForSpan(std::clamp(params_[kParamWaveSpan], kWaveSpanMsMin, kWaveSpanMsMax),
                    wantPre, wantPost, wantPad, wantWin);
    (void)wantPre;
    (void)wantPad;
    (void)wantWin;

    if (wavePeakAge_ >= wavePostTail_)
    {
      const bool pub = wavePendingViz_;
      wavePendingViz_ = false;
      snapshotWaveFromRing(wavePostTail_, pub);
      waveFilling_ = false;
    }
    else if (wavePendingViz_ && wavePeakAge_ >= wantPost)
    {
      // Clear pending before publish so takeIr cannot send a half-empty pack
      // (gen already advanced on lock) or skip the ready pack.
      wavePendingViz_ = false;
      snapshotWaveFromRing(wavePeakAge_, /*publish=*/true);
    }
    else if ((wavePeakAge_ % kWaveFillRawStride) == 0)
    {
      // Keep extending raw silently (wider Wave knob / later re-crop).
      snapshotWaveFromRing(wavePeakAge_, /*publish=*/false);
    }
  }

  if (waveRefractoryLeft_ > 0)
    --waveRefractoryLeft_;

  if (!active)
  {
    waveHitPhase_ = WaveHitPhase::Armed;
    waveHitMax_ = waveLastHump_ = 0.f;
    waveHitPrev_ = 0.f;
    wavePeriodPeak_ = 0.f;
    wavePeriodPeakAge_ = 1;
    waveRefractoryLeft_ = 0;
    return;
  }

  const float x = sample;
  const float ax = std::fabs(x);

  // One amplitude sample per half-period (between zero-crossings). A double
  // peak without a ZC is just the louder value of that half-period — no rise.
  if (ax >= wavePeriodPeak_)
  {
    wavePeriodPeak_ = ax;
    wavePeriodPeakAge_ = 1; // delay already holds this sample
  }
  else
  {
    ++wavePeriodPeakAge_;
  }

  const bool zc =
    (waveHitPrev_ < 0.f && x >= 0.f) || (waveHitPrev_ > 0.f && x <= 0.f);
  waveHitPrev_ = x;
  if (!zc)
    return;

  const float P = wavePeriodPeak_;
  const int peakAge = std::max(1, wavePeriodPeakAge_);
  wavePeriodPeak_ = ax;
  wavePeriodPeakAge_ = 1;

  if (P <= kWaveOnsetFloor && waveLastHump_ <= kWaveOnsetFloor)
  {
    waveLastHump_ = P;
    return;
  }

  auto tryLock = [&]() {
    if (waveFilling_ || waveRefractoryLeft_ > 0)
      return;
    armWaveLock(peakAge);
    const float spanMs =
      std::clamp(params_[kParamWaveSpan], kWaveSpanMsMin, kWaveSpanMsMax);
    waveRefractoryLeft_ = std::max(
      1, static_cast<int>(std::lround(kWaveRefractorySpan * spanMs * 0.001 * sampleRate_)));
  };

  switch (waveHitPhase_)
  {
  case WaveHitPhase::Armed:
    if (P > kWaveOnsetFloor)
    {
      tryLock();
      waveHitMax_ = waveLastHump_ = P;
      waveHitPhase_ = WaveHitPhase::InHit;
    }
    break;

  case WaveHitPhase::InHit:
    if (P >= waveLastHump_)
    {
      waveHitMax_ = std::max(waveHitMax_, P);
      waveLastHump_ = P;
    }
    else
    {
      waveLastHump_ = P;
      waveHitPhase_ = WaveHitPhase::WaitRise;
    }
    break;

  case WaveHitPhase::WaitRise:
    if (P > waveLastHump_)
    {
      tryLock();
      waveHitMax_ = waveLastHump_ = P;
      waveHitPhase_ = WaveHitPhase::InHit;
    }
    else
    {
      waveLastHump_ = P;
    }
    break;
  }
}

int AlignerPlugin::takeIrWaveform(float* out, int maxOut)
{
  // [bins, nLanes, preBins, viewPreMs, viewPostMs, lanes…, mixL, mixR, refL, refR]
  constexpr int kHdr = 5;
  const int nCh = kLanes + kWaveExtra;
  if (!out || maxOut < kHdr + nCh * 8 || !waveHave_ || waveRawLen_ < 8)
    return 0;
  // Lock bumps gen immediately; raw post is still short. Hold the previous
  // UI pack until the Wave window is full (wavePendingViz_ cleared on publish).
  if (wavePendingViz_)
    return 0;

  WaveVizSig sig;
  fillWaveVizSig(sig);
  if (waveVizHaveSent_ && std::memcmp(&sig, &waveVizSent_, sizeof(sig)) == 0)
    return 0;

  const int win = waveRawLen_;
  const int peak = std::clamp(wavePeakIndex_, 1, std::max(1, win - 1));

  int wantPre = 0, wantPost = 0, wantPad = 0, wantWin = 0;
  waveGeomForSpan(sig.spanMs, wantPre, wantPost, wantPad, wantWin);
  (void)wantPad;
  (void)wantWin;

  // Axis is fixed by the Wave knob — never shrink post to the live fill length
  // (that made the time grid jump while the ring grew).
  const int viewPre = std::clamp(wantPre, 1, peak);
  const int viewPost = std::max(1, wantPost);
  const int viewLen = viewPre + viewPost;
  if (viewLen < 2 || peak - viewPre < 0)
    return 0;
  const int viewStart = peak - viewPre;

  const int bins = std::clamp(
    std::min(kWaveBins, viewLen), 64, std::max(64, (maxOut - kHdr) / nCh));
  const int kNeed = kHdr + nCh * bins;
  if (maxOut < kNeed)
    return 0;

  const int preBins =
    std::clamp(static_cast<int>(std::lround(static_cast<double>(viewPre) / (viewLen - 1) * (bins - 1))),
               1, bins - 2);

  out[0] = static_cast<float>(bins);
  out[1] = static_cast<float>(kLanes);
  out[2] = static_cast<float>(preBins);
  out[3] = static_cast<float>(viewPre) * 1000.f / static_cast<float>(sampleRate_);
  out[4] = static_cast<float>(viewPost) * 1000.f / static_cast<float>(sampleRate_);

  const bool bypass = sig.bypass != 0;
  const int anchor = sig.anchor;
  const float anchorDelaySamp =
    bypass
      ? 0.f
      : effectiveLaneDelayMs(anchor) * 0.001f * static_cast<float>(sampleRate_);
  const float scale = static_cast<float>(viewLen - 1) / static_cast<float>(bins - 1);
  const float winLast = static_cast<float>(std::max(0, win - 1));

  auto sampleRaw = [&](const float* src, float srcIdx) -> float {
    // Past the live-filled tail → silence (axis stays full Wave span).
    if (srcIdx < 0.f || srcIdx > winLast)
      return 0.f;
    if (win <= 1)
      return src[0];
    const int i0 = static_cast<int>(srcIdx);
    const float frac = srcIdx - static_cast<float>(i0);
    if (i0 >= win - 1)
      return src[win - 1];
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
      bypass
        ? 0.f
        : effectiveLaneDelayMs(l) * 0.001f * static_cast<float>(sampleRate_) - anchorDelaySamp;
    const float sign = (!bypass && lanes_[l].phase) ? -1.f : 1.f;
    pack(out + kHdr + l * bins, waveRaw_[l], delaySamp, sign);
  }

  const float masterTrimSamp =
    bypass ? 0.f : sig.masterTrimMs * 0.001f * static_cast<float>(sampleRate_);
  pack(out + kHdr + kLanes * bins, waveRawMix_[0], masterTrimSamp, 1.f);
  pack(out + kHdr + (kLanes + 1) * bins, waveRawMix_[1], masterTrimSamp, 1.f);
  pack(out + kHdr + (kLanes + 2) * bins, waveRawRef_[0], 0.f, 1.f);
  pack(out + kHdr + (kLanes + 3) * bins, waveRawRef_[1], 0.f, 1.f);

  waveVizSent_ = sig;
  waveVizHaveSent_ = true;
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
