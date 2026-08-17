#include "filter_dsp.h"

#include "base/source/fstreamer.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace calfNXT {
namespace Filter {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5846u; // 'CNXF'
constexpr uint32 kStateVersion = 6; // v6: + mono (trailing)

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
} // namespace

FilterPlugin::FilterPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API FilterPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

void FilterPlugin::resetProcessing()
{
  filter_.setSampleRate(static_cast<float>(sampleRate_));
  filter_.reset();
  envelope_.setSampleRate(static_cast<float>(sampleRate_));
  envelope_.reset();
  spectrum_.setSampleRate(sampleRate_);
  spectrum_.reset();
}

tresult PLUGIN_API FilterPlugin::setActive(TBool state)
{
  if (state)
    resetProcessing();
  return EffectBase::setActive(state);
}

tresult PLUGIN_API FilterPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  resetProcessing();
  return EffectBase::setupProcessing(newSetup);
}

FilterPlugin::BlockState FilterPlugin::makeBlockState() const
{
  BlockState s;
  s.bypass = params_[kParamBypass] >= 0.5f;
  s.mono = params_[kParamMono] >= 0.5f;
  s.envOn = params_[kParamEnvPower] >= 0.5f;
  s.spectrumOn =
    static_cast<int>(std::lround(std::clamp(params_[kParamSpectrum], 0.f, 3.f))) >= 1;
  s.mode = static_cast<int>(std::lround(std::clamp(params_[kParamMode], 0.f, 12.f)));
  s.resonance = params_[kParamResonance];
  s.frequency = params_[kParamFrequency];
  s.inertiaMs = params_[kParamInertia];
  s.mix = std::clamp(params_[kParamMix], 0.f, 1.f);
  s.softClip = std::clamp(params_[kParamSoftClip], 0.f, 1.f);
  s.target = params_[kParamTarget];
  s.activationLin = Dsp::dbToLin(params_[kParamActivation]);
  s.attackMs = params_[kParamAttack];
  s.releaseMs = params_[kParamRelease];
  s.detection = detectorModeFromPlain(params_[kParamDetection]);
  return s;
}

tresult PLUGIN_API FilterPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);

  const BlockState state = makeBlockState();
  spectrumActive_.store(state.spectrumOn, std::memory_order_relaxed);
  filter_.setInertiaMs(state.inertiaMs);
  filter_.setMode(state.mode);
  filter_.setResonanceInertia(state.resonance);
  if (!state.envOn)
    filter_.setCutoffInertia(state.frequency);

  io_.setBypassGains(state.bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  if (!io_.begin(data))
    return kResultOk;

  if (state.bypass && !state.spectrumOn)
  {
    effectiveCutoffHz_.store(state.frequency, std::memory_order_relaxed);
    io_.end(data);
    return kResultOk;
  }

  if (state.spectrumOn)
  {
    spectrum_.setSampleRate(sampleRate_);
    spectrum_.setFftSize(2048);
    spectrum_.setHold(false);
  }

  const int32 nFrames = data.numSamples;
  const int32 nCh = data.outputs[0].numChannels;

  // Block-rate envelope prep + log endpoints (avoid per-sample log10).
  if (!state.bypass && state.envOn)
    envelope_.prepare(state.attackMs, state.releaseMs);
  const float floorHz = std::clamp(state.frequency, 10.f, 20000.f);
  const float ceilHz = std::clamp(state.target, 10.f, 20000.f);
  const float logFloor = std::log10(floorHz);
  const float logCeil = std::log10(ceilHz);
  const bool targetBelow = ceilHz < floorHz;

  auto run = [&](auto** out) {
    for (int32 i = 0; i < nFrames; ++i)
    {
      float L = nCh > 0 ? static_cast<float>(out[0][i]) : 0.f;
      float R = nCh > 1 ? static_cast<float>(out[1][i]) : L;

      if (!state.bypass)
      {
        if (state.mono)
        {
          if (state.envOn)
          {
            const float env = std::clamp(
              envelope_.process(
                L, L, state.activationLin, state.attackMs, state.releaseMs,
                state.detection),
              0.f, 1.f);
            float freq = std::pow(10.f, (logCeil - logFloor) * env + logFloor);
            if (targetBelow)
              freq = std::max(ceilHz, std::min(floorHz, freq));
            else
              freq = std::min(ceilHz, std::max(floorHz, freq));
            filter_.setCutoffNow(freq);
          }
          filter_.processMono(L, state.mix, state.softClip);
          R = L;
        }
        else
        {
          if (state.envOn)
          {
            const float env = std::clamp(
              envelope_.process(
                L, R, state.activationLin, state.attackMs, state.releaseMs,
                state.detection),
              0.f, 1.f);
            float freq = std::pow(10.f, (logCeil - logFloor) * env + logFloor);
            if (targetBelow)
              freq = std::max(ceilHz, std::min(floorHz, freq));
            else
              freq = std::min(ceilHz, std::max(floorHz, freq));
            filter_.setCutoffNow(freq);
          }

          filter_.processStereo(L, R, state.mix, state.softClip);
        }
      }

      // Post-filter tap (before out_gain) — overlay shows the filtered signal.
      if (state.spectrumOn)
        spectrum_.process(L, state.mono ? L : R);

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

  if (state.bypass)
    effectiveCutoffHz_.store(state.frequency, std::memory_order_relaxed);
  else
    effectiveCutoffHz_.store(filter_.lastCutoffHz(), std::memory_order_relaxed);

  if (state.spectrumOn)
    spectrum_.publish();

  io_.end(data);
  return kResultOk;
}

int FilterPlugin::takeFilterCutoffHz(float* out, int maxOut)
{
  if (!out || maxOut < 1)
    return 0;
  out[0] = effectiveCutoffHz_.load(std::memory_order_relaxed);
  return 1;
}

int FilterPlugin::takeSpectrum(float* out, int maxOut)
{
  if (!spectrumActive_.load(std::memory_order_relaxed))
    return 0;
  return spectrum_.takeSpectrum(out, maxOut);
}

void FilterPlugin::configureVizBins(const char* id, int bins)
{
  if (!id || bins < 1)
    return;
  if (std::strcmp(id, "fft") == 0)
    spectrum_.configureBins(bins);
}

tresult PLUGIN_API FilterPlugin::setState(IBStream* state)
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
  // Append-only soft_clip / spectrum: older saves may have fewer plains.
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

tresult PLUGIN_API FilterPlugin::getState(IBStream* state)
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

} // namespace Filter
} // namespace calfNXT
