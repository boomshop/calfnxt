#include "expander_dsp.h"

#include "base/source/fstreamer.h"
#include "channel_mode.h"
#include "detector_routing.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>
#include <cstring>
#include <utility>

namespace calfNXT {
namespace Expander {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5845u; // 'CNXE'
constexpr uint32 kStateVersion = 2; // v2: + channel

constexpr float kHistoryDisplayMs = 10000.f;


/** Inv closes only when louder than main. Equal levels → 0 (main wins). Soft ~6 dB. */
float relativeInhibitDesire(float invLin, float mainLin, float threshDb)
{
  const float thr = Dsp::dbToLin(std::clamp(threshDb, -120.f, 0.f));
  if (!(invLin >= thr))
    return 0.f;
  constexpr float kSoftDb = 6.f;
  const float dom = Dsp::linToDbSafe(invLin) - Dsp::linToDbSafe(mainLin);
  if (dom <= 0.f)
    return 0.f;
  return std::clamp(dom / kSoftDb, 0.f, 1.f);
}



std::pair<float, float> busAt(ProcessData& data, int32 bus, int32 i, float fallbackL,
                              float fallbackR)
{
  if (bus < 0 || bus >= data.numInputs || !data.inputs)
    return {fallbackL, fallbackR};
  if (data.symbolicSampleSize == kSample32)
  {
    const auto& in = data.inputs[bus];
    if (!in.channelBuffers32 || !in.channelBuffers32[0])
      return {fallbackL, fallbackR};
    const float L = in.channelBuffers32[0][i];
    const float R =
      in.numChannels > 1 && in.channelBuffers32[1] ? in.channelBuffers32[1][i] : L;
    return {L, R};
  }
  const auto& in = data.inputs[bus];
  if (!in.channelBuffers64 || !in.channelBuffers64[0])
    return {fallbackL, fallbackR};
  const float L = static_cast<float>(in.channelBuffers64[0][i]);
  const float R = in.numChannels > 1 && in.channelBuffers64[1]
                    ? static_cast<float>(in.channelBuffers64[1][i])
                    : L;
  return {L, R};
}
} // namespace

ExpanderPlugin::ExpanderPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API ExpanderPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoWithSidechainIO();
  addAudioInput(STR16("Inhibit 1"), SpeakerArr::kStereo, kAux, 0);
  addAudioInput(STR16("Inhibit 2"), SpeakerArr::kStereo, kAux, 0);
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

void ExpanderPlugin::resetProcessing()
{
  gx_.setSampleRate(static_cast<float>(sampleRate_));
  gx_.reset();
  sc_.setSampleRate(static_cast<float>(sampleRate_));
  sc_.reset();
  for (int i = 0; i < kInhibitCount; ++i)
  {
    invSc_[i].setSampleRate(static_cast<float>(sampleRate_));
    invSc_[i].reset();
    invEnv_[i].reset();
    invAmount_[i] = 0.f;
    invPeakLin_[i] = 0.f;
    invPeakHold_[i] = 0.f;
  }
  detPeakHold_ = 0.f;
  grMeter_.reset(static_cast<float>(sampleRate_));
  pointInDbPlain_ = -96.f;
  pointOutDbPlain_ = -96.f;
  pointInDb_.store(-96.f, std::memory_order_relaxed);
  pointOutDb_.store(-96.f, std::memory_order_relaxed);

  std::memset(histBuf_, 0, sizeof(histBuf_));
  histPos_ = 0;
  histSampleCount_ = 0;
  histSamplesPerSlot_ = 1;
  histVisibleSlots_ = 160;
  histLock_.beginWrite();
  std::memset(histSnapshot_, 0, sizeof(histSnapshot_));
  histSnapshotPos_ = 0;
  histSnapshotSampleCount_ = 0;
  histSnapshotSamplesPerSlot_ = 1;
  histLock_.endWrite();
  bypassSmooth_ = 1.f;
}

tresult PLUGIN_API ExpanderPlugin::setActive(TBool state)
{
  if (state)
    resetProcessing();
  return EffectBase::setActive(state);
}

tresult PLUGIN_API ExpanderPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  resetProcessing();
  return EffectBase::setupProcessing(newSetup);
}

