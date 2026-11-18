#include "phones_dsp.h"

#include "base/source/fstreamer.h"

#include <algorithm>

namespace calfNXT {
namespace Phones {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x50484F4Eu; // 'PHON'
constexpr uint32 kStateVersion = 1;
} // namespace

PhonesPlugin::PhonesPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API PhonesPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

PhonesPlugin::BlockState PhonesPlugin::makeBlockState() const
{
  BlockState s;
  s.bypass = params_[kParamBypass] >= 0.5f;
  s.mono = params_[kParamMono] >= 0.5f;
  s.amount = std::clamp(params_[kParamAmount], 0.f, 1.f);
  s.angle = std::clamp(params_[kParamAngle], 20.f, 45.f);
  s.distance = std::clamp(params_[kParamDistance], 0.5f, 4.f);
  s.room = std::clamp(params_[kParamRoom], 0.f, 1.f);
  s.live = std::clamp(params_[kParamLive], 0.f, 1.f);
  s.scatter = std::clamp(params_[kParamScatter], 0.f, 1.f);
  return s;
}

void PhonesPlugin::resetProcessing()
{
  const float sr = static_cast<float>(sampleRate_ > 0.0 ? sampleRate_ : 44100.0);
  const BlockState s = makeBlockState();
  engine_.setSampleRate(sr);
  engine_.reset(s.amount, s.angle, s.distance, s.room, s.live, s.scatter, s.mono ? 1.f : 0.f);
  bypassed_ = s.bypass;
}

tresult PLUGIN_API PhonesPlugin::setActive(TBool state)
{
  if (state)
    resetProcessing();
  return EffectBase::setActive(state);
}

tresult PLUGIN_API PhonesPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  resetProcessing();
  return EffectBase::setupProcessing(newSetup);
}

tresult PLUGIN_API PhonesPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);
  const BlockState state = makeBlockState();

  io_.setBypassGains(state.bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  if (!data.outputs || data.numOutputs < 1 || data.numSamples <= 0)
    return kResultOk;

  const bool hasHostAudio = io_.begin(data);
  if (state.bypass != bypassed_)
  {
    engine_.setSampleRate(static_cast<float>(sampleRate_ > 0.0 ? sampleRate_ : 44100.0));
    engine_.reset(state.amount, state.angle, state.distance, state.room, state.live, state.scatter, state.mono ? 1.f : 0.f);
    bypassed_ = state.bypass;
  }

  if (!hasHostAudio)
    data.outputs[0].silenceFlags = 0;

  if (!state.bypass)
  {
    engine_.setTargets(state.amount, state.angle, state.distance, state.room, state.live, state.scatter, state.mono ? 1.f : 0.f);

    const int32 nFrames = data.numSamples;
    const int32 nCh = data.outputs[0].numChannels;
    auto run32 = [&](float** out, bool zeros) {
      for (int32 i = 0; i < nFrames; ++i)
      {
        const float inL = zeros || !out || nCh <= 0 ? 0.f : out[0][i];
        const float inR = zeros || !out || nCh <= 1 ? inL : out[1][i];
        float oL = 0.f;
        float oR = 0.f;
        engine_.process(inL, inR, oL, oR);
        if (!out)
          continue;
        if (nCh > 0)
          out[0][i] = oL;
        if (nCh > 1)
          out[1][i] = oR;
      }
    };
    auto run64 = [&](double** out, bool zeros) {
      for (int32 i = 0; i < nFrames; ++i)
      {
        const float inL = zeros || !out || nCh <= 0 ? 0.f : static_cast<float>(out[0][i]);
        const float inR = zeros || !out || nCh <= 1 ? inL : static_cast<float>(out[1][i]);
        float oL = 0.f;
        float oR = 0.f;
        engine_.process(inL, inR, oL, oR);
        if (!out)
          continue;
        if (nCh > 0)
          out[0][i] = static_cast<double>(oL);
        if (nCh > 1)
          out[1][i] = static_cast<double>(oR);
      }
    };
    if (data.symbolicSampleSize == kSample32)
      run32(data.outputs[0].channelBuffers32, !hasHostAudio || !data.outputs[0].channelBuffers32);
    else
      run64(data.outputs[0].channelBuffers64, !hasHostAudio || !data.outputs[0].channelBuffers64);
    engine_.sanitizeBlock();
  }

  io_.end(data);
  return kResultOk;
}

tresult PLUGIN_API PhonesPlugin::setState(IBStream* state)
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
  // Older sessions append a Place value this build no longer stores.
  if (!streamer.readInt32(count) || count <= 0)
    return kResultFalse;
  const int stored = count;
  if (stored > kParamCount + 8)
    return kResultFalse;
  if (count > kParamCount)
    count = kParamCount;

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
  for (int i = count; i < stored; ++i)
  {
    float ignored = 0.f;
    if (!streamer.readFloat(ignored))
      return kResultFalse;
  }
  for (int i = 0; i < kParamCount; ++i)
  {
    if (auto* p = getParameterObject(static_cast<ParamID>(i)))
      p->setNormalized(p->toNormalized(plains[i]));
  }
  readParamPlains(params_, kParamCount);
  resetProcessing();
  notifyHostStateRestored();
  return kResultOk;
}

tresult PLUGIN_API PhonesPlugin::getState(IBStream* state)
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

} // namespace Phones
} // namespace calfNXT
