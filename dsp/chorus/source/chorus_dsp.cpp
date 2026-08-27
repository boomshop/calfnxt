#include "chorus_dsp.h"

#include "base/source/fstreamer.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace calfNXT {
namespace Chorus {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5843u; // 'CNXC'
constexpr uint32 kStateVersion = 1;
} // namespace

ChorusPlugin::ChorusPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API ChorusPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  const float sr = static_cast<float>(sampleRate_);
  left_.setup(sr);
  right_.setup(sr);
  post_.setSampleRate(sr);
  post_.reset();
  amountGain_.setSampleRate(sr);
  dryGain_.setSampleRate(sr);
  amountGain_.setInertiaMs(1.5f);
  dryGain_.setInertiaMs(1.5f);
  applyParams(makeBlockState(), true);
  return kResultOk;
}

tresult PLUGIN_API ChorusPlugin::setActive(TBool state)
{
  if (state)
  {
    const float sr = static_cast<float>(sampleRate_);
    left_.setup(sr);
    right_.setup(sr);
    post_.setSampleRate(sr);
    post_.reset();
    amountGain_.setSampleRate(sr);
    dryGain_.setSampleRate(sr);
    applyParams(makeBlockState(), true);
  }
  return EffectBase::setActive(state);
}

tresult PLUGIN_API ChorusPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  const float sr = static_cast<float>(sampleRate_);
  left_.setup(sr);
  right_.setup(sr);
  post_.setSampleRate(sr);
  post_.reset();
  amountGain_.setSampleRate(sr);
  dryGain_.setSampleRate(sr);
  applyParams(makeBlockState(), true);
  return EffectBase::setupProcessing(newSetup);
}

ChorusPlugin::BlockState ChorusPlugin::makeBlockState() const
{
  BlockState s;
  s.active = params_[kParamActive] >= 0.5f;
  s.lfo = params_[kParamLfo] >= 0.5f;
  s.reset = params_[kParamReset] >= 0.5f;
  s.minDelay = params_[kParamMinDelay];
  s.modDepth = params_[kParamModDepth];
  s.modRate = params_[kParamModRate];
  s.stereoDeg = params_[kParamStereo];
  s.voices = static_cast<int>(std::lround(std::clamp(params_[kParamVoices], 1.f, 8.f)));
  s.vphaseDeg = params_[kParamVphase];
  s.overlap = params_[kParamOverlap];
  s.amount = params_[kParamAmount];
  s.dry = params_[kParamDry];
  s.hipass = params_[kParamHipass];
  s.lopass = params_[kParamLopass];
  s.hpMode = params_[kParamHpMode];
  s.lpMode = params_[kParamLpMode];
  s.listen = params_[kParamListen] >= 0.5f;
  return s;
}

void ChorusPlugin::applyParams(const BlockState& s, bool forcePhase)
{
  left_.setMinDelayMs(s.minDelay);
  right_.setMinDelayMs(s.minDelay);
  left_.setModDepthMs(s.modDepth);
  right_.setModDepthMs(s.modDepth);
  left_.setRateHz(s.modRate);
  right_.setRateHz(s.modRate);
  left_.setVoices(s.voices);
  right_.setVoices(s.voices);
  left_.setOverlap(s.overlap);
  right_.setOverlap(s.overlap);

  const float vStep = (std::clamp(s.vphaseDeg, 0.f, 360.f) / 360.f)
    / static_cast<float>(std::max(s.voices - 1, 1));
  left_.setVoicePhaseStep(vStep);
  right_.setVoicePhaseStep(vStep);

  left_.setLfoActive(s.lfo);
  right_.setLfoActive(s.lfo);

  const float amountLin = (s.active || s.listen)
    ? Dsp::dbToLin(std::clamp(s.amount, -60.f, 12.f))
    : 0.f;
  const float dryLin = Dsp::dbToLin(std::clamp(s.dry, -60.f, 12.f));
  amountGain_.set(amountLin);
  dryGain_.set(dryLin);
  if (forcePhase)
  {
    amountGain_.reset(amountLin);
    dryGain_.reset(dryLin);
  }

  post_.setParams(s.hipass, s.lopass, Dsp::complementaryModeToStages(s.hpMode),
                  Dsp::complementaryModeToStages(s.lpMode));

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
    right_.setPhase(left_.phase());
    right_.incPhase(rPhase);
    lastRPhase_ = rPhase;
  }
}