ExpanderPlugin::BlockState ExpanderPlugin::makeBlockState() const
{
  BlockState state;
  state.bypass = params_[kParamBypass] >= 0.5f;
  state.listen = params_[kParamListen] >= 0.5f;
  state.sidechainActive = params_[kParamSidechainActive] >= 0.5f;
  state.link = Dsp::stereoLinkFromPlain(params_[kParamLink]);
  state.channel = Dsp::channelModeFromPlain(params_[kParamChannel]);

  const ParamID activeId[kInhibitCount] = {kParamInv1Active, kParamInv2Active};
  const ParamID listenId[kInhibitCount] = {kParamInv1Listen, kParamInv2Listen};
  const ParamID gainId[kInhibitCount] = {kParamInv1Gain, kParamInv2Gain};
  const ParamID threshId[kInhibitCount] = {kParamInv1Threshold, kParamInv2Threshold};
  const ParamID holdId[kInhibitCount] = {kParamInv1Hold, kParamInv2Hold};
  const ParamID releaseId[kInhibitCount] = {kParamInv1Release, kParamInv2Release};

  for (int i = 0; i < kInhibitCount; ++i)
  {
    state.invActive[i] = params_[activeId[i]] >= 0.5f;
    state.invListen[i] = params_[listenId[i]] >= 0.5f;
    state.invGainLin[i] = Dsp::dbToLin(params_[gainId[i]]);
    state.invThreshDb[i] = params_[threshId[i]];
    state.invHoldMs[i] = params_[holdId[i]];
    state.invReleaseMs[i] = params_[releaseId[i]];
  }
  return state;
}

void ExpanderPlugin::histFeedSample(float triggerLin, float grLin,
                                    float outPeakLin, float threshLin)
{
  if (!vizConsumerActive())
    return;
  const int pos = histPos_;
  histBuf_[pos + 0] = std::max(triggerLin, histBuf_[pos + 0]);
  if (histBuf_[pos + 1] <= 0.f)
    histBuf_[pos + 1] = grLin;
  else
    histBuf_[pos + 1] = std::min(grLin, histBuf_[pos + 1]);
  histBuf_[pos + 2] = std::max(outPeakLin, histBuf_[pos + 2]);
  histBuf_[pos + 3] = threshLin;
  histBuf_[pos + 4] = std::max(invAmount_[0], histBuf_[pos + 4]);
  histBuf_[pos + 5] = std::max(invAmount_[1], histBuf_[pos + 5]);
  histBuf_[pos + 6] = std::max(invPeakLin_[0], histBuf_[pos + 6]);
  histBuf_[pos + 7] = std::max(invPeakLin_[1], histBuf_[pos + 7]);

  histSampleCount_ += 1;
  if (histSampleCount_ >= histSamplesPerSlot_)
  {
    histPos_ = (pos + kHistChannels) % kHistBufSize;
    histSampleCount_ = 0;
    histBuf_[histPos_ + 0] = triggerLin;
    histBuf_[histPos_ + 1] = grLin;
    histBuf_[histPos_ + 2] = outPeakLin;
    histBuf_[histPos_ + 3] = threshLin;
    histBuf_[histPos_ + 4] = invAmount_[0];
    histBuf_[histPos_ + 5] = invAmount_[1];
    histBuf_[histPos_ + 6] = invPeakLin_[0];
    histBuf_[histPos_ + 7] = invPeakLin_[1];
  }
}

void ExpanderPlugin::publishHistSnapshot()
{
  if (!vizConsumerActive())
    return;
  histLock_.beginWrite();
  std::memcpy(histSnapshot_, histBuf_, sizeof(histBuf_));
  histSnapshotPos_ = histPos_;
  histSnapshotSampleCount_ = histSampleCount_;
  histSnapshotSamplesPerSlot_ = histSamplesPerSlot_;
  histLock_.endWrite();
}

void ExpanderPlugin::publishDynamicsPoint()
{
  pointInDb_.store(pointInDbPlain_, std::memory_order_relaxed);
  pointOutDb_.store(pointOutDbPlain_, std::memory_order_relaxed);
}

