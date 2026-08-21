#include "split_dsp.h"

#include "base/source/fstreamer.h"
#include "gain_util.h"

namespace calfNXT {
namespace Split {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x53504C54u; // 'SPLT'
constexpr uint32 kStateVersion = 1;
} // namespace

SplitPlugin::SplitPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API SplitPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addMonoInStereoOut();
  io_.setInputMeterChannels(1);
  io_.setOutputMeterChannels(2);
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

SplitPlugin::BlockState SplitPlugin::makeBlockState() const
{
  BlockState state;
  state.volLinL = Dsp::dbToLin(params_[kParamVolumeL]);
  state.volLinR = Dsp::dbToLin(params_[kParamVolumeR]);
  state.muteL = params_[kParamMuteL] >= 0.5f;
  state.muteR = params_[kParamMuteR] >= 0.5f;
  state.phaseL = params_[kParamPhaseL] >= 0.5f;
  state.phaseR = params_[kParamPhaseR] >= 0.5f;
  return state;
}

tresult PLUGIN_API SplitPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);
  const BlockState state = makeBlockState();

  io_.setBypassGains(false);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  if (!io_.beginMonoToStereo(data))
    return kResultOk;

  const int32 nFrames = data.numSamples;
  if (nFrames <= 0)
  {
    io_.end(data);
    return kResultOk;
  }

  if (data.symbolicSampleSize == kSample32)
  {
    auto** out = data.outputs[0].channelBuffers32;
    for (int32 i = 0; i < nFrames; ++i)
    {
      float L = out[0][i] * state.volLinL;
      float R = out[1][i] * state.volLinR;
      if (state.muteL)
        L = 0.f;
      if (state.muteR)
        R = 0.f;
      if (state.phaseL)
        L = -L;
      if (state.phaseR)
        R = -R;
      out[0][i] = L;
      out[1][i] = R;
    }
  }
  else
  {
    auto** out = data.outputs[0].channelBuffers64;
    for (int32 i = 0; i < nFrames; ++i)
    {
      float L = static_cast<float>(out[0][i]) * state.volLinL;
      float R = static_cast<float>(out[1][i]) * state.volLinR;
      if (state.muteL)
        L = 0.f;
      if (state.muteR)
        R = 0.f;
      if (state.phaseL)
        L = -L;
      if (state.phaseR)
        R = -R;
      out[0][i] = L;
      out[1][i] = R;
    }
  }

  io_.end(data);
  return kResultOk;
}

tresult PLUGIN_API SplitPlugin::setState(IBStream* state)
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
  if (!streamer.readInt32(count) || count != kParamCount)
    return kResultFalse;

  float plains[kParamCount];
  for (int i = 0; i < kParamCount; ++i)
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

tresult PLUGIN_API SplitPlugin::getState(IBStream* state)
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

} // namespace Split
} // namespace calfNXT
