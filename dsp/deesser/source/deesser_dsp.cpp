#include "deesser_dsp.h"

#include "base/source/fstreamer.h"
#include "dsp_math.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace calfNXT {
namespace Deesser {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5844u; // 'CNXD'
constexpr uint32 kStateVersion = 1;

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

DeesserPlugin::DeesserPlugin()
  : Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API DeesserPlugin::initialize(FUnknown* context)
{
  const tresult r = EffectBase::initialize(context);
  if (r != kResultOk)
    return r;
  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

void DeesserPlugin::resetProcessing()
{
  gr_.setSampleRate(static_cast<float>(sampleRate_));
  gr_.reset();
  detector_.setSampleRate(static_cast<float>(sampleRate_));
  detector_.reset();
  splitL_.setSampleRate(static_cast<float>(sampleRate_));
  splitR_.setSampleRate(static_cast<float>(sampleRate_));
  splitL_.setBands(2);
  splitR_.setBands(2);
  splitL_.reset();
  splitR_.reset();
  grMeter_.reset(static_cast<float>(sampleRate_));

  std::memset(histBuf_, 0, sizeof(histBuf_));
  histPos_ = 0;
  histSampleCount_ = 0;
  histSamplesPerSlot_ = 1;
  histVisibleSlots_ = 160;
  {
    std::lock_guard<std::mutex> lock(histMutex_);
    std::memset(histSnapshot_, 0, sizeof(histSnapshot_));
    histSnapshotPos_ = 0;
    histSnapshotSampleCount_ = 0;
    histSnapshotSamplesPerSlot_ = 1;
  }
}

tresult PLUGIN_API DeesserPlugin::setActive(TBool state)
{
  if (state)
    resetProcessing();
  return EffectBase::setActive(state);
}

tresult PLUGIN_API DeesserPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  resetProcessing();
  return EffectBase::setupProcessing(newSetup);
}

DeesserPlugin::BlockState DeesserPlugin::makeBlockState() const
{
  BlockState state;
  state.makeupLin = Dsp::dbToLin(std::clamp(params_[kParamMakeup], 0.f, 24.f));
  state.bypass = params_[kParamBypass] >= 0.5f;
  state.listen = params_[kParamListen] >= 0.5f;
  state.split = params_[kParamMode] >= 0.5f;
  return state;
}

void DeesserPlugin::histFeedSample(float audioPeakLin, float detPeakLin, float grLin)
{
  const int pos = histPos_;
  histBuf_[pos + 0] = std::max(audioPeakLin, histBuf_[pos + 0]);
  histBuf_[pos + 1] = std::max(detPeakLin, histBuf_[pos + 1]);
  if (histBuf_[pos + 2] <= 0.f)
    histBuf_[pos + 2] = grLin;
  else
    histBuf_[pos + 2] = std::min(grLin, histBuf_[pos + 2]);

  histSampleCount_ += 1;
  if (histSampleCount_ >= histSamplesPerSlot_)
  {
    histPos_ = (pos + kHistChannels) % kHistBufSize;
    histSampleCount_ = 0;
    histBuf_[histPos_ + 0] = audioPeakLin;
    histBuf_[histPos_ + 1] = detPeakLin;
    histBuf_[histPos_ + 2] = grLin;
  }
}

void DeesserPlugin::publishHistSnapshot()
{
  std::lock_guard<std::mutex> lock(histMutex_);
  std::memcpy(histSnapshot_, histBuf_, sizeof(histBuf_));
  histSnapshotPos_ = histPos_;
  histSnapshotSampleCount_ = histSampleCount_;
  histSnapshotSamplesPerSlot_ = histSamplesPerSlot_;
}

void DeesserPlugin::processSample(const BlockState& state, float& L, float& R)
{
  const float dryL = L;
  const float dryR = R;
  const float audioPeak = std::max(std::fabs(dryL), std::fabs(dryR));

  float detL = 0.f;
  float detR = 0.f;
  detector_.processStereo(dryL, dryR, detL, detR);
  Dsp::sanitizeDenormal(detL);
  Dsp::sanitizeDenormal(detR);
  const float detPeak = std::max(std::fabs(detL), std::fabs(detR));

  const float gr = gr_.processDetector(detL, detR);
  grMeter_.process(gr);
  histFeedSample(audioPeak, detPeak, gr);

  // Always feed LR splitters so Wide↔Split stays continuous and states sanitize.
  float loL = 0.f;
  float hiL = 0.f;
  float loR = 0.f;
  float hiR = 0.f;
  splitL_.process2(dryL, loL, hiL);
  splitR_.process2(dryR, loR, hiR);

  if (state.listen && !state.bypass)
  {
    L = detL;
    R = detR;
    return;
  }

  if (state.bypass)
    return;

  if (state.split)
  {
    L = (loL + hiL * gr) * state.makeupLin;
    R = (loR + hiR * gr) * state.makeupLin;
  }
  else
  {
    L = dryL * gr * state.makeupLin;
    R = dryR * gr * state.makeupLin;
  }

  Dsp::sanitizeDenormal(L);
  Dsp::sanitizeDenormal(R);
}

int DeesserPlugin::takeGainReductionDb(float* out, int maxOut)
{
  if (!out || maxOut < 1)
    return 0;
  out[0] = grMeter_.takeDb();
  return 1;
}

int DeesserPlugin::takeEnvelopeDisplay(float* out, int maxOut)
{
  const int slots = std::max(kHistMinSlots, std::min(kHistSlots, histVisibleSlots_));
  const int outCount = slots * kHistChannels;
  if (maxOut < outCount + 1)
    return 0;

  float phase = 0.f;
  {
    std::lock_guard<std::mutex> lock(histMutex_);
    const int startPos =
      (kHistBufSize + histSnapshotPos_ - (slots - 1) * kHistChannels) % kHistBufSize;
    const int sps = std::max(1, histSnapshotSamplesPerSlot_);
    phase = static_cast<float>(histSnapshotSampleCount_) / static_cast<float>(sps);
    for (int i = 0; i < slots; ++i)
    {
      const int srcIdx = (startPos + i * kHistChannels) % kHistBufSize;
      out[i * kHistChannels + 0] = std::fabs(histSnapshot_[srcIdx + 0]);
      out[i * kHistChannels + 1] = std::fabs(histSnapshot_[srcIdx + 1]);
      float gr = histSnapshot_[srcIdx + 2];
      if (!(gr > 0.f))
        gr = 1.f;
      out[i * kHistChannels + 2] = std::clamp(gr, 1.0e-6f, 1.f);
    }
  }
  out[outCount] = std::clamp(phase, 0.f, 1.f);
  return outCount + 1;
}

void DeesserPlugin::configureVizBins(const char* id, int bins)
{
  if (!id || std::strcmp(id, vizEnvelopeId()) != 0)
    return;
  histVisibleSlots_ = std::max(kHistMinSlots, std::min(kHistSlots, bins));
}

tresult PLUGIN_API DeesserPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);

  const float laxity = std::clamp(params_[kParamLaxity], 1.f, 100.f);
  const float attackMs = laxity;
  const float releaseMs = laxity * 1.33f;
  const auto mode = detectorModeFromPlain(params_[kParamDetection]);

  gr_.setSampleRate(static_cast<float>(sampleRate_));
  gr_.setParams(
    attackMs,
    releaseMs,
    params_[kParamThreshold],
    params_[kParamRatio],
    kFixedKneeDb,
    mode,
    Dsp::StereoLink::Average,
    0.f);

  const float splitHz = params_[kParamSplitFreq];
  splitL_.setSlopeDb(params_[kParamSlope]);
  splitR_.setSlopeDb(params_[kParamSlope]);
  splitL_.setFreq(0, splitHz);
  splitR_.setFreq(0, splitHz);
  splitL_.prepareBlock();
  splitR_.prepareBlock();

  detector_.setSampleRate(static_cast<float>(sampleRate_));
  detector_.setParams(
    splitHz,
    params_[kParamHpQ],
    params_[kParamPeakFreq],
    params_[kParamPeakGain],
    params_[kParamPeakQ],
    splitL_.slope());
  detector_.prepareBlock();

  const BlockState state = makeBlockState();

  const int slots = std::max(kHistMinSlots, std::min(kHistSlots, histVisibleSlots_));
  histSamplesPerSlot_ = std::max(
    1, static_cast<int>(sampleRate_ * kHistoryDisplayMs * 0.001f / static_cast<float>(slots)));

  io_.setBypassGains(state.bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  if (!io_.begin(data))
  {
    for (int32 i = 0; i < data.numSamples; ++i)
    {
      float zL = 0.f;
      float zR = 0.f;
      processSample(state, zL, zR);
    }
    publishHistSnapshot();
    return kResultOk;
  }

  const int32 nFrames = data.numSamples;
  if (data.symbolicSampleSize == kSample32)
  {
    auto** out = data.outputs[0].channelBuffers32;
    const int32 nCh = data.outputs[0].numChannels;
    for (int32 i = 0; i < nFrames; ++i)
    {
      float L = nCh > 0 ? out[0][i] : 0.f;
      float R = nCh > 1 ? out[1][i] : L;
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
      float L = nCh > 0 ? static_cast<float>(out[0][i]) : 0.f;
      float R = nCh > 1 ? static_cast<float>(out[1][i]) : L;
      processSample(state, L, R);
      if (nCh > 0)
        out[0][i] = L;
      if (nCh > 1)
        out[1][i] = R;
    }
  }

  publishHistSnapshot();
  io_.end(data);
  return kResultOk;
}

tresult PLUGIN_API DeesserPlugin::setState(IBStream* state)
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
  return kResultOk;
}

tresult PLUGIN_API DeesserPlugin::getState(IBStream* state)
{
  if (!state)
    return kResultFalse;
  IBStreamer streamer(state, kLittleEndian);
  streamer.writeInt32u(kStateMagic);
  streamer.writeInt32u(kStateVersion);
  streamer.writeInt32(kParamCount);
  for (int i = 0; i < kParamCount; ++i)
    streamer.writeFloat(params_[i]);
  return kResultOk;
}

} // namespace Deesser
} // namespace calfNXT