void ExpanderPlugin::processSample(const BlockState& state, float& L, float& R, float scL,
                                   float scR, float inv1L, float inv1R, float inv2L,
                                   float inv2R)
{
  const float dryL = L;
  const float dryR = R;
  const float sr = static_cast<float>(sampleRate_);
  const float threshLin = Dsp::dbToLin(params_[kParamThreshold]);
  const auto dryProcessedPeak = [&]() -> float {
    return Dsp::channelAbsPeak(state.channel, dryL, dryR);
  };

  // Main open-detector first — relative inhibit compares against this.
  // Channel selects detector feed (and GR path below); Link applies in Stereo.
  float detL = 0.f;
  float detR = 0.f;
  Dsp::processDetectorStereo(sc_, state.channel, state.link, scL, scR, detL, detR);
  const float mainPeak = std::max(std::fabs(detL), std::fabs(detR));
  const float detPeak = mainPeak;
  if (mainPeak > detPeakHold_)
    detPeakHold_ = mainPeak;

  const float invInL[kInhibitCount] = {inv1L, inv2L};
  const float invInR[kInhibitCount] = {inv1R, inv2R};
  float invDetL[kInhibitCount] {};
  float invDetR[kInhibitCount] {};
  float inhibitCombined = 0.f;

  for (int i = 0; i < kInhibitCount; ++i)
  {
    // Always filter when armed or listening so Listen can tune before arming.
    if (!state.invActive[i] && !state.invListen[i])
    {
      invEnv_[i].reset();
      invAmount_[i] = 0.f;
      invPeakLin_[i] = 0.f;
      continue;
    }

    const float g = state.invGainLin[i];
    float iL = invInL[i] * g;
    float iR = invInR[i] * g;
    iL = invSc_[i].processChannel(0, iL);
    iR = invSc_[i].processChannel(1, iR);
    invDetL[i] = iL;
    invDetR[i] = iR;
    const float peak = std::max(std::fabs(iL), std::fabs(iR));
    invPeakLin_[i] = peak;
    if (peak > invPeakHold_[i])
      invPeakHold_[i] = peak;

    if (state.invActive[i])
    {
      // Absolute thresh arms the key; relative vs main decides who wins:
      // main↑ inv↓ → open; main↓ inv↑ → close; both↑ → open.
      const float desire =
        relativeInhibitDesire(peak, mainPeak, state.invThreshDb[i]);
      invAmount_[i] =
        invEnv_[i].processDesire(desire, state.invHoldMs[i], state.invReleaseMs[i], sr);
      inhibitCombined = std::max(inhibitCombined, invAmount_[i]);
    }
    else
    {
      invEnv_[i].reset();
      invAmount_[i] = 0.f;
    }
  }

  // Exclusive listen: Inv1 > Inv2 > main sidechain detector.
  if (!state.bypass)
  {
    for (int i = 0; i < kInhibitCount; ++i)
    {
      if (state.invListen[i])
      {
        L = invDetL[i];
        R = invDetR[i];
        const float gr = gx_.processDetector(detL, detR);
        grMeter_.process(gr);
        histFeedSample(detPeak, gr, dryProcessedPeak() * gr, threshLin);
        return;
      }
    }
  }

  if (state.listen && !state.bypass)
  {
    Dsp::listenImage(state.channel, detL, detR, L, R);
    const float gr = gx_.processDetector(detL, detR);
    grMeter_.process(gr);
    histFeedSample(detPeak, gr, dryProcessedPeak() * gr, threshLin);
    return;
  }

  float gr = gx_.processDetector(detL, detR);
  // Transfer-chart point follows the expander law only (stays on the curve).
  // Inhibit can pull GR deeper than the law — that belongs on GR meter / Block /
  // and the Inv1/Inv2 history traces, not as a floating off-curve operating point.
  const float grLaw = gr;
  if (inhibitCombined > 0.f)
  {
    const float closed = Dsp::dbToLin(params_[kParamRange]);
    const float forced = 1.f + inhibitCombined * (closed - 1.f);
    gr = std::min(gr, forced);
  }

  const float det = gx_.lastDetectorLin();

  const float bypassTarget = state.bypass ? 0.f : 1.f;
  bypassSmooth_ = Dsp::slewToward(
    bypassSmooth_, bypassTarget,
    Dsp::bypassFadeCoeff(static_cast<float>(sampleRate_)));

  if (bypassSmooth_ <= 0.f)
  {
    L = dryL;
    R = dryR;
    grMeter_.forceZero();
    histFeedSample(detPeak, 1.f, dryProcessedPeak(), threshLin);
    const float inDb = Dsp::linToDbSafe(det);
    pointInDbPlain_ = inDb;
    pointOutDbPlain_ = inDb;
    return;
  }

  grMeter_.process(gr);
  histFeedSample(detPeak, gr, dryProcessedPeak() * gr, threshLin);

  const float inDb = Dsp::linToDbSafe(det);
  const float grLawDb = Dsp::linToDbSafe(grLaw);
  pointInDbPlain_ = inDb;
  pointOutDbPlain_ = inDb + grLawDb;

  L = dryL * gr;
  R = dryR * gr;
  switch (state.channel)
  {
    case Dsp::ChannelMode::Left:
      L = dryL * gr;
      R = dryR;
      break;
    case Dsp::ChannelMode::Right:
      L = dryL;
      R = dryR * gr;
      break;
    case Dsp::ChannelMode::Mid:
    {
      float mid = 0.f;
      float side = 0.f;
      Dsp::encodeMs(dryL, dryR, mid, side);
      mid *= gr;
      Dsp::decodeMs(mid, side, L, R);
      break;
    }
    case Dsp::ChannelMode::Side:
    {
      float mid = 0.f;
      float side = 0.f;
      Dsp::encodeMs(dryL, dryR, mid, side);
      side *= gr;
      Dsp::decodeMs(mid, side, L, R);
      break;
    }
    case Dsp::ChannelMode::Stereo:
    default:
      break;
  }

  if (bypassSmooth_ < 1.f)
  {
    L = bypassSmooth_ * L + (1.f - bypassSmooth_) * dryL;
    R = bypassSmooth_ * R + (1.f - bypassSmooth_) * dryR;
  }
}

