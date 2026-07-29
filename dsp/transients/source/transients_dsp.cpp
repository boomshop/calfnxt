#include "transients_dsp.h"

#include "base/source/fstreamer.h"

#include "gain_util.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Transients {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5854u; // 'CNXT'
constexpr uint32 kStateVersion = 2;

/** Discrete display window lengths (ms) — keep in sync with UI / EnvelopeChart. */
constexpr float kDisplayMs[] = {100.f, 250.f, 500.f, 1000.f, 2500.f, 5000.f};

float snapDisplayMs(float v)
{
  float best = kDisplayMs[0];
  float bestErr = std::fabs(v - best);
  for (float cand : kDisplayMs)
  {
    const float err = std::fabs(v - cand);
    if (err < bestErr)
    {
      best = cand;
      bestErr = err;
    }
  }
  return best;
}
}

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
  for (auto& f : hp_)
    f.reset();
  for (auto& f : lp_)
    f.reset();
  lastHpFreq_ = -1.f;
  lastLpFreq_ = -1.f;
  lastHpStages_ = -1;
  lastLpStages_ = -1;
  updateFilters();

  std::memset(envBuf_, 0, sizeof(envBuf_));
  envPos_ = 0;
  envSampleCount_ = 0;
  envSamplesPerSlot_ = 1;
  envVisibleSlots_ = 160;
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
    resetProcessing();
  return EffectBase::setActive(state);
}

tresult PLUGIN_API TransientsPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  resetProcessing();
  return EffectBase::setupProcessing(newSetup);
}

void TransientsPlugin::updateFilters()
{
  const int hpStages = static_cast<int>(
    std::lround(std::clamp(params_[kParamHpMode], 0.f, 3.f)));
  const int lpStages = static_cast<int>(
    std::lround(std::clamp(params_[kParamLpMode], 0.f, 3.f)));

  if (hpStages != lastHpStages_)
  {
    if (hpStages == 0)
    {
      for (auto& f : hp_)
        f.reset();
    }
    lastHpStages_ = hpStages;
    lastHpFreq_ = -1.f; // force coeff refresh when re-enabled
  }
  if (lpStages != lastLpStages_)
  {
    if (lpStages == 0)
    {
      for (auto& f : lp_)
        f.reset();
    }
    lastLpStages_ = lpStages;
    lastLpFreq_ = -1.f;
  }

  const float hpFreq = params_[kParamHipass];
  const float lpFreq = params_[kParamLopass];
  const float sr = static_cast<float>(sampleRate_);
  if (hpStages > 0 && hpFreq != lastHpFreq_)
  {
    hp_[0].setHpRbj(hpFreq, 0.707f, sr, 1.f);
    hp_[1].copyCoeffs(hp_[0]);
    hp_[2].copyCoeffs(hp_[0]);
    lastHpFreq_ = hpFreq;
  }
  if (lpStages > 0 && lpFreq != lastLpFreq_)
  {
    lp_[0].setLpRbj(lpFreq, 0.707f, sr, 1.f);
    lp_[1].copyCoeffs(lp_[0]);
    lp_[2].copyCoeffs(lp_[0]);
    lastLpFreq_ = lpFreq;
  }
}

TransientsPlugin::BlockState TransientsPlugin::makeBlockState() const
{
  BlockState state;
  state.mix = std::clamp(params_[kParamMix], 0.f, 1.f);
  state.dry = 1.f - state.mix;
  state.listen = params_[kParamListen] >= 0.5f;
  state.bypass = params_[kParamBypass] >= 0.5f;
  state.hpStages = static_cast<int>(std::lround(std::clamp(params_[kParamHpMode], 0.f, 3.f)));
  state.lpStages = static_cast<int>(std::lround(std::clamp(params_[kParamLpMode], 0.f, 3.f)));
  state.neutral = transients_.isNeutral();
  return state;
}

float TransientsPlugin::filterDetector(float s, const BlockState& state)
{
  for (int i = 0; i < state.hpStages; ++i)
  {
    s = static_cast<float>(hp_[i].process(s));
    hp_[i].sanitize();
  }
  for (int i = 0; i < state.lpStages; ++i)
  {
    s = static_cast<float>(lp_[i].process(s));
    lp_[i].sanitize();
  }
  return s;
}

void TransientsPlugin::processSample(const BlockState& state, float& L, float& R)
{
  const float dryL = L;
  const float dryR = R;
  float detector = 0.5f * (L + R);
  detector = filterDetector(detector, state);

  if (state.listen && !state.bypass)
  {
    L = detector;
    R = detector;
    envBufFeedSample(std::fabs(detector), std::fabs(detector));
    return;
  }

  // Always run the follower (meters/display). Wet apply only when shaping.
  float values[2] = {L, R};
  transients_.processFrame(values, detector);
  if (!state.bypass && !state.neutral)
  {
    L = values[0] * state.mix + dryL * state.dry;
    R = values[1] * state.mix + dryR * state.dry;
  }

  const float inPeak = 0.5f * (std::fabs(dryL) + std::fabs(dryR));
  envBufFeedSample(inPeak, 0.5f * (std::fabs(L) + std::fabs(R)));
}

