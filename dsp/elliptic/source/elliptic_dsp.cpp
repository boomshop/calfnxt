#include "elliptic_dsp.h"

#include "base/source/fstreamer.h"
#include "dsp_math.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Elliptic {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434E5845u; // 'CNXE'
constexpr uint32 kStateVersion = 1;
} // namespace

EllipticPlugin::EllipticPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API EllipticPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  amountCur_ = params_[kParamAmount];
  return kResultOk;
}

tresult PLUGIN_API EllipticPlugin::setActive(TBool state)
{
  if (state)
  {
    cross_.setSampleRate(static_cast<float>(sampleRate_));
    cross_.reset();
    cross_.setParams(params_[kParamFreq], params_[kParamSlope]);
    fieldTap_.setSampleRate(sampleRate_);
    bassTap_.setSampleRate(sampleRate_);
    updateAmountCoeff();
    amountCur_ = params_[kParamAmount];
  }
  return EffectBase::setActive(state);
}

tresult PLUGIN_API EllipticPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  cross_.setSampleRate(static_cast<float>(sampleRate_));
  fieldTap_.setSampleRate(sampleRate_);
  bassTap_.setSampleRate(sampleRate_);
  updateAmountCoeff();
  return EffectBase::setupProcessing(newSetup);
}

void EllipticPlugin::updateAmountCoeff()
{
  // ~10 ms, so an Amount move does not step the side bass.
  const double n = std::max(1.0, sampleRate_ * 0.01);
  amountCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / n));
}

EllipticPlugin::BlockState EllipticPlugin::makeBlockState() const
{
  BlockState s;
  s.listen = params_[kParamListen] >= 0.5f;
  s.amount = std::clamp(params_[kParamAmount], 0.f, 1.f);
  s.freq = params_[kParamFreq];
  s.slope = params_[kParamSlope];
  return s;
}

void EllipticPlugin::processSample(const BlockState& state, float& L, float& R)
{
  amountCur_ += (state.amount - amountCur_) * amountCoeff_;
  Dsp::sanitizeDenormal(amountCur_);

  float outL = 0.f;
  float outR = 0.f;
  float lowSide = 0.f;
  float bassL = 0.f;
  float bassR = 0.f;
  cross_.process(L, R, amountCur_, outL, outR, lowSide, bassL, bassR);
  if (state.listen)
  {
    L = lowSide;
    R = lowSide;
  }
  else
  {
    L = outL;
    R = outR;
  }
  fieldTap_.process(L, R);
  bassTap_.process(bassL, bassR);
}

tresult PLUGIN_API EllipticPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);
  const BlockState state = makeBlockState();
  cross_.setParams(state.freq, state.slope);

  const bool bypass = params_[kParamBypass] >= 0.5f;
  io_.setBypassGains(bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  const bool hasHostAudio = io_.begin(data);
  const bool quietIn = !hasHostAudio || io_.inputWasQuiet();

  if (bypass)
  {
    cross_.reset();
    amountCur_ = state.amount;
    fieldTap_.clearDisplay();
    bassTap_.clearDisplay();
    if (hasHostAudio)
      io_.end(data);
    return kResultOk;
  }

  if (quietIn && !cross_.hot())
  {
    fieldTap_.clearDisplay();
    bassTap_.clearDisplay();
    if (hasHostAudio)
      io_.end(data);
    return kResultOk;
  }

  if (data.numOutputs < 1 || !data.outputs)
  {
    if (hasHostAudio)
      io_.end(data);
    return kResultOk;
  }

  if (!hasHostAudio)
    data.outputs[0].silenceFlags = 0;

  const int32 nFrames = data.numSamples;
  if (data.symbolicSampleSize == kSample32)
  {
    auto** out = data.outputs[0].channelBuffers32;
    const int32 nCh = data.outputs[0].numChannels;
    for (int32 i = 0; i < nFrames; ++i)
    {
      float L = 0.f;
      float R = 0.f;
      if (hasHostAudio && !quietIn)
      {
        L = (nCh > 0) ? out[0][i] : 0.f;
        R = (nCh > 1) ? out[1][i] : L;
      }
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
      float L = 0.f;
      float R = 0.f;
      if (hasHostAudio && !quietIn)
      {
        L = (nCh > 0) ? static_cast<float>(out[0][i]) : 0.f;
        R = (nCh > 1) ? static_cast<float>(out[1][i]) : L;
      }
      processSample(state, L, R);
      if (nCh > 0)
        out[0][i] = L;
      if (nCh > 1)
        out[1][i] = R;
    }
  }

  cross_.sanitize();
  if (hasHostAudio && !quietIn)
  {
    fieldTap_.publish();
    bassTap_.publish();
  }
  else if (!cross_.hot())
  {
    fieldTap_.clearDisplay();
    bassTap_.clearDisplay();
  }
  else
  {
    fieldTap_.publish();
    bassTap_.publish();
  }
  io_.end(data);
  return kResultOk;
}

int EllipticPlugin::takeCorrelation(float* out, int maxOut)
{
  if (!out || maxOut < 1)
    return 0;
  out[0] = fieldTap_.takeCorrelation();
  return 1;
}

int EllipticPlugin::takeGonio(float* out, int maxOut)
{
  return bassTap_.takeGonio(out, maxOut);
}

tresult PLUGIN_API EllipticPlugin::setState(IBStream* state)
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
  cross_.setParams(params_[kParamFreq], params_[kParamSlope]);
  amountCur_ = params_[kParamAmount];
  notifyHostStateRestored();
  return kResultOk;
}

tresult PLUGIN_API EllipticPlugin::getState(IBStream* state)
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

} // namespace Elliptic
} // namespace calfNXT
