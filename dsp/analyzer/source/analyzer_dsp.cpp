#include "analyzer_dsp.h"

#include "base/source/fstreamer.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace calfNXT {
namespace Analyzer {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5855u; // 'CNXU'
constexpr uint32 kStateVersion = 1;
} // namespace

AnalyzerPlugin::AnalyzerPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API AnalyzerPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

tresult PLUGIN_API AnalyzerPlugin::setActive(TBool state)
{
  if (state)
  {
    spectrum_.setSampleRate(sampleRate_);
    spectrum_.reset();
    fieldTap_.setSampleRate(sampleRate_);
    fieldTap_.clearDisplay();
  }
  return EffectBase::setActive(state);
}

tresult PLUGIN_API AnalyzerPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  spectrum_.setSampleRate(sampleRate_);
  fieldTap_.setSampleRate(sampleRate_);
  return EffectBase::setupProcessing(newSetup);
}

tresult PLUGIN_API AnalyzerPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);

  const bool bypass = params_[kParamBypass] >= 0.5f;
  const bool hold = params_[kParamHold] >= 0.5f;
  spectrum_.setHold(hold);

  const int fftSel = static_cast<int>(std::lround(std::clamp(params_[kParamFftSize], 0.f, 3.f)));
  static constexpr int kFftSizes[4] = {1024, 2048, 4096, 8192};
  spectrum_.setFftSize(kFftSizes[fftSel]);

  io_.setBypassGains(bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  const bool hasHostAudio = io_.begin(data);
  const bool quietIn = !hasHostAudio || io_.inputWasQuiet();
  // Quiet: skip FFT/gonio — keep last display frame.
  if (quietIn)
  {
    if (hasHostAudio)
      io_.end(data);
    return kResultOk;
  }

  // Tap after in_gain (IoStage writes to outs); before out_gain (end).
  const int32 nFrames = data.numSamples;
  if (data.symbolicSampleSize == kSample32)
  {
    auto** out = data.outputs[0].channelBuffers32;
    const int32 nCh = data.outputs[0].numChannels;
    if (!bypass)
    {
      for (int32 i = 0; i < nFrames; ++i)
      {
        const float L = nCh > 0 ? out[0][i] : 0.f;
        const float R = nCh > 1 ? out[1][i] : L;
        spectrum_.process(L, R);
        fieldTap_.process(L, R);
      }
      spectrum_.publish();
      fieldTap_.publish();
    }
    else
    {
      spectrum_.clearDisplay();
      fieldTap_.clearDisplay();
    }
  }
  else
  {
    auto** out = data.outputs[0].channelBuffers64;
    const int32 nCh = data.outputs[0].numChannels;
    if (!bypass)
    {
      for (int32 i = 0; i < nFrames; ++i)
      {
        const float L = nCh > 0 ? static_cast<float>(out[0][i]) : 0.f;
        const float R = nCh > 1 ? static_cast<float>(out[1][i]) : L;
        spectrum_.process(L, R);
        fieldTap_.process(L, R);
      }
      spectrum_.publish();
      fieldTap_.publish();
    }
    else
    {
      spectrum_.clearDisplay();
      fieldTap_.clearDisplay();
    }
  }

  io_.end(data);
  return kResultOk;
}

int AnalyzerPlugin::takeCorrelation(float* out, int maxOut)
{
  if (!out || maxOut < 1)
    return 0;
  out[0] = fieldTap_.takeCorrelation();
  return 1;
}

int AnalyzerPlugin::takeGonio(float* out, int maxOut)
{
  return fieldTap_.takeGonio(out, maxOut);
}

int AnalyzerPlugin::takeSpectrum(float* out, int maxOut)
{
  return spectrum_.takeSpectrum(out, maxOut);
}

void AnalyzerPlugin::configureVizBins(const char* id, int bins)
{
  if (!id || bins < 1)
    return;
  if (std::strcmp(id, "fft") == 0)
    spectrum_.configureBins(bins);
}

tresult PLUGIN_API AnalyzerPlugin::setState(IBStream* state)
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

tresult PLUGIN_API AnalyzerPlugin::getState(IBStream* state)
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

} // namespace Analyzer
} // namespace calfNXT
