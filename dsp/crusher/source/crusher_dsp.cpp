#include "crusher_dsp.h"

#include "base/source/fstreamer.h"
#include "dsp_math.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Crusher {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5843u; // 'CNXC'
constexpr uint32 kStateVersion = 2;
} // namespace

CrusherPlugin::CrusherPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API CrusherPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

void CrusherPlugin::resetProcessing()
{
  shapeZone_ = 0.f;
  // ~120 ms release for the active-zone amplitude.
  shapeZoneFall_ = std::exp(-1.f / static_cast<float>(sampleRate_ * 0.12));
  for (int i = 0; i < kShapeHistBins; ++i)
  {
    histAcc_[i] = 0.f;
    histDisp_[i] = 0.f;
  }
  applyCrushParams(makeBlockState());
}

tresult PLUGIN_API CrusherPlugin::setActive(TBool state)
{
  if (state)
    resetProcessing();
  return EffectBase::setActive(state);
}

tresult PLUGIN_API CrusherPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  bit_.setSampleRate(static_cast<uint32_t>(sampleRate_));
  resetProcessing();
  return EffectBase::setupProcessing(newSetup);
}

CrusherPlugin::BlockState CrusherPlugin::makeBlockState() const
{
  BlockState s;
  s.bypass = params_[kParamBypass] >= 0.5f;
  s.mode = params_[kParamMode] >= 0.5f ? 1 : 0;
  s.bits = std::clamp(params_[kParamBits], 1.f, 16.f);
  s.morph = std::clamp(params_[kParamMorph], 0.f, 1.f);
  s.dcLin = std::clamp(Dsp::dbToLin(std::clamp(params_[kParamDc], -12.f, 12.f)), 0.25f, 4.f);
  s.aa = std::clamp(params_[kParamAntiAliasing], 0.f, 1.f);
  return s;
}

void CrusherPlugin::applyCrushParams(const BlockState& s)
{
  bit_.setParams(s.bits, s.morph, s.mode, s.dcLin, s.aa);
}

void CrusherPlugin::observeSend(float sendL, float sendR)
{
  const float peak = std::max(std::fabs(sendL), std::fabs(sendR));
  if (peak >= shapeZone_)
    shapeZone_ = peak;
  else
    shapeZone_ *= shapeZoneFall_;

  const float x = (std::fabs(sendL) >= std::fabs(sendR)) ? sendL : sendR;
  const float xn = std::clamp(x, -1.f, 1.f);
  const float t = (xn + 1.f) * 0.5f * static_cast<float>(kShapeHistBins);
  int bin = static_cast<int>(t);
  if (bin >= kShapeHistBins)
    bin = kShapeHistBins - 1;
  if (bin < 0)
    bin = 0;
  histAcc_[bin] += 1.f;
}

tresult PLUGIN_API CrusherPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);

  const BlockState state = makeBlockState();
  applyCrushParams(state);
  io_.setBypassGains(state.bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  const bool hasHostAudio = io_.begin(data);
  if (!hasHostAudio)
    return kResultOk;

  const int32 nFrames = data.numSamples;
  if (nFrames <= 0)
  {
    io_.end(data);
    return kResultOk;
  }

  if (state.bypass || io_.inputWasQuiet())
  {
    shapeZone_ *= std::pow(shapeZoneFall_, static_cast<float>(nFrames));
    io_.end(data);
    return kResultOk;
  }

  auto** outs = data.outputs[0].channelBuffers32;
  if (!outs || data.symbolicSampleSize != kSample32)
  {
    io_.end(data);
    return kResultOk;
  }

  const int32 nCh = data.outputs[0].numChannels;
  for (int32 i = 0; i < nFrames; ++i)
  {
    const float inL = outs[0][i];
    const float inR = (nCh > 1 && outs[1]) ? outs[1][i] : inL;
    observeSend(inL, inR);

    outs[0][i] = bit_.process(inL);
    Dsp::sanitizeDenormal(outs[0][i]);
    if (nCh > 1 && outs[1])
    {
      outs[1][i] = bit_.process(inR);
      Dsp::sanitizeDenormal(outs[1][i]);
    }
  }

  io_.end(data);
  return kResultOk;
}

int CrusherPlugin::takeShapePoint(float* out, int maxOut)
{
  const int need = 1 + kShapeHistBins;
  if (!out || maxOut < need)
    return 0;

  float peak = 0.f;
  for (int i = 0; i < kShapeHistBins; ++i)
    peak = std::max(peak, histAcc_[i]);
  const float inv = peak > 1.e-6f ? 1.f / peak : 0.f;
  constexpr float kHistDecay = 0.9835f; // ≈ e^{-1/60} at ~30 Hz viz
  for (int i = 0; i < kShapeHistBins; ++i)
  {
    const float v = histAcc_[i] * inv;
    histDisp_[i] = std::max(histDisp_[i] * kHistDecay, v);
    histAcc_[i] = 0.f;
  }

  out[0] = std::clamp(shapeZone_, 0.f, 1.f);
  for (int i = 0; i < kShapeHistBins; ++i)
    out[1 + i] = std::clamp(histDisp_[i], 0.f, 1.f);
  return need;
}

tresult PLUGIN_API CrusherPlugin::setState(IBStream* state)
{
  if (!state)
    return kResultFalse;

  IBStreamer streamer(state, kLittleEndian);
  uint32 magic = 0;
  uint32 version = 0;
  int32 count = 0;
  if (!streamer.readInt32u(magic) || magic != kStateMagic)
    return kResultFalse;
  if (!streamer.readInt32u(version) || version < 1)
    return kResultFalse;
  if (!streamer.readInt32(count) || count < 0)
    return kResultFalse;

  const int32 n = std::min(count, static_cast<int32>(kParamCount));
  for (int32 i = 0; i < n; ++i)
  {
    float v = 0.f;
    if (!streamer.readFloat(v))
      return kResultFalse;
    params_[i] = v;
    if (auto* p = parameters.getParameter(i))
      p->setNormalized(p->toNormalized(v));
  }
  for (int32 i = n; i < count; ++i)
  {
    float discard = 0.f;
    if (!streamer.readFloat(discard))
      return kResultFalse;
  }

  notifyHostStateRestored();
  return kResultOk;
}

tresult PLUGIN_API CrusherPlugin::getState(IBStream* state)
{
  if (!state)
    return kResultFalse;

  IBStreamer streamer(state, kLittleEndian);
  if (!streamer.writeInt32u(kStateMagic))
    return kResultFalse;
  if (!streamer.writeInt32u(kStateVersion))
    return kResultFalse;
  if (!streamer.writeInt32(static_cast<int32>(kParamCount)))
    return kResultFalse;
  for (int32 i = 0; i < static_cast<int32>(kParamCount); ++i)
  {
    if (!streamer.writeFloat(params_[i]))
      return kResultFalse;
  }
  return kResultOk;
}

} // namespace Crusher
} // namespace calfNXT