void ChorusPlugin::publishLfoViz()
{
  phaseL_.store(left_.phase(), std::memory_order_relaxed);
  phaseR_.store(right_.phase(), std::memory_order_relaxed);
}

int ChorusPlugin::takeChorusLfo(float* out, int maxOut)
{
  if (!out || maxOut < 4)
    return 0;
  out[0] = phaseL_.load(std::memory_order_relaxed);
  out[1] = 0.f;
  out[2] = phaseR_.load(std::memory_order_relaxed);
  out[3] = 0.f;
  return 4;
}

tresult PLUGIN_API ChorusPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);
  BlockState state = makeBlockState();
  applyParams(state, false);

  if (clearReset_)
  {
    if (auto* p = getParameterObject(kParamReset))
      p->setNormalized(p->toNormalized(0.f));
    params_[kParamReset] = 0.f;
    clearReset_ = false;
  }

  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  const bool hasHostAudio = io_.begin(data);
  const bool quietIn = !hasHostAudio || io_.inputWasQuiet();
  const bool drained = left_.isIdle() && right_.isIdle()
    && amountGain_.isSettled() && dryGain_.isSettled();

  if (quietIn && drained)
  {
    left_.advanceSilence(data.numSamples);
    right_.advanceSilence(data.numSamples);
    publishLfoViz();
    if (hasHostAudio)
      io_.end(data);
    return kResultOk;
  }

  if (!hasHostAudio)
  {
    // Delay lines / post-filter still draining — emit wet when buffers exist.
    data.outputs[0].silenceFlags = 0;
    const int32 n = data.numSamples;
    const bool listen = state.listen;
    auto drainOne = [&](float& oL, float& oR) {
      float wetL = left_.processWet(0.f);
      float wetR = right_.processWet(0.f);
      wetL = post_.processWet(0, wetL);
      wetR = post_.processWet(1, wetR);
      const float a = amountGain_.get();
      dryGain_.get();
      oL = a * wetL;
      oR = a * wetR;
      (void)listen;
      Dsp::sanitizeDenormal(oL);
      Dsp::sanitizeDenormal(oR);
    };
    auto** out32 = data.outputs[0].channelBuffers32;
    auto** out64 = data.outputs[0].channelBuffers64;
    if (data.symbolicSampleSize == kSample32 && out32 && out32[0] && out32[1])
    {
      for (int32 i = 0; i < n; ++i)
        drainOne(out32[0][i], out32[1][i]);
      io_.end(data);
    }
    else if (data.symbolicSampleSize != kSample32 && out64 && out64[0] && out64[1])
    {
      for (int32 i = 0; i < n; ++i)
      {
        float oL = 0.f, oR = 0.f;
        drainOne(oL, oR);
        out64[0][i] = oL;
        out64[1][i] = oR;
      }
      io_.end(data);
    }
    else
    {
      for (int32 i = 0; i < n; ++i)
      {
        float oL = 0.f, oR = 0.f;
        drainOne(oL, oR);
      }
    }
    publishLfoViz();
    return kResultOk;
  }

  const int32 nFrames = data.numSamples;
  const int32 nCh = data.outputs[0].numChannels;

  auto run = [&](auto** out) {
    for (int32 i = 0; i < nFrames; ++i)
    {
      float inL = nCh > 0 ? static_cast<float>(out[0][i]) : 0.f;
      float inR = nCh > 1 ? static_cast<float>(out[1][i]) : inL;

      float wetL = left_.processWet(inL);
      float wetR = right_.processWet(inR);
      wetL = post_.processWet(0, wetL);
      wetR = post_.processWet(1, wetR);

      const float a = amountGain_.get();
      const float d = dryGain_.get();
      float outL = state.listen ? a * wetL : d * inL + a * wetL;
      float outR = state.listen ? a * wetR : d * inR + a * wetR;
      Dsp::sanitizeDenormal(outL);
      Dsp::sanitizeDenormal(outR);

      if (nCh > 0)
        out[0][i] = outL;
      if (nCh > 1)
        out[1][i] = outR;
    }
  };

  if (data.symbolicSampleSize == kSample32)
    run(data.outputs[0].channelBuffers32);
  else
    run(data.outputs[0].channelBuffers64);

  publishLfoViz();
  io_.end(data);
  return kResultOk;
}

tresult PLUGIN_API ChorusPlugin::setState(IBStream* state)
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

tresult PLUGIN_API ChorusPlugin::getState(IBStream* state)
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

} // namespace Chorus
} // namespace calfNXT