int ExpanderPlugin::takeGainReductionDb(float* out, int maxOut)
{
  if (!out || maxOut < 1)
    return 0;
  out[0] = grMeter_.takeDb();
  return 1;
}

int ExpanderPlugin::takeLfoActivity(float* out, int maxOut)
{
  // [inv1Amt, inv2Amt, inv1PeakUnit, inv2PeakUnit, detPeakUnit]
  // amt = hold desire 0…1; peak unit maps post-filter −60…0 dBFS → 0…1.
  if (!out || maxOut < 5)
    return 0;
  auto peakToUnit = [](float lin) {
    const float db = lin > 1e-12f ? 20.f * std::log10(lin) : -96.f;
    return std::clamp((db + 60.f) / 60.f, 0.f, 1.f);
  };
  out[0] = invAmount_[0];
  out[1] = invAmount_[1];
  out[2] = peakToUnit(invPeakHold_[0]);
  out[3] = peakToUnit(invPeakHold_[1]);
  out[4] = peakToUnit(detPeakHold_);
  invPeakHold_[0] = 0.f;
  invPeakHold_[1] = 0.f;
  detPeakHold_ = 0.f;
  return 5;
}

int ExpanderPlugin::takeDynamicsPoint(float* out, int maxOut)
{
  if (!out || maxOut < 2)
    return 0;
  out[0] = pointInDb_.load(std::memory_order_relaxed);
  out[1] = pointOutDb_.load(std::memory_order_relaxed);
  return 2;
}

int ExpanderPlugin::takeEnvelopeDisplay(float* out, int maxOut)
{
  const int slots = std::max(kHistMinSlots, std::min(kHistSlots, histVisibleSlots_));
  const int outCount = slots * kHistChannels;
  if (maxOut < outCount + 1)
    return 0;

  float phase = 0.f;
  // Seqlock read: retry while the audio thread is mid-publish.
  for (int attempt = 0; attempt < 8; ++attempt)
  {
    uint32_t s0 = 0;
    if (!histLock_.tryBeginRead(s0))
      continue; // write in progress
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
      out[i * kHistChannels + 2] = std::fabs(histSnapshot_[srcIdx + 2]);
      float thr = histSnapshot_[srcIdx + 3];
      if (!(thr > 0.f))
        thr = 1.0e-6f;
      out[i * kHistChannels + 3] = std::clamp(thr, 1.0e-6f, 1.f);
      out[i * kHistChannels + 4] =
        std::clamp(histSnapshot_[srcIdx + 4], 0.f, 1.f);
      out[i * kHistChannels + 5] =
        std::clamp(histSnapshot_[srcIdx + 5], 0.f, 1.f);
      out[i * kHistChannels + 6] = std::fabs(histSnapshot_[srcIdx + 6]);
      out[i * kHistChannels + 7] = std::fabs(histSnapshot_[srcIdx + 7]);
    }
    if (histLock_.tryEndRead(s0))
    {
      out[outCount] = std::clamp(phase, 0.f, 1.f);
      return outCount + 1;
    }
  }
  return 0; // contended; skip this frame
}

