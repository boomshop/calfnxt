#include "tamer_dsp.h"

#include "base/source/fstreamer.h"
#include "channel_mode.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace calfNXT {
namespace Tamer {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5854u; // 'CNXT' family — Tamer
constexpr uint32 kStateVersion = 2; // v2: + channel
} // namespace

TamerPlugin::TamerPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API TamerPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

int TamerPlugin::qualityToFft(int quality)
{
  switch (std::clamp(quality, 0, 3))
  {
  case 0:
    return 1024;
  case 2:
    return 4096;
  case 3:
    return 8192;
  default:
    return 2048;
  }
}

void TamerPlugin::resetProcessing()
{
  tamer_.reset();
  flushLeft_ = 0;
  applyBlockState(makeBlockState());
  updateLatency();
}

void TamerPlugin::updateLatency()
{
  const uint32 want = tamer_.latencySamples();
  if (want == latencySamples_)
    return;
  const bool had = latencySamples_ > 0;
  latencySamples_ = want;
  if (had && componentHandler)
    componentHandler->restartComponent(kLatencyChanged);
}

uint32 PLUGIN_API TamerPlugin::getLatencySamples()
{
  return latencySamples_;
}

tresult PLUGIN_API TamerPlugin::setActive(TBool state)
{
  if (state)
    resetProcessing();
  return EffectBase::setActive(state);
}

tresult PLUGIN_API TamerPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  scratch64_.prepare(newSetup.maxSamplesPerBlock);
  tamer_.setSampleRate(sampleRate_);
  resetProcessing();
  return EffectBase::setupProcessing(newSetup);
}

TamerPlugin::BlockState TamerPlugin::makeBlockState() const
{
  BlockState s;
  s.bypass = params_[kParamBypass] >= 0.5f;
  s.diffListen = params_[kParamDiffListen] >= 0.5f;
  s.channel = Dsp::channelModeFromPlain(params_[kParamChannel]);
  s.fLo = std::clamp(params_[kParamFLo], 20.f, 20000.f);
  s.fHi = std::clamp(params_[kParamFHi], 20.f, 20000.f);
  s.hpSlope = std::clamp(params_[kParamHpSlope], 0.f, 4.f);
  s.lpSlope = std::clamp(params_[kParamLpSlope], 0.f, 4.f);
  s.depth = std::clamp(params_[kParamDepth], 0.f, 24.f);
  s.sharpness = std::clamp(params_[kParamSharpness], 1.f / 24.f, 0.5f);
  s.threshold = std::clamp(params_[kParamThreshold], 0.f, 24.f);
  s.harmonics = std::clamp(params_[kParamHarmonics], 0.f, 1.f);
  s.attack = std::clamp(params_[kParamAttack], 0.1f, 500.f);
  s.release = std::clamp(params_[kParamRelease], 1.f, 2000.f);
  s.quality = static_cast<int>(std::lround(std::clamp(params_[kParamQuality], 0.f, 3.f)));
  return s;
}

void TamerPlugin::applyBlockState(const BlockState& s)
{
  tamer_.setFftSize(qualityToFft(s.quality));
  tamer_.setParams(s.fLo, s.fHi, s.depth, s.sharpness, s.threshold, s.attack,
                   s.release, s.hpSlope, s.lpSlope, s.harmonics);
  updateLatency();
}

