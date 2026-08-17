#include "equalizer_dsp.h"

#include "base/source/fstreamer.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Equalizer {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5845u; // 'CNXE'
constexpr uint32 kStateVersion = 4;         // + mono (trailing)
constexpr uint32 kStateVersionSpectrum = 3; // + spectrum
constexpr uint32 kStateVersionBandsOnly = 2;
} // namespace

EqualizerPlugin::EqualizerPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API EqualizerPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  applyBandTargetsFromParams();
  return kResultOk;
}

tresult PLUGIN_API EqualizerPlugin::setActive(TBool state)
{
  if (state)
  {
    for (int i = 0; i < kEqBandCount; ++i)
    {
      bands_[i].setSampleRate(sampleRate_);
      bands_[i].reset();
    }
    spectrum_.setSampleRate(sampleRate_);
    spectrum_.reset();
    applyBandTargetsFromParams();
  }
  return EffectBase::setActive(state);
}

tresult PLUGIN_API EqualizerPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  for (int i = 0; i < kEqBandCount; ++i)
    bands_[i].setSampleRate(sampleRate_);
  spectrum_.setSampleRate(sampleRate_);
  return EffectBase::setupProcessing(newSetup);
}

void EqualizerPlugin::publishDisplayGains()
{
  for (int b = 0; b < kEqBandCount; ++b)
    displayGainsDb_[b] = bands_[b].displayGainDb();
}

int EqualizerPlugin::takeBandGainsDb(float* out, int maxOut)
{
  if (!out || maxOut <= 0)
    return 0;
  const int n = maxOut < kEqBandCount ? maxOut : kEqBandCount;
  for (int i = 0; i < n; ++i)
    out[i] = displayGainsDb_[i];
  return n;
}

int EqualizerPlugin::takeSpectrum(float* out, int maxOut)
{
  if (!spectrumActive_.load(std::memory_order_relaxed))
    return 0;
  return spectrum_.takeSpectrum(out, maxOut);
}

void EqualizerPlugin::configureVizBins(const char* id, int bins)
{
  if (!id || bins < 1)
    return;
  if (std::strcmp(id, "fft") == 0)
    spectrum_.configureBins(bins);
}

void EqualizerPlugin::applyBandTargetsFromParams()
{
  for (int b = 0; b < kEqBandCount; ++b)
  {
    const bool active = params_[bandParam(b, kBandActive)] >= 0.5f;
    const int type = static_cast<int>(std::lround(std::clamp(params_[bandParam(b, kBandType)], 0.f, 5.f)));
    const float slope = params_[bandParam(b, kBandSlope)];
    const float freq = params_[bandParam(b, kBandFreq)];
    const float gain = params_[bandParam(b, kBandGain)];
    const float q = params_[bandParam(b, kBandQ)];
    bands_[b].setTargets(active, type, slope, freq, gain, q);

    const bool dyn = params_[bandParam(b, kBandDyn)] >= 0.5f;
    const float attack = params_[bandParam(b, kBandDynAttack)];
    const float release = params_[bandParam(b, kBandDynRelease)];
    const float thresh = params_[bandParam(b, kBandDynThreshold)];
    const float ratio = params_[bandParam(b, kBandDynRatio)];
    bands_[b].setDynParams(dyn, attack, release, thresh, ratio);
    // Listen = dyn sidechain audition; needs the band on + dyn (never solo from stale state).
    bands_[b].setListen(active && dyn &&
                        params_[bandParam(b, kBandDynListen)] >= 0.5f);
  }
  publishDisplayGains();
}

bool EqualizerPlugin::hasAnyActiveBandsOrListen() const
{
  for (int b = 0; b < kEqBandCount; ++b)
  {
    if (bands_[b].isListening())
      return true;
    if (params_[bandParam(b, kBandActive)] >= 0.5f)
      return true;
  }
  return false;
}

