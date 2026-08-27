#include "phaser_dsp.h"

#include "base/source/fstreamer.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace calfNXT {
namespace Phaser {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5850u; // 'CNXP'
constexpr uint32 kStateVersion = 1;

float linToDbSafe(float lin)
{
  if (!(lin > 1.0e-12f) || !std::isfinite(lin))
    return -96.f;
  return 20.f * std::log10(lin);
}
} // namespace

PhaserPlugin::PhaserPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API PhaserPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  left_.setup(static_cast<float>(sampleRate_));
  right_.setup(static_cast<float>(sampleRate_));
  applyParams(makeBlockState(), true);
  return kResultOk;
}

tresult PLUGIN_API PhaserPlugin::setActive(TBool state)
{
  if (state)
  {
    left_.setup(static_cast<float>(sampleRate_));
    right_.setup(static_cast<float>(sampleRate_));
    applyParams(makeBlockState(), true);
  }
  return EffectBase::setActive(state);
}

tresult PLUGIN_API PhaserPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  left_.setup(static_cast<float>(sampleRate_));
  right_.setup(static_cast<float>(sampleRate_));
  applyParams(makeBlockState(), true);
  return EffectBase::setupProcessing(newSetup);
}

PhaserPlugin::BlockState PhaserPlugin::makeBlockState() const
{
  BlockState s;
  s.active = params_[kParamActive] >= 0.5f;
  s.lfo = params_[kParamLfo] >= 0.5f;
  s.reset = params_[kParamReset] >= 0.5f;
  s.baseFreq = params_[kParamBaseFreq];
  s.modDepth = params_[kParamModDepth];
  s.modRate = params_[kParamModRate];
  s.feedback = params_[kParamFeedback];
  s.stages = static_cast<int>(std::lround(std::clamp(params_[kParamStages], 1.f, 12.f)));
  s.stereoDeg = params_[kParamStereo];
  s.amount = params_[kParamAmount];
  s.dry = params_[kParamDry];
  return s;
}

void PhaserPlugin::applyParams(const BlockState& s, bool forcePhase)
{
  left_.setBaseFreq(s.baseFreq);
  right_.setBaseFreq(s.baseFreq);
  left_.setModDepthCents(s.modDepth);
  right_.setModDepthCents(s.modDepth);
  left_.setRateHz(s.modRate);
  right_.setRateHz(s.modRate);
  left_.setFeedback(s.feedback);
  right_.setFeedback(s.feedback);
  left_.setStages(s.stages);
  right_.setStages(s.stages);
  const float wetLin = Dsp::dbToLin(std::clamp(s.amount, -60.f, 12.f));
  const float dryLin = Dsp::dbToLin(std::clamp(s.dry, -60.f, 12.f));
  left_.setWet(wetLin);
  right_.setWet(wetLin);
  left_.setDry(dryLin);
  right_.setDry(dryLin);
  left_.setLfoActive(s.lfo);
  right_.setLfoActive(s.lfo);

  const float rPhase = std::clamp(s.stereoDeg, 0.f, 360.f) / 360.f;
  if (s.reset || forcePhase)
  {
    if (s.reset)
      clearReset_ = true;
    left_.resetPhase(0.f);
    right_.resetPhase(rPhase);
    lastRPhase_ = rPhase;
  }
  else if (std::fabs(rPhase - lastRPhase_) > 1.0e-4f)
  {
    // Match Calf: re-anchor R to L + offset when stereo knob moves.
    right_.setPhase(left_.phase());
    right_.incPhase(rPhase);
    lastRPhase_ = rPhase;
  }
}

void PhaserPlugin::publishResponse()
{
  const int bins = std::clamp(respBins_.load(std::memory_order_relaxed), 32, kMaxRespBins);
  constexpr float kFMin = 20.f;
  constexpr float kFMax = 20000.f;
  const float logSpan = std::log(kFMax / kFMin);
  // Sub-sample each log bin and keep the extremum (furthest from 0 dB).
  // Catches needle peaks/notches that miss the bin centre — real |H|(f)
  // evaluations, unlike linear midpoint densify on the UI.
  constexpr int kSub = 4;
  for (int i = 0; i < bins; ++i)
  {
    float bestL = 0.f;
    float bestR = 0.f;
    for (int s = 0; s < kSub; ++s)
    {
      const float t = (static_cast<float>(i) + (static_cast<float>(s) + 0.5f) / kSub)
        / static_cast<float>(bins);
      const float hz = kFMin * std::exp(t * logSpan);
      const float dL = linToDbSafe(left_.freqGain(hz));
      const float dR = linToDbSafe(right_.freqGain(hz));
      if (s == 0 || std::fabs(dL) > std::fabs(bestL))
        bestL = dL;
      if (s == 0 || std::fabs(dR) > std::fabs(bestR))
        bestR = dR;
    }
    respL_[i] = bestL;
    respR_[i] = bestR;
  }
  respReady_.store(true, std::memory_order_release);
}