tresult PLUGIN_API TamerPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);

  const BlockState state = makeBlockState();
  applyBlockState(state);
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

  // channelBuffers32/64 share a union. A non-null 32-bit pointer is not proof
  // the block is float — Reaper's 64-bit path used to bail out here.
  const int32 nCh = data.outputs[0].numChannels;
  const bool is32 = data.symbolicSampleSize == kSample32;
  const bool is64 = data.symbolicSampleSize == kSample64;
  float* left32 = nullptr;
  float* right32 = nullptr;
  double* left64 = nullptr;
  double* right64 = nullptr;
  if (is32)
  {
    auto** outs = data.outputs[0].channelBuffers32;
    if (!outs || !outs[0])
    {
      io_.end(data);
      return kResultOk;
    }
    left32 = outs[0];
    right32 = (nCh > 1 && outs[1]) ? outs[1] : nullptr;
  }
  else if (is64)
  {
    auto** outs = data.outputs[0].channelBuffers64;
    if (!outs || !outs[0] || scratch64_.capacity() <= 0)
    {
      io_.end(data);
      return kResultOk;
    }
    left64 = outs[0];
    right64 = (nCh > 1 && outs[1]) ? outs[1] : nullptr;
  }
  else
  {
    io_.end(data);
    return kResultOk;
  }

  const bool quiet = io_.inputWasQuiet();
  const bool depthOn = state.depth > 1.0e-3f;
  const bool wantViz = vizConsumerActive();
  // Spectrum/GR share the processing STFT. Keep it running whenever the editor
  // is open (Bypass, Depth=0, host stop / quiet) so curves decay instead of
  // freezing. Park only with the UI hidden after the wet path has flushed.
  if (quiet)
    flushLeft_ = std::max(0, flushLeft_ - nFrames);
  else
    flushLeft_ =
      static_cast<int>(tamer_.latencySamples()) + tamer_.hopSize();

  const bool flushed = flushLeft_ <= 0;
  const bool needAudioStft = !state.bypass && depthOn;
  const bool runStft = wantViz || (needAudioStft && !(quiet && flushed));

  if (!runStft && quiet && flushed)
  {
    io_.end(data);
    return kResultOk;
  }

  bool ran = false;
  if (is32)
  {
    tamer_.process(left32, right32, nFrames, state.bypass, state.diffListen, runStft,
                   state.channel);
    ran = true;
  }
  else
  {
    ran = scratch64_.process(left64, right64, nFrames,
                             [&](float* left, float* right, int32 n) {
                               tamer_.process(left, right, n, state.bypass, state.diffListen,
                                              runStft, state.channel);
                             });
  }

  if (ran && wantViz)
    tamer_.publish();

  io_.end(data);
  return kResultOk;
}

int TamerPlugin::takeSpectrum(float* out, int maxOut)
{
  return tamer_.takeSpectrum(out, maxOut);
}

int TamerPlugin::takeFreqResponse(float* out, int maxOut)
{
  return tamer_.takeGrResponse(out, maxOut);
}

int TamerPlugin::takeHarmonicGuides(float* out, int maxOut)
{
  return tamer_.takeHarmonicGuides(out, maxOut);
}

void TamerPlugin::configureVizBins(const char* id, int bins)
{
  if (!id)
    return;
  if (std::strcmp(id, "fft") == 0 || std::strcmp(id, "tamer") == 0)
    tamer_.configureBins(bins);
}

tresult PLUGIN_API TamerPlugin::setState(IBStream* state)
{
  if (!state)
    return kResultFalse;

  IBStreamer streamer(state, kLittleEndian);
  uint32 magic = 0;
  uint32 version = 0;
  if (!streamer.readInt32u(magic) || magic != kStateMagic)
    return kResultFalse;
  if (!streamer.readInt32u(version) || version < 1)
    return kResultFalse;

  for (int i = 0; i < kParamCount; ++i)
  {
    double v = 0.0;
    if (!streamer.readDouble(v))
      return kResultFalse;
    if (auto* p = getParameterObject(i))
      p->setNormalized(p->toNormalized(v));
  }
  readParamPlains(params_, kParamCount);
  applyBlockState(makeBlockState());
  notifyHostStateRestored();
  return kResultOk;
}

tresult PLUGIN_API TamerPlugin::getState(IBStream* state)
{
  if (!state)
    return kResultFalse;

  IBStreamer streamer(state, kLittleEndian);
  streamer.writeInt32u(kStateMagic);
  streamer.writeInt32u(kStateVersion);
  readParamPlains(params_, kParamCount);
  for (int i = 0; i < kParamCount; ++i)
    streamer.writeDouble(params_[i]);
  return kResultOk;
}

} // namespace Tamer
} // namespace calfNXT
