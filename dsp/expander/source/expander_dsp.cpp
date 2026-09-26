#include "expander_dsp.h"

#include "base/source/fstreamer.h"
#include "channel_mode.h"
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

float linToDbSafe(float lin)
{
  if (!(lin > 1.0e-12f))
    return -96.f;
  return 20.f * std::log10(lin);
}

/** Inv closes only when louder than main. Equal levels → 0 (main wins). Soft ~6 dB. */
float relativeInhibitDesire(float invLin, float mainLin, float threshDb)
{
  const float thr = Dsp::dbToLin(std::clamp(threshDb, -120.f, 0.f));
  if (!(invLin >= thr))
    return 0.f;
  constexpr float kSoftDb = 6.f;
  const float dom = linToDbSafe(invLin) - linToDbSafe(mainLin);
  if (dom <= 0.f)
    return 0.f;
  return std::clamp(dom / kSoftDb, 0.f, 1.f);
}

Dsp::DetectorMode detectorModeFromPlain(float v)
{
  switch (static_cast<int>(std::lround(std::clamp(v, 0.f, 2.f))))
  {
    case 1:
      return Dsp::DetectorMode::Rms;
    case 2:
      return Dsp::DetectorMode::Opto;
    default:
      return Dsp::DetectorMode::Peak;
  }
}

Dsp::StereoLink stereoLinkFromPlain(float v)
{
  switch (static_cast<int>(std::lround(std::clamp(v, 0.f, 2.f))))
  {
    case 1:
      return Dsp::StereoLink::Average;
    case 2:
      return Dsp::StereoLink::Mid;
    default:
      return Dsp::StereoLink::Max;
  }
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
  }
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
  histSeq_.fetch_add(1, std::memory_order_release); // odd: write in progress
  std::memset(histSnapshot_, 0, sizeof(histSnapshot_));
  histSnapshotPos_ = 0;
  histSnapshotSampleCount_ = 0;
  histSnapshotSamplesPerSlot_ = 1;
  histSeq_.fetch_add(1, std::memory_order_release); // even: stable
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
  state.link = stereoLinkFromPlain(params_[kParamLink]);
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

void ExpanderPlugin::histFeedSample(float audioPeakLin, float detPeakLin, float grLin,
                                    float inhibitLin)
{
  if (!vizConsumerActive())
    return;
  const int pos = histPos_;
  histBuf_[pos + 0] = std::max(audioPeakLin, histBuf_[pos + 0]);
  histBuf_[pos + 1] = std::max(detPeakLin, histBuf_[pos + 1]);
  if (histBuf_[pos + 2] <= 0.f)
    histBuf_[pos + 2] = grLin;
  else
    histBuf_[pos + 2] = std::min(grLin, histBuf_[pos + 2]);
  histBuf_[pos + 3] = std::max(inhibitLin, histBuf_[pos + 3]);

  histSampleCount_ += 1;
  if (histSampleCount_ >= histSamplesPerSlot_)
  {
    histPos_ = (pos + kHistChannels) % kHistBufSize;
    histSampleCount_ = 0;
    histBuf_[histPos_ + 0] = audioPeakLin;
    histBuf_[histPos_ + 1] = detPeakLin;
    histBuf_[histPos_ + 2] = grLin;
    histBuf_[histPos_ + 3] = inhibitLin;
  }
}