int PhaserPlugin::takeFreqResponse(float* out, int maxOut)
{
  if (!out || maxOut < 1)
    return 0;
  // Demand next rebuild only while the editor is actively polling.
  respDemand_.store(true, std::memory_order_relaxed);
  if (!respReady_.load(std::memory_order_acquire))
    return 0;
  const int bins = std::clamp(respBins_.load(std::memory_order_relaxed), 32, kMaxRespBins);
  const int need = 1 + 2 * bins;
  if (maxOut < need)
    return 0;
  out[0] = static_cast<float>(bins);
  std::memcpy(out + 1, respL_, static_cast<size_t>(bins) * sizeof(float));
  std::memcpy(out + 1 + bins, respR_, static_cast<size_t>(bins) * sizeof(float));
  respReady_.store(false, std::memory_order_release);
  return need;
}

void PhaserPlugin::configureVizBins(const char* id, int bins)
{
  if (!id || bins < 1)
    return;
  if (std::strcmp(id, "mod") == 0)
  {
    respBins_.store(std::clamp(bins, 32, kMaxRespBins), std::memory_order_relaxed);
    respDemand_.store(true, std::memory_order_relaxed);
  }
}

void PhaserPlugin::idleAdvance(int nSamples, bool wantResp)
{
  // LFO-only when AP/FB already drained — never clear residual state here.
  if (left_.isIdle() && right_.isIdle())
  {
    left_.advanceSilence(nSamples);
    right_.advanceSilence(nSamples);
  }
  else
  {
    for (int i = 0; i < nSamples; ++i)
    {
      left_.process(0.f, false);
      right_.process(0.f, false);
    }
  }
  if (wantResp && respDemand_.load(std::memory_order_relaxed))
    publishResponse();
}

tresult PLUGIN_API PhaserPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);
  BlockState state = makeBlockState();
  applyParams(state, false);

  // Momentary reset button — clear after handling (Calf params_reset).
  if (clearReset_)
  {
    if (auto* p = getParameterObject(kParamReset))
      p->setNormalized(p->toNormalized(0.f));
    params_[kParamReset] = 0.f;
    clearReset_ = false;
  }

  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  // ~30 Hz response rebuild (matches viz flush); skip when no editor demand.
  const int respInterval = std::max(1, static_cast<int>(sampleRate_ / 30.0));
  respCountdown_ -= data.numSamples;
  const bool wantResp = respCountdown_ <= 0;
  if (wantResp)
    respCountdown_ = respInterval;

  const bool hasHostAudio = io_.begin(data);
  const bool quietIn = !hasHostAudio || io_.inputWasQuiet();
  const bool drained = left_.isIdle() && right_.isIdle();
  const bool wetOn = state.active;

  if (quietIn && drained)
  {
    idleAdvance(data.numSamples, wantResp);
    if (hasHostAudio)
      io_.end(data);
    return kResultOk;
  }

  if (!hasHostAudio)
  {
    // FB/AP still ringing — emit wet decay when buffers exist.
    data.outputs[0].silenceFlags = 0;
    const int32 n = data.numSamples;
    auto** out32 = data.outputs[0].channelBuffers32;
    auto** out64 = data.outputs[0].channelBuffers64;
    if (data.symbolicSampleSize == kSample32 && out32 && out32[0] && out32[1])
    {
      for (int32 i = 0; i < n; ++i)
      {
        out32[0][i] = left_.process(0.f, wetOn);
        out32[1][i] = right_.process(0.f, wetOn);
      }
      io_.end(data);
    }
    else if (data.symbolicSampleSize != kSample32 && out64 && out64[0] && out64[1])
    {
      for (int32 i = 0; i < n; ++i)
      {
        out64[0][i] = left_.process(0.f, wetOn);
        out64[1][i] = right_.process(0.f, wetOn);
      }
      io_.end(data);
    }
    else
      idleAdvance(n, false);
    if (wantResp && respDemand_.load(std::memory_order_relaxed))
      publishResponse();
    return kResultOk;
  }

  const int32 nFrames = data.numSamples;
  const int32 nCh = data.outputs[0].numChannels;

  auto run = [&](auto** out) {
    for (int32 i = 0; i < nFrames; ++i)
    {
      float L = nCh > 0 ? static_cast<float>(out[0][i]) : 0.f;
      float R = nCh > 1 ? static_cast<float>(out[1][i]) : L;
      L = left_.process(L, wetOn);
      R = right_.process(R, wetOn);
      if (nCh > 0)
        out[0][i] = L;
      if (nCh > 1)
        out[1][i] = R;
    }
  };

  if (data.symbolicSampleSize == kSample32)
    run(data.outputs[0].channelBuffers32);
  else
    run(data.outputs[0].channelBuffers64);

  if (wantResp && respDemand_.load(std::memory_order_relaxed))
    publishResponse();
  io_.end(data);
  return kResultOk;
}

tresult PLUGIN_API PhaserPlugin::setState(IBStream* state)
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
  if (!streamer.readInt32(count) || count <= 0 || count > kParamCount)
    return kResultFalse;

  float plains[kParamCount] {};
  for (int i = 0; i < kParamCount; ++i)
  {
    if (auto* p = getParameterObject(static_cast<ParamID>(i)))
      plains[i] = static_cast<float>(p->toPlain(p->getNormalized()));
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
  applyParams(makeBlockState(), true);
  notifyHostStateRestored();
  return kResultOk;
}

tresult PLUGIN_API PhaserPlugin::getState(IBStream* state)
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

} // namespace Phaser
} // namespace calfNXT
