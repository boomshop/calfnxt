#include "whammy_dsp.h"

#include "base/source/fstreamer.h"
#include "dsp_math.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Whammy {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5857u; // 'CNXW'
constexpr uint32 kStateVersion = 1;

// Grain length → latency ≈ half of this (Fast ~8 ms at 48 kHz).
constexpr float kGrainMs[4] = {16.f, 32.f, 64.f, 128.f};

// Match JS Math.round / AUX LinearSnap: ties toward +infinity (not std::round).
float snapPitchPlain(float pitch, float snapPlain)
{
  pitch = std::clamp(pitch, -24.f, 24.f);
  const int mode = static_cast<int>(std::lround(std::clamp(snapPlain, 0.f, 2.f)));
  if (mode <= 0)
    return pitch;
  const float step = mode >= 2 ? 2.f : 1.f;
  const float snapped = std::floor(pitch / step + 0.5f) * step;
  return std::clamp(snapped, -24.f, 24.f);
}
} // namespace

WhammyPlugin::WhammyPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API WhammyPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  quantizePitchParam();
  return kResultOk;
}

int WhammyPlugin::grainSamples(int quality) const
{
  const int q = std::clamp(quality, 0, 3);
  const float sr = static_cast<float>(sampleRate_ > 0.0 ? sampleRate_ : 44100.0);
  const int n = static_cast<int>(sr * kGrainMs[q] * 0.001f + 0.5f);
  return std::clamp(n, 128, Dsp::WhammyShifter::kSize / 2 - 16);
}

void WhammyPlugin::applyQuality(int quality)
{
  const int q = std::clamp(quality, 0, 3);
  if (q == quality_)
    return;
  quality_ = q;
  shifter_.setGrain(grainSamples(q));
  shifter_.reset();
}

void WhammyPlugin::updateLatency(bool forceZero)
{
  const uint32 want =
    forceZero ? 0u : static_cast<uint32>(std::max(1, shifter_.latency()));
  if (want == latencySamples_)
    return;
  const bool had = latencySamples_ > 0;
  latencySamples_ = want;
  // Do not restart from setup/reset (validator / Qtractor re-entrancy).
  // Notify only when an already-running latency actually changes (Quality).
  if (had && componentHandler)
    componentHandler->restartComponent(kLatencyChanged);
}

uint32 PLUGIN_API WhammyPlugin::getLatencySamples()
{
  return latencySamples_;
}

void WhammyPlugin::quantizePitchParam()
{
  const float snapped = snapPitchPlain(params_[kParamPitch], params_[kParamSnap]);
  if (std::abs(snapped - params_[kParamPitch]) < 1e-5f)
  {
    params_[kParamPitch] = snapped;
    return;
  }
  params_[kParamPitch] = snapped;
  if (auto* p = getParameterObject(kParamPitch))
    p->setNormalized(p->toNormalized(static_cast<double>(snapped)));
}

void WhammyPlugin::resetProcessing()
{
  quality_ = -1;
  quantizePitchParam();
  applyQuality(makeBlockState().quality);
  shifter_.reset();
  pitchSm_ = params_[kParamPitch];
  updateLatency(false);
}

tresult PLUGIN_API WhammyPlugin::setActive(TBool state)
{
  if (state)
    resetProcessing();
  else
    updateLatency(true);
  return EffectBase::setActive(state);
}

tresult PLUGIN_API WhammyPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  resetProcessing();
  return EffectBase::setupProcessing(newSetup);
}

WhammyPlugin::BlockState WhammyPlugin::makeBlockState() const
{
  BlockState s;
  s.bypass = params_[kParamBypass] >= 0.5f;
  s.quality = static_cast<int>(std::lround(std::clamp(params_[kParamQuality], 0.f, 3.f)));
  s.pitch = snapPitchPlain(params_[kParamPitch], params_[kParamSnap]);
  s.mix = std::clamp(params_[kParamMix], 0.f, 1.f);
  s.glideMs = std::clamp(params_[kParamGlide], 0.5f, 250.f);
  s.tone = std::clamp(params_[kParamTone], 0.f, 1.f);
  return s;
}

tresult PLUGIN_API WhammyPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);
  quantizePitchParam();

  const BlockState state = makeBlockState();
  applyQuality(state.quality);
  updateLatency(false);

  io_.setBypassGains(state.bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  if (!data.outputs || data.numOutputs < 1 || data.numSamples <= 0)
    return kResultOk;

  const bool hasHostAudio = io_.begin(data);

  const float sr = static_cast<float>(sampleRate_ > 0.0 ? sampleRate_ : 44100.0);
  shifter_.setTone(state.tone, sr);
  const float tau = std::max(0.0005f, state.glideMs * 0.001f);
  const float coeff = 1.f - std::exp(-1.f / (sr * tau));
  const bool gliding = std::fabs(state.pitch - pitchSm_) > 1e-4f;
  if (!gliding)
    pitchSm_ = state.pitch;
  float ratio = std::exp2(pitchSm_ / 12.f);

  const int32 nFrames = data.numSamples;
  const int32 nCh = data.outputs[0].numChannels;

  if (!hasHostAudio)
    data.outputs[0].silenceFlags = 0;

  auto run = [&](auto** out, bool zeros) {
    for (int32 i = 0; i < nFrames; ++i)
    {
      float L = zeros || nCh <= 0 ? 0.f : static_cast<float>(out[0][i]);
      float R = zeros || nCh <= 1 ? L : static_cast<float>(out[1][i]);
      if (zeros)
        R = 0.f;

      if (gliding)
      {
        pitchSm_ += (state.pitch - pitchSm_) * coeff;
        ratio = std::exp2(pitchSm_ / 12.f);
      }

      float oL = 0.f;
      float oR = 0.f;
      shifter_.process(L, R, ratio, std::fabs(pitchSm_), state.mix, state.bypass, oL, oR);
      if (nCh > 0)
        out[0][i] = oL;
      if (nCh > 1)
        out[1][i] = oR;
    }
  };

  if (data.symbolicSampleSize == kSample32)
  {
    if (!data.outputs[0].channelBuffers32)
      return kResultOk;
    run(data.outputs[0].channelBuffers32, !hasHostAudio);
  }
  else
  {
    if (!data.outputs[0].channelBuffers64)
      return kResultOk;
    run(data.outputs[0].channelBuffers64, !hasHostAudio);
  }

  io_.end(data);
  return kResultOk;
}

tresult PLUGIN_API WhammyPlugin::setState(IBStream* state)
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
  quantizePitchParam();
  pitchSm_ = params_[kParamPitch];
  notifyHostStateRestored();
  return kResultOk;
}

tresult PLUGIN_API WhammyPlugin::getState(IBStream* state)
{
  if (!state)
    return kResultFalse;
  IBStreamer streamer(state, kLittleEndian);
  streamer.writeInt32u(kStateMagic);
  streamer.writeInt32u(kStateVersion);
  streamer.writeInt32(kParamCount);
  readParamPlains(params_, kParamCount);
  quantizePitchParam();
  for (int i = 0; i < kParamCount; ++i)
    streamer.writeFloat(params_[i]);
  return kResultOk;
}

} // namespace Whammy
} // namespace calfNXT