void ExpanderPlugin::publishHistSnapshot()
{
  if (!vizConsumerActive())
    return;
  histSeq_.fetch_add(1, std::memory_order_release); // odd: write in progress
  std::memcpy(histSnapshot_, histBuf_, sizeof(histBuf_));
  histSnapshotPos_ = histPos_;
  histSnapshotSampleCount_ = histSampleCount_;
  histSnapshotSamplesPerSlot_ = histSamplesPerSlot_;
  histSeq_.fetch_add(1, std::memory_order_release); // even: stable
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
  const float audioPeak = std::max(std::fabs(dryL), std::fabs(dryR));
  const float sr = static_cast<float>(sampleRate_);

  // Main open-detector first — relative inhibit compares against this.
  // Channel selects detector feed (and GR path below); Link applies in Stereo.
  float detL = 0.f;
  float detR = 0.f;
  switch (state.channel)
  {
    case Dsp::ChannelMode::Left:
    {
      const float x = sc_.processChannel(0, scL);
      (void)sc_.processChannel(1, scR);
      detL = x;
      detR = x;
      break;
    }
    case Dsp::ChannelMode::Right:
    {
      (void)sc_.processChannel(0, scL);
      const float x = sc_.processChannel(1, scR);
      detL = x;
      detR = x;
      break;
    }
    case Dsp::ChannelMode::Mid:
    {
      float mid = 0.f;
      float side = 0.f;
      Dsp::encodeMs(scL, scR, mid, side);
      (void)side;
      const float x = sc_.processMono(mid);
      detL = x;
      detR = x;
      break;
    }
    case Dsp::ChannelMode::Side:
    {
      float mid = 0.f;
      float side = 0.f;
      Dsp::encodeMs(scL, scR, mid, side);
      (void)mid;
      const float x = sc_.processMono(side);
      detL = x;
      detR = x;
      break;
    }
    case Dsp::ChannelMode::Stereo:
    default:
      if (state.link == Dsp::StereoLink::Mid)
      {
        const float mid = sc_.processMono(0.5f * (scL + scR));
        detL = mid;
        detR = mid;
      }
      else
      {
        detL = sc_.processChannel(0, scL);
        detR = sc_.processChannel(1, scR);
      }
      break;
  }
  const float mainPeak = std::max(std::fabs(detL), std::fabs(detR));
  const float detPeak = mainPeak;

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
      continue;
    }

    const float g = state.invGainLin[i];
    float iL = invInL[i] * g;
    float iR = invInR[i] * g;
    iL = invSc_[i].processChannel(0, iL);
    iR = invSc_[i].processChannel(1, iR);
    invDetL[i] = iL;
    invDetR[i] = iR;

    if (state.invActive[i])
    {
      const float invPeak = std::max(std::fabs(iL), std::fabs(iR));
      // Absolute thresh arms the key; relative vs main decides who wins:
      // main↑ inv↓ → open; main↓ inv↑ → close; both↑ → open.
      const float desire =
        relativeInhibitDesire(invPeak, mainPeak, state.invThreshDb[i]);
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
        histFeedSample(audioPeak, detPeak, gr, inhibitCombined);
        return;
      }
    }
  }

  if (state.listen && !state.bypass)
  {
    L = detL;
    R = detR;
    const float gr = gx_.processDetector(detL, detR);
    grMeter_.process(gr);
    histFeedSample(audioPeak, detPeak, gr, inhibitCombined);
    return;
  }

  if (state.bypass)
  {
    gx_.processDetector(detL, detR);
    grMeter_.forceZero();
    histFeedSample(audioPeak, detPeak, 1.f, inhibitCombined);
    const float inDb = linToDbSafe(gx_.lastDetectorLin());
    pointInDbPlain_ = inDb;
    pointOutDbPlain_ = inDb;
    return;
  }

  float gr = gx_.processDetector(detL, detR);
  // Transfer-chart point follows the expander law only (stays on the curve).
  // Inhibit can pull GR deeper than the law — that belongs on GR meter / Block /
  // dashed history, not as a floating off-curve operating point.
  const float grLaw = gr;
  if (inhibitCombined > 0.f)
  {
    const float closed = Dsp::dbToLin(params_[kParamRange]);
    const float forced = 1.f + inhibitCombined * (closed - 1.f);
    gr = std::min(gr, forced);
  }

  const float det = gx_.lastDetectorLin();
  grMeter_.process(gr);
  histFeedSample(audioPeak, detPeak, gr, inhibitCombined);

  const float inDb = linToDbSafe(det);
  const float grLawDb = linToDbSafe(grLaw);
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
  if (!out || maxOut < 2)
    return 0;
  out[0] = invAmount_[0];
  out[1] = invAmount_[1];
  return 2;
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
    const uint32_t s0 = histSeq_.load(std::memory_order_acquire);
    if (s0 & 1u)
      continue; // write in progress
    const int startPos =
      (kHistBufSize + histSnapshotPos_ - (slots - 1) * kHistChannels) % kHistBufSize;
    const int sps = std::max(1, histSnapshotSamplesPerSlot_);
    phase = static_cast<float>(histSnapshotSampleCount_) / static_cast<float>(sps);
    for (int i = 0; i < slots; ++i)
    {
      const int srcIdx = (startPos + i * kHistChannels) % kHistBufSize;
      out[i * kHistChannels + 0] = std::fabs(histSnapshot_[srcIdx + 0]);
      out[i * kHistChannels + 1] = std::fabs(histSnapshot_[srcIdx + 1]);
      float gr = histSnapshot_[srcIdx + 2];
      if (!(gr > 0.f))
        gr = 1.f;
      out[i * kHistChannels + 2] = std::clamp(gr, 1.0e-6f, 1.f);
      out[i * kHistChannels + 3] =
        std::clamp(std::fabs(histSnapshot_[srcIdx + 3]), 0.f, 1.f);
    }
    const uint32_t s1 = histSeq_.load(std::memory_order_acquire);
    if (s0 == s1)
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

  const auto mode = detectorModeFromPlain(params_[kParamMode]);
  const auto link = stereoLinkFromPlain(params_[kParamLink]);

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
    if (hasHostAudio)
    {
      const int32 n = data.numSamples;
      for (int32 i = 0; i < n; ++i)
        histFeedSample(0.f, 0.f, 1.f, 0.f);
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