tresult PLUGIN_API EqualizerPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);
  applyBandTargetsFromParams();

  const bool bypass = params_[kParamBypass] >= 0.5f;
  const bool mono = params_[kParamMono] >= 0.5f;
  const int spectrumMode =
    static_cast<int>(std::lround(std::clamp(params_[kParamSpectrum], 0.f, 3.f)));
  const bool spectrumOn = spectrumMode >= 1;
  spectrumActive_.store(spectrumOn, std::memory_order_relaxed);

  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);
  io_.setBypassGains(bypass);
  if (!io_.begin(data))
    return kResultOk;

  const bool doEq = !bypass && hasAnyActiveBandsOrListen();
  // Idle fast-path only when there is nothing to do — Mono still folds L→R.
  if (!doEq && !spectrumOn && !mono)
  {
    io_.end(data);
    return kResultOk;
  }

  if (spectrumOn)
  {
    spectrum_.setSampleRate(sampleRate_);
    spectrum_.setFftSize(2048);
    spectrum_.setHold(false);
  }

  int listenBand = -1;
  if (doEq)
  {
    for (int b = 0; b < kEqBandCount; ++b)
    {
      if (listenBand < 0 && bands_[b].isListening())
        listenBand = b;
    }
    for (int b = 0; b < kEqBandCount; ++b)
      bands_[b].prepareBlock();
  }

  const int32 nFrames = data.numSamples;
  const int32 nCh = data.outputs[0].numChannels;

  if (data.symbolicSampleSize == kSample32)
  {
    auto** out = data.outputs[0].channelBuffers32;
    for (int32 i = 0; i < nFrames; ++i)
    {
      float L = nCh > 0 ? out[0][i] : 0.f;
      float R = nCh > 1 ? out[1][i] : L;
      if (doEq)
      {
        if (mono)
        {
          if (listenBand >= 0)
            bands_[listenBand].processListenMono(L);
          else
          {
            for (int b = 0; b < kEqBandCount; ++b)
              bands_[b].processMono(L);
          }
        }
        else if (listenBand >= 0)
          bands_[listenBand].processListen(L, R);
        else
        {
          for (int b = 0; b < kEqBandCount; ++b)
            bands_[b].process(L, R);
        }
      }
      if (mono)
        R = L;
      // Post-EQ tap (before out_gain) — overlay shows the shaped signal.
      if (spectrumOn)
        spectrum_.process(L, mono ? L : R);
      if (nCh > 0)
        out[0][i] = L;
      if (nCh > 1)
        out[1][i] = R;
    }
  }
  else
  {
    auto** out = data.outputs[0].channelBuffers64;
    for (int32 i = 0; i < nFrames; ++i)
    {
      float L = nCh > 0 ? static_cast<float>(out[0][i]) : 0.f;
      float R = nCh > 1 ? static_cast<float>(out[1][i]) : L;
      if (doEq)
      {
        if (mono)
        {
          if (listenBand >= 0)
            bands_[listenBand].processListenMono(L);
          else
          {
            for (int b = 0; b < kEqBandCount; ++b)
              bands_[b].processMono(L);
          }
        }
        else if (listenBand >= 0)
          bands_[listenBand].processListen(L, R);
        else
        {
          for (int b = 0; b < kEqBandCount; ++b)
            bands_[b].process(L, R);
        }
      }
      if (mono)
        R = L;
      if (spectrumOn)
        spectrum_.process(L, mono ? L : R);
      if (nCh > 0)
        out[0][i] = L;
      if (nCh > 1)
        out[1][i] = R;
    }
  }

  if (doEq)
  {
    for (int b = 0; b < kEqBandCount; ++b)
      bands_[b].sanitize();
    publishDisplayGains();
  }

  if (spectrumOn)
    spectrum_.publish();

  io_.end(data);
  return kResultOk;
}

tresult PLUGIN_API EqualizerPlugin::setState(IBStream* state)
{
  if (!state)
    return kResultFalse;
  IBStreamer streamer(state, kLittleEndian);

  // Versioned chunk — refuse unversioned/legacy blobs (param layout shifted when
  // dyn_listen was added; byte-stream restore would scramble every band).
  uint32 magic = 0;
  uint32 version = 0;
  int32 count = 0;
  if (!streamer.readInt32u(magic) || magic != kStateMagic)
    return kResultFalse;
  if (!streamer.readInt32u(version))
    return kResultFalse;
  if (!streamer.readInt32(count) || count <= 0)
    return kResultFalse;

  // v2: bands only. v3: + spectrum. v4: + mono.
  const int32 expect =
    version == kStateVersion             ? kParamCount
    : version == kStateVersionSpectrum   ? kParamCount - 1
    : version == kStateVersionBandsOnly  ? kParamCount - 2
                                         : -1;
  if (expect < 0 || count != expect)
    return kResultFalse;

  float plains[kParamCount] {};
  for (int i = 0; i < count; ++i)
  {
    if (!streamer.readFloat(plains[i]))
      return kResultFalse;
  }
  // New trailing params keep their registered defaults when loading older state.
  for (int i = 0; i < kParamCount; ++i)
  {
    if (auto* p = getParameterObject(static_cast<ParamID>(i)))
      p->setNormalized(p->toNormalized(plains[i]));
  }
  readParamPlains(params_, kParamCount);
  applyBandTargetsFromParams();
  // Host may have cached defaults from setComponentHandler; refresh after restore.
  notifyHostStateRestored();
  return kResultOk;
}

tresult PLUGIN_API EqualizerPlugin::getState(IBStream* state)
{
  if (!state)
    return kResultFalse;
  IBStreamer streamer(state, kLittleEndian);
  streamer.writeInt32u(kStateMagic);
  streamer.writeInt32u(kStateVersion);
  streamer.writeInt32(kParamCount);
  // Parameter objects are authoritative (params_ only updates in process()).
  readParamPlains(params_, kParamCount);
  for (int i = 0; i < kParamCount; ++i)
    streamer.writeFloat(params_[i]);
  return kResultOk;
}

} // namespace Equalizer
} // namespace calfNXT
