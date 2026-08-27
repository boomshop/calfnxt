#include "transients_dsp.h"

#include "base/source/fstreamer.h"

#include "gain_util.h"

#include <algorithm>
#include <cmath>
#include <vector>

namespace calfNXT {
namespace Transients {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5854u; // 'CNXT'
/** v2: had display window. v3: display removed; + soft_clip/link/sensitivity/delta.
 *  v4: sensitivity = rise threshold (dB), not level gate. */
constexpr uint32 kStateVersion = 4;
constexpr uint32 kStateVersionWithDisplay = 2;
/** Fixed envelope plot window (ms) — keep in sync with EnvelopeChart. */
constexpr float kEnvelopeWindowMs = 10000.f;

/**
 * Soft ceiling into ±1: unity below the knee, no quiet-signal makeup.
 * @p amount 0 = off; 1 = knee ~ −6 dBFS, asymptotic into full scale.
 */
float softClipSample(float x, float amount)
{
  if (!(amount > 1.0e-6f))
    return x;
  constexpr float kCeiling = 1.f;
  const float knee = kCeiling * (1.f - 0.5f * std::clamp(amount, 0.f, 1.f));
  const float ax = std::fabs(x);
  if (ax <= knee)
    return x;
  const float room = std::max(1.0e-6f, kCeiling - knee);
  const float shaped = knee + room * std::tanh((ax - knee) / room);
  return std::copysign(std::min(shaped, kCeiling), x);
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
} // namespace

TransientsPlugin::TransientsPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API TransientsPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

void TransientsPlugin::resetProcessing()
{
  transients_.setChannels(2);
  transients_.setSampleRate(sampleRate_);
  transients_.resetState();
  sc_.setSampleRate(static_cast<float>(sampleRate_));
  sc_.reset();

  std::memset(envBuf_, 0, sizeof(envBuf_));
  envPos_ = 0;
  envSampleCount_ = 0;
  envSamplesPerSlot_ = 1;
  envSlotMaxDry_ = 0.f;
  envSlotMaxFilt_ = 0.f;
  envSlotMaxWet_ = 0.f;
  envSlotMaxBoost_ = 1.f;
  envSlotMinCut_ = 1.f;
  envSlotMaxEnv_ = 0.f;
  envSlotMaxAtt_ = 0.f;
  envSlotMaxRel_ = 0.f;
  {
    std::lock_guard<std::mutex> lock(envMutex_);
    std::memset(envSnapshot_, 0, sizeof(envSnapshot_));
    envSnapshotPos_ = 0;
    envSnapshotSampleCount_ = 0;
    envSnapshotSamplesPerSlot_ = 1;
  }
}

tresult PLUGIN_API TransientsPlugin::setActive(TBool state)
{
  if (state)
  {
    resetProcessing();
    updateLatency(
      params_[kParamBypass] >= 0.5f,
      static_cast<int>(std::lround(std::clamp(params_[kParamLookahead], 0.f, 100.f))));
  }
  return EffectBase::setActive(state);
}

tresult PLUGIN_API TransientsPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  resetProcessing();
  return EffectBase::setupProcessing(newSetup);
}

void TransientsPlugin::updateLatency(bool bypass, int lookaheadSamples)
{
  const uint32 want =
    bypass ? 0u : static_cast<uint32>(std::clamp(lookaheadSamples, 0, Dsp::Transients::kMaxLookaheadSamples));
  if (want == latencySamples_)
    return;
  latencySamples_ = want;
  if (componentHandler)
    componentHandler->restartComponent(kLatencyChanged);
}

TransientsPlugin::BlockState TransientsPlugin::makeBlockState() const
{
  BlockState state;
  state.mix = std::clamp(params_[kParamMix], 0.f, 1.f);
  state.dry = 1.f - state.mix;
  state.softClip = std::clamp(params_[kParamSoftClip], 0.f, 1.f);
  state.listen = params_[kParamListen] >= 0.5f;
  state.delta = params_[kParamDelta] >= 0.5f;
  state.bypass = params_[kParamBypass] >= 0.5f;
  state.neutral = transients_.isNeutral();
  state.link = stereoLinkFromPlain(params_[kParamLink]);
  return state;
}

void TransientsPlugin::resetEnvSlotAccum(float dryPeak, float filteredPeak, float wetPeak,
                                         float scale, float env, float att, float rel)
{
  envSlotMaxDry_ = dryPeak;
  envSlotMaxFilt_ = filteredPeak;
  envSlotMaxWet_ = wetPeak;
  envSlotMaxBoost_ = std::max(1.f, scale);
  envSlotMinCut_ = std::min(1.f, scale);
  envSlotMaxEnv_ = env;
  envSlotMaxAtt_ = att;
  envSlotMaxRel_ = rel;
}

void TransientsPlugin::envBufFeedSample(float dryPeak, float filteredPeak, float wetPeak,
                                        float scale)
{
  const int pos = envPos_;
  const float env = transients_.envelope();
  const float att = transients_.attack();
  const float rel = transients_.release();

  envSlotMaxDry_ = std::max(dryPeak, envSlotMaxDry_);
  envSlotMaxFilt_ = std::max(filteredPeak, envSlotMaxFilt_);
  envSlotMaxWet_ = std::max(wetPeak, envSlotMaxWet_);
  envSlotMaxBoost_ = std::max(envSlotMaxBoost_, std::max(1.f, scale));
  envSlotMinCut_ = std::min(envSlotMinCut_, std::min(1.f, scale));
  envSlotMaxEnv_ = std::max(env, envSlotMaxEnv_);
  envSlotMaxAtt_ = std::max(att, envSlotMaxAtt_);
  envSlotMaxRel_ = std::max(rel, envSlotMaxRel_);

  // Coarse history slots (~tens of ms): peak(|wet|) often equals peak(|dry|) because
  // attack boost lands on the quieter rising edge while the sample-peak sits at gain≈1.
  // Combine slot peak dry with max boost / min cut so Output separates from Original.
  float outDisp = envSlotMaxWet_;
  if (envSlotMaxBoost_ > 1.001f)
    outDisp = std::max(outDisp, envSlotMaxDry_ * envSlotMaxBoost_);
  else if (envSlotMinCut_ < 0.999f)
    outDisp = std::min(outDisp, envSlotMaxDry_ * envSlotMinCut_);

  envBuf_[pos + 0] = envSlotMaxDry_;
  envBuf_[pos + 1] = envSlotMaxFilt_;
  envBuf_[pos + 2] = outDisp;
  envBuf_[pos + 3] = envSlotMaxEnv_;
  envBuf_[pos + 4] = envSlotMaxAtt_;
  envBuf_[pos + 5] = envSlotMaxRel_;

  envSampleCount_ += 1;
  if (envSampleCount_ >= envSamplesPerSlot_)
  {
    envPos_ = (pos + kEnvChannels) % kEnvBufSize;
    envSampleCount_ = 0;
    resetEnvSlotAccum(dryPeak, filteredPeak, wetPeak, scale, env, att, rel);
    envBuf_[envPos_ + 0] = envSlotMaxDry_;
    envBuf_[envPos_ + 1] = envSlotMaxFilt_;
    envBuf_[envPos_ + 2] = wetPeak; // single sample; boost/cut accrues as slot fills
    envBuf_[envPos_ + 3] = envSlotMaxEnv_;
    envBuf_[envPos_ + 4] = envSlotMaxAtt_;
    envBuf_[envPos_ + 5] = envSlotMaxRel_;
  }
}

void TransientsPlugin::publishEnvSnapshot()
{
  std::lock_guard<std::mutex> lock(envMutex_);
  std::memcpy(envSnapshot_, envBuf_, sizeof(envBuf_));
  envSnapshotPos_ = envPos_;
  envSnapshotSampleCount_ = envSampleCount_;
  envSnapshotSamplesPerSlot_ = envSamplesPerSlot_;
}

void TransientsPlugin::processSample(const BlockState& state, float& L, float& R)
{
  const float inL = L;
  const float inR = R;

  float detL = inL;
  float detR = inR;
  float detector = 0.f;
  if (state.link == Dsp::StereoLink::Mid)
  {
    detector = sc_.processMono(0.5f * (inL + inR));
    detL = detector;
    detR = detector;
  }
  else if (state.link == Dsp::StereoLink::Average)
  {
    detL = sc_.processChannel(0, inL);
    detR = sc_.processChannel(1, inR);
    detector = 0.5f * (std::fabs(detL) + std::fabs(detR));
  }
  else
  {
    detL = sc_.processChannel(0, inL);
    detR = sc_.processChannel(1, inR);
    detector = std::max(std::fabs(detL), std::fabs(detR));
  }

  const float filteredPeak = std::max(std::fabs(detL), std::fabs(detR));

  if (state.listen && !state.bypass)
  {
    L = detL;
    R = detR;
    float delayed[2] = {inL, inR};
    (void)transients_.processFrame(delayed, detector);
    const float dryPeak = std::max(std::fabs(delayed[0]), std::fabs(delayed[1]));
    envBufFeedSample(dryPeak, filteredPeak, filteredPeak, 1.f);
    return;
  }

  float delayed[2] = {L, R};
  const float gain = transients_.processFrame(delayed, detector);

  const float dryL = delayed[0];
  const float dryR = delayed[1];
  const float dryPeak = std::max(std::fabs(dryL), std::fabs(dryR));

  float scale = 1.f;
  float wetL = dryL;
  float wetR = dryR;
  if (!state.bypass)
  {
    scale = state.neutral ? 1.f : (state.mix * gain + state.dry);
    wetL = dryL * scale;
    wetR = dryR * scale;
    // Soft-clip attack boosts only (gain > 1): round peaks, leave body dry.
    if (state.softClip > 1.0e-6f && scale > 1.f)
    {
      wetL = softClipSample(wetL, state.softClip);
      wetR = softClipSample(wetR, state.softClip);
    }
    if (state.delta)
    {
      L = wetL - dryL;
      R = wetR - dryR;
    }
    else
    {
      L = wetL;
      R = wetR;
    }
  }

  // History: delayed dry vs shaped wet (before delta listen).
  const float wetPeak = std::max(std::fabs(wetL), std::fabs(wetR));
  envBufFeedSample(dryPeak, filteredPeak, wetPeak, state.bypass ? 1.f : scale);
}

void TransientsPlugin::processSilence(const BlockState& state, int nFrames)
{
  for (int i = 0; i < nFrames; ++i)
  {
    float detector = sc_.processMono(0.f);
    float values[2] = {0.f, 0.f};
    (void)transients_.processFrame(values, detector);
    envBufFeedSample(0.f, 0.f, 0.f, 1.f);
  }
  (void)state;
}

uint32 PLUGIN_API TransientsPlugin::getLatencySamples()
{
  return latencySamples_;
}

int TransientsPlugin::takeEnvelopeDisplay(float* out, int maxOut)
{
  const int slots = std::max(kEnvMinSlots, std::min(kEnvSlots, envVisibleSlots_));
  const int outCount = slots * kEnvChannels;
  if (maxOut < outCount + 1)
    return 0;

  float phase = 0.f;
  {
    std::lock_guard<std::mutex> lock(envMutex_);
    const int startPos =
      (kEnvBufSize + envSnapshotPos_ - (slots - 1) * kEnvChannels) % kEnvBufSize;
    const int sps = std::max(1, envSnapshotSamplesPerSlot_);
    phase = static_cast<float>(envSnapshotSampleCount_) / static_cast<float>(sps);
    for (int i = 0; i < slots; ++i)
    {
      const int srcIdx = (startPos + i * kEnvChannels) % kEnvBufSize;
      for (int c = 0; c < kEnvChannels; ++c)
        out[i * kEnvChannels + c] = std::fabs(envSnapshot_[srcIdx + c]);
    }
  }
  out[outCount] = std::clamp(phase, 0.f, 1.f);
  return outCount + 1;
}

void TransientsPlugin::configureVizBins(const char* id, int bins)
{
  if (!id || std::strcmp(id, vizEnvelopeId()) != 0)
    return;
  envVisibleSlots_ = std::max(kEnvMinSlots, std::min(kEnvSlots, bins));
}

tresult PLUGIN_API TransientsPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);
  sc_.setSampleRate(static_cast<float>(sampleRate_));
  sc_.setParams(
    params_[kParamHipass],
    params_[kParamLopass],
    Dsp::filterModeToStages(params_[kParamHpMode]),
    Dsp::filterModeToStages(params_[kParamLpMode]));
  const int lookahead = static_cast<int>(
    std::lround(std::clamp(params_[kParamLookahead], 0.f, 100.f)));
  transients_.setParams(
    params_[kParamAttackTime],
    params_[kParamAttackBoost],
    params_[kParamReleaseTime],
    params_[kParamReleaseBoost],
    Dsp::dbToLin(params_[kParamSustainThreshold]),
    lookahead,
    std::clamp(params_[kParamSensitivity], 0.f, 12.f));
  const BlockState state = makeBlockState();
  updateLatency(state.bypass, lookahead);

  const int slots = std::max(kEnvMinSlots, std::min(kEnvSlots, envVisibleSlots_));
  envSamplesPerSlot_ = std::max(
    1, static_cast<int>(sampleRate_ * kEnvelopeWindowMs * 0.001f / static_cast<float>(slots)));

  io_.setBypassGains(state.bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  const bool hasHostAudio = io_.begin(data);
  const bool quietIn = !hasHostAudio || io_.inputWasQuiet();

  // Never skip while lookahead / envelopes still hold energy.
  if (quietIn && transients_.isIdle())
  {
    publishEnvSnapshot();
    if (hasHostAudio)
      io_.end(data);
    return kResultOk;
  }

  const int32 nFrames = data.numSamples;

  if (!hasHostAudio)
  {
    // Host silenceFlags: emit lookahead / envelope residual into outs.
    data.outputs[0].silenceFlags = 0;
    auto drain = [&](auto** out, int32 nCh) {
      const bool canWrite = out && (nCh <= 0 || out[0]) && (nCh <= 1 || out[1]);
      for (int32 i = 0; i < nFrames; ++i)
      {
        float L = 0.f;
        float R = 0.f;
        processSample(state, L, R);
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
    publishEnvSnapshot();
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
      processSample(state, L, R);
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
      processSample(state, L, R);
      if (nCh > 0)
        out[0][i] = L;
      if (nCh > 1)
        out[1][i] = R;
    }
  }

  publishEnvSnapshot();
  io_.end(data);
  return kResultOk;
}

tresult PLUGIN_API TransientsPlugin::setState(IBStream* state)
{
  if (!state)
    return kResultFalse;
  IBStreamer streamer(state, kLittleEndian);

  uint32 magic = 0;
  uint32 version = 0;
  int32 count = 0;
  if (!streamer.readInt32u(magic) || magic != kStateMagic)
    return kResultFalse;
  if (!streamer.readInt32u(version)
      || (version != kStateVersion && version != 3 && version != kStateVersionWithDisplay
          && version != 1))
    return kResultFalse;
  if (!streamer.readInt32(count) || count <= 0)
    return kResultFalse;

  std::vector<float> raw(static_cast<size_t>(count));
  for (int i = 0; i < count; ++i)
  {
    if (!streamer.readFloat(raw[static_cast<size_t>(i)]))
      return kResultFalse;
  }

  float plains[kParamCount] {};
  readParamPlains(plains, kParamCount);

  if ((version == kStateVersion || version == 3) && count == kParamCount)
  {
    for (int i = 0; i < kParamCount; ++i)
      plains[i] = raw[static_cast<size_t>(i)];
    // v3 sensitivity was a level gate (−60…0 dB); v4 is rise threshold (0…12 dB).
    if (version == 3)
      plains[kParamSensitivity] = 0.f;
  }
  else if (version == kStateVersionWithDisplay || version == 1)
  {
    const int expectV2 = kParamCount - 3;
    const int expectV1 = expectV2 + 1;
    if (count != expectV2 && count != expectV1)
      return kResultFalse;

    int src = 0;
    int dst = 0;
    while (src < count && dst < kParamCount)
    {
      if (src == 9)
      {
        ++src;
        if (version == 1 && src < count)
          ++src;
        continue;
      }
      plains[dst++] = raw[static_cast<size_t>(src++)];
    }
  }
  else
    return kResultFalse;

  for (int i = 0; i < kParamCount; ++i)
  {
    if (auto* p = getParameterObject(static_cast<ParamID>(i)))
      p->setNormalized(p->toNormalized(plains[i]));
  }
  readParamPlains(params_, kParamCount);
  sc_.setSampleRate(static_cast<float>(sampleRate_));
  sc_.setParams(
    params_[kParamHipass],
    params_[kParamLopass],
    Dsp::filterModeToStages(params_[kParamHpMode]),
    Dsp::filterModeToStages(params_[kParamLpMode]));
  updateLatency(
    params_[kParamBypass] >= 0.5f,
    static_cast<int>(std::lround(std::clamp(params_[kParamLookahead], 0.f, 100.f))));
  notifyHostStateRestored();
  return kResultOk;
}

tresult PLUGIN_API TransientsPlugin::getState(IBStream* state)
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

} // namespace Transients
} // namespace calfNXT