void TransientsPlugin::processSilence(const BlockState& state, int nFrames)
{
  // Decay filters + shaper and keep the envelope chart scrolling on silence.
  for (int i = 0; i < nFrames; ++i)
  {
    float detector = filterDetector(0.f, state);
    float values[2] = {0.f, 0.f};
    transients_.processFrame(values, detector);
    envBufFeedSample(0.f, 0.f);
  }
}

void TransientsPlugin::envBufFeedSample(float inPeak, float outPeak)
{
  const int pos = envPos_;
  const float env = transients_.envelope();
  const float att = transients_.attack();
  const float rel = transients_.release();

  envBuf_[pos + 0] = std::max(inPeak, envBuf_[pos + 0]);
  envBuf_[pos + 1] = std::max(outPeak, envBuf_[pos + 1]);
  // Peak within the slot keeps the overlay from flickering on last-sample picks.
  envBuf_[pos + 2] = std::max(env, envBuf_[pos + 2]);
  envBuf_[pos + 3] = std::max(att, envBuf_[pos + 3]);
  envBuf_[pos + 4] = std::max(rel, envBuf_[pos + 4]);

  envSampleCount_ += 1;
  if (envSampleCount_ >= envSamplesPerSlot_)
  {
    envPos_ = (pos + kEnvChannels) % kEnvBufSize;
    envSampleCount_ = 0;
    // Seed the next slot with the current sample so the right edge does not
    // drop to zero between slots (was the main chart "stutter").
    envBuf_[envPos_ + 0] = inPeak;
    envBuf_[envPos_ + 1] = outPeak;
    envBuf_[envPos_ + 2] = env;
    envBuf_[envPos_ + 3] = att;
    envBuf_[envPos_ + 4] = rel;
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

int TransientsPlugin::takeEnvelopeDisplay(float* out, int maxOut)
{
  const int slots = std::max(kEnvMinSlots, std::min(kEnvSlots, envVisibleSlots_));
  const int outCount = slots * kEnvChannels;
  // Trailing phase float (0…1) for sub-slot scroll interpolation in the UI.
  if (maxOut < outCount + 1)
    return 0;

  int startPos = 0;
  float phase = 0.f;
  {
    std::lock_guard<std::mutex> lock(envMutex_);
    // Include the in-progress slot as newest so the right edge updates live.
    startPos =
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
  updateFilters();
  transients_.setParams(
    params_[kParamAttackTime],
    params_[kParamAttackBoost],
    params_[kParamReleaseTime],
    params_[kParamReleaseBoost],
    Dsp::dbToLin(params_[kParamSustainThreshold]),
    static_cast<int>(std::lround(std::clamp(params_[kParamLookahead], 0.f, 100.f))));
  const BlockState state = makeBlockState();

  const float displayMs = snapDisplayMs(params_[kParamDisplay]);
  const int slots = std::max(kEnvMinSlots, std::min(kEnvSlots, envVisibleSlots_));
  envSamplesPerSlot_ = std::max(
    1, static_cast<int>(sampleRate_ * displayMs * 0.001f / static_cast<float>(slots)));

  io_.setBypassGains(state.bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  if (!io_.begin(data))
  {
    processSilence(state, data.numSamples);
    publishEnvSnapshot();
    return kResultOk;
  }

  const int32 nFrames = data.numSamples;
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
  if (!streamer.readInt32u(version) || (version != kStateVersion && version != 1))
    return kResultFalse;
  if (!streamer.readInt32(count) || count <= 0)
    return kResultFalse;

  // v1 had an extra display_threshold after display; skip it when present.
  const bool skipDisplayThreshold = (version == 1 && count == kParamCount + 1);
  if (count != kParamCount && !skipDisplayThreshold)
    return kResultFalse;

  float plains[kParamCount];
  int plainIdx = 0;
  for (int i = 0; i < count; ++i)
  {
    float v = 0.f;
    if (!streamer.readFloat(v))
      return kResultFalse;
    if (skipDisplayThreshold && i == 10)
      continue;
    if (plainIdx < kParamCount)
      plains[plainIdx++] = v;
  }
  if (plainIdx != kParamCount)
    return kResultFalse;

  for (int i = 0; i < kParamCount; ++i)
  {
    if (auto* p = getParameterObject(static_cast<ParamID>(i)))
      p->setNormalized(p->toNormalized(plains[i]));
  }
  readParamPlains(params_, kParamCount);
  updateFilters();
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
  for (int i = 0; i < kParamCount; ++i)
    streamer.writeFloat(params_[i]);
  return kResultOk;
}

} // namespace Transients
} // namespace calfNXT