void ExpanderPlugin::configureVizBins(const char* id, int bins)
{
  if (!id || std::strcmp(id, vizEnvelopeId()) != 0)
    return;
  histVisibleSlots_ = std::max(kHistMinSlots, std::min(kHistSlots, bins));
}

tresult PLUGIN_API ExpanderPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);

  const auto mode = Dsp::detectorModeFromPlain(params_[kParamMode]);
  const auto link = Dsp::stereoLinkFromPlain(params_[kParamLink]);

  sc_.setSampleRate(static_cast<float>(sampleRate_));
  sc_.setParams(
    params_[kParamHipass],
    params_[kParamLopass],
    Dsp::filterModeToStages(params_[kParamHpMode]),
    Dsp::filterModeToStages(params_[kParamLpMode]));

  const ParamID invHp[kInhibitCount] = {kParamInv1Hipass, kParamInv2Hipass};
  const ParamID invLp[kInhibitCount] = {kParamInv1Lopass, kParamInv2Lopass};
  const ParamID invHpMode[kInhibitCount] = {kParamInv1HpMode, kParamInv2HpMode};
  const ParamID invLpMode[kInhibitCount] = {kParamInv1LpMode, kParamInv2LpMode};
  for (int i = 0; i < kInhibitCount; ++i)
  {
    invSc_[i].setSampleRate(static_cast<float>(sampleRate_));
    invSc_[i].setParams(
      params_[invHp[i]],
      params_[invLp[i]],
      Dsp::filterModeToStages(params_[invHpMode[i]]),
      Dsp::filterModeToStages(params_[invLpMode[i]]));
  }

  const float openThresh = params_[kParamThreshold];
  const bool relThreshActive = params_[kParamRelThreshActive] >= 0.5f;
  const float relThresh =
    std::min(relThreshActive ? params_[kParamReleaseThreshold] : params_[kParamThreshold],
             openThresh);

  gx_.setSampleRate(static_cast<float>(sampleRate_));
  gx_.setParams(
    params_[kParamAttack],
    params_[kParamRelease],
    params_[kParamHold],
    openThresh,
    relThresh,
    params_[kParamRatio],
    params_[kParamKnee],
    params_[kParamRange],
    mode,
    link);

  const BlockState state = makeBlockState();

  const int slots = std::max(kHistMinSlots, std::min(kHistSlots, histVisibleSlots_));
  histSamplesPerSlot_ = std::max(
    1, static_cast<int>(sampleRate_ * kHistoryDisplayMs * 0.001f / static_cast<float>(slots)));

  io_.setBypassGains(state.bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  const bool wantExtSc = state.sidechainActive && data.numInputs >= 2;
  const bool scBusActive = wantExtSc && isAudioInputActive(1);
  const bool inv1WantBus =
    (state.invActive[0] || state.invListen[0]) && data.numInputs >= 3
    && isAudioInputActive(2);
  const bool inv2WantBus =
    (state.invActive[1] || state.invListen[1]) && data.numInputs >= 4
    && isAudioInputActive(3);
  const bool anyInvWork =
    state.invActive[0] || state.invActive[1] || state.invListen[0]
    || state.invListen[1];

  auto sidechainAt = [&](int32 i, float mainL, float mainR) {
    if (!scBusActive)
      return std::pair<float, float>(mainL, mainR);
    return busAt(data, 1, i, mainL, mainR);
  };

  auto inhibitAt = [&](int slot, int32 i) -> std::pair<float, float> {
    const int bus = 2 + slot;
    const bool active = slot == 0 ? inv1WantBus : inv2WantBus;
    if (!active)
      return {0.f, 0.f};
    return busAt(data, bus, i, 0.f, 0.f);
  };

  const bool hasHostAudio = io_.begin(data);
  const bool quietIn = !hasHostAudio || io_.inputWasQuiet();

  // Idle only when main is quiet, expansion settled, and no key/inhibit work.
  if (quietIn && gx_.isIdle() && !scBusActive && !anyInvWork)
  {
    grMeter_.forceZero();
    invAmount_[0] = 0.f;
    invAmount_[1] = 0.f;
    invPeakLin_[0] = 0.f;
    invPeakLin_[1] = 0.f;
    invPeakHold_[0] = 0.f;
    invPeakHold_[1] = 0.f;
    detPeakHold_ = 0.f;
    if (hasHostAudio)
    {
      const int32 n = data.numSamples;
      for (int32 i = 0; i < n; ++i)
        histFeedSample(0.f, 1.f, 0.f, Dsp::dbToLin(params_[kParamThreshold]));
    }
    publishHistSnapshot();
    publishDynamicsPoint();
    if (hasHostAudio)
      io_.end(data);
    return kResultOk;
  }

  const int32 nFrames = data.numSamples;

  auto runFrame = [&](int32 i, float& L, float& R) {
    const auto [scL, scR] = sidechainAt(i, L, R);
    const auto [i1L, i1R] = inhibitAt(0, i);
    const auto [i2L, i2R] = inhibitAt(1, i);
    processSample(state, L, R, scL, scR, i1L, i1R, i2L, i2R);
  };

  if (!hasHostAudio)
  {
    data.outputs[0].silenceFlags = 0;
    auto drain = [&](auto** out, int32 nCh) {
      const bool canWrite = out && (nCh <= 0 || out[0]) && (nCh <= 1 || out[1]);
      for (int32 i = 0; i < nFrames; ++i)
      {
        float L = 0.f;
        float R = 0.f;
        runFrame(i, L, R);
        if (canWrite && nCh > 0)
          out[0][i] = L;
        if (canWrite && nCh > 1)
          out[1][i] = R;
      }
    };
    if (data.symbolicSampleSize == kSample32)
      drain(data.outputs[0].channelBuffers32, data.outputs[0].numChannels);
    else
      drain(data.outputs[0].channelBuffers64, data.outputs[0].numChannels);
    publishHistSnapshot();
    publishDynamicsPoint();
    if (data.outputs[0].channelBuffers32 || data.outputs[0].channelBuffers64)
      io_.end(data);
    return kResultOk;
  }

  if (data.symbolicSampleSize == kSample32)
  {
    auto** out = data.outputs[0].channelBuffers32;
    const int32 nCh = data.outputs[0].numChannels;
    for (int32 i = 0; i < nFrames; ++i)
    {
      float L = nCh > 0 ? out[0][i] : 0.f;
      float R = nCh > 1 ? out[1][i] : L;
      runFrame(i, L, R);
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
      runFrame(i, L, R);
      if (nCh > 0)
        out[0][i] = L;
      if (nCh > 1)
        out[1][i] = R;
    }
  }

  publishHistSnapshot();
  publishDynamicsPoint();
  sc_.sanitize();
  for (int i = 0; i < kInhibitCount; ++i)
    invSc_[i].sanitize();
  io_.end(data);
  return kResultOk;
}

tresult PLUGIN_API ExpanderPlugin::setState(IBStream* state)
{
  if (!state)
    return kResultFalse;
  IBStreamer streamer(state, kLittleEndian);

  uint32 magic = 0;
  uint32 version = 0;
  int32 count = 0;
  if (!streamer.readInt32u(magic) || magic != kStateMagic)
    return kResultFalse;
  if (!streamer.readInt32u(version) || version != kStateVersion)
    return kResultFalse;
  // Append-only params: older saves may have fewer plains.
  if (!streamer.readInt32(count) || count <= 0 || count > kParamCount)
    return kResultFalse;

  float plains[kParamCount];
  for (int i = 0; i < kParamCount; ++i)
  {
    if (auto* p = getParameterObject(static_cast<ParamID>(i)))
      plains[i] = static_cast<float>(p->toPlain(p->getNormalized()));
    else
      plains[i] = 0.f;
  }
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
  return kResultOk;
}

tresult PLUGIN_API ExpanderPlugin::getState(IBStream* state)
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

} // namespace Expander
} // namespace calfNXT
