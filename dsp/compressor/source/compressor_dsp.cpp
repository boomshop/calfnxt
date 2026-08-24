#include "compressor_dsp.h"

#include "base/source/fstreamer.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace calfNXT {
namespace Compressor {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5843u; // 'CNXC'
constexpr uint32 kStateVersion = 6;

/** Fixed history plot window (ms) — keep in sync with CompressorHistoryChart. */
constexpr float kHistoryDisplayMs = 10000.f;

float linToDbSafe(float lin)
{
  if (!(lin > 1.0e-12f))
    return -96.f;
  return 20.f * std::log10(lin);
}

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

Dsp::StereoLink stereoLinkFromPlain(float v)
{
  switch (static_cast<int>(std::lround(std::clamp(v, 0.f, 2.f))))
  {
    case 1:
      return Dsp::StereoLink::Average;
    case 2:
      return Dsp::StereoLink::Mid;
    default:
      return Dsp::StereoLink::Max;
  }
}
} // namespace

CompressorPlugin::CompressorPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API CompressorPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoWithSidechainIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

void CompressorPlugin::resetProcessing()
{
  gr_.setSampleRate(static_cast<float>(sampleRate_));
  gr_.reset();
  sc_.setSampleRate(static_cast<float>(sampleRate_));
  sc_.reset();
  // ~20 dB/s fall — same idea as AUX LevelMeter falling=20 / 1000 ms.
  grMeter_.reset(static_cast<float>(sampleRate_));
  {
    std::lock_guard<std::mutex> lock(vizMutex_);
    pointInDb_ = -96.f;
    pointOutDb_ = -96.f;
  }

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

tresult PLUGIN_API CompressorPlugin::setActive(TBool state)
{
  if (state)
    resetProcessing();
  return EffectBase::setActive(state);
}

tresult PLUGIN_API CompressorPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  resetProcessing();
  return EffectBase::setupProcessing(newSetup);
}

CompressorPlugin::BlockState CompressorPlugin::makeBlockState() const
{
  BlockState state;
  state.mix = std::clamp(params_[kParamMix], 0.f, 1.f);
  state.dry = 1.f - state.mix;
  state.makeupDb = std::clamp(params_[kParamMakeup], 0.f, 24.f);
  state.makeupLin = Dsp::dbToLin(state.makeupDb);
  state.bypass = params_[kParamBypass] >= 0.5f;
  state.listen = params_[kParamListen] >= 0.5f;
  state.sidechainActive = params_[kParamSidechainActive] >= 0.5f;
  state.link = stereoLinkFromPlain(params_[kParamLink]);
  return state;
}

void CompressorPlugin::histFeedSample(float audioPeakLin, float detPeakLin, float grLin)
{
  const int pos = histPos_;
  histBuf_[pos + 0] = std::max(audioPeakLin, histBuf_[pos + 0]);
  histBuf_[pos + 1] = std::max(detPeakLin, histBuf_[pos + 1]);
  // Most reduction within the slot (smallest linear GR).
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

void CompressorPlugin::publishHistSnapshot()
{
  std::lock_guard<std::mutex> lock(histMutex_);
  std::memcpy(histSnapshot_, histBuf_, sizeof(histBuf_));
  histSnapshotPos_ = histPos_;
  histSnapshotSampleCount_ = histSampleCount_;
  histSnapshotSamplesPerSlot_ = histSamplesPerSlot_;
}

void CompressorPlugin::processSample(const BlockState& state, float& L, float& R, float scL,
                                     float scR)
{
  const float dryL = L;
  const float dryR = R;
  const float audioPeak = std::max(std::fabs(dryL), std::fabs(dryR));

  float detL = scL;
  float detR = scR;
  if (state.link == Dsp::StereoLink::Mid)
  {
    const float mid = sc_.processMono(0.5f * (scL + scR));
    detL = mid;
    detR = mid;
  }
  else
  {
    detL = sc_.processChannel(0, scL);
    detR = sc_.processChannel(1, scR);
  }

  if (state.listen && !state.bypass)
  {
    L = detL;
    R = detR;
    const float gr = gr_.processDetector(detL, detR);
    const float detPeak = std::max(std::fabs(detL), std::fabs(detR));
    grMeter_.process(gr);
    histFeedSample(audioPeak, detPeak, gr);
    return;
  }

  const float detPeak = std::max(std::fabs(detL), std::fabs(detR));

  // Bypass: keep audio + detector history, but GR meter/history show idle.
  if (state.bypass)
  {
    gr_.processDetector(detL, detR); // keep detector state continuous
    grMeter_.forceZero();
    histFeedSample(audioPeak, detPeak, 1.f);
    {
      std::lock_guard<std::mutex> lock(vizMutex_);
      const float inDb = linToDbSafe(gr_.lastDetectorLin());
      pointInDb_ = inDb;
      pointOutDb_ = inDb;
    }
    return;
  }

  const float gr = gr_.processDetector(detL, detR);
  const float det = gr_.lastDetectorLin();
  grMeter_.process(gr);
  histFeedSample(audioPeak, detPeak, gr);

  // Operating point uses curve GR (not lagged audio GR) so it stays on the line.
  const float inDb = linToDbSafe(det);
  const float outDb =
    inDb + linToDbSafe(gr_.lastCurveGain()) + state.makeupDb;
  {
    std::lock_guard<std::mutex> lock(vizMutex_);
    pointInDb_ = inDb;
    pointOutDb_ = outDb;
  }

  const float wetL = dryL * gr * state.makeupLin;
  const float wetR = dryR * gr * state.makeupLin;
  L = wetL * state.mix + dryL * state.dry;
  R = wetR * state.mix + dryR * state.dry;
}

int CompressorPlugin::takeGainReductionDb(float* out, int maxOut)
{
  if (!out || maxOut < 1)
    return 0;
  // Already ballistics-smoothed; never reset on poll.
  out[0] = grMeter_.takeDb();
  return 1;
}

int CompressorPlugin::takeDynamicsPoint(float* out, int maxOut)
{
  if (!out || maxOut < 2)
    return 0;
  std::lock_guard<std::mutex> lock(vizMutex_);
  out[0] = pointInDb_;
  out[1] = pointOutDb_;
  return 2;
}

int CompressorPlugin::takeEnvelopeDisplay(float* out, int maxOut)
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

void CompressorPlugin::configureVizBins(const char* id, int bins)
{
  if (!id || std::strcmp(id, vizEnvelopeId()) != 0)
    return;
  histVisibleSlots_ = std::max(kHistMinSlots, std::min(kHistSlots, bins));
}

tresult PLUGIN_API CompressorPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);

  const auto mode = detectorModeFromPlain(params_[kParamMode]);
  const auto link = stereoLinkFromPlain(params_[kParamLink]);

  sc_.setSampleRate(static_cast<float>(sampleRate_));
  sc_.setParams(
    params_[kParamHipass],
    params_[kParamLopass],
    Dsp::filterModeToStages(params_[kParamHpMode]),
    Dsp::filterModeToStages(params_[kParamLpMode]));

  gr_.setSampleRate(static_cast<float>(sampleRate_));
  gr_.setParams(
    params_[kParamAttack],
    params_[kParamRelease],
    params_[kParamThreshold],
    params_[kParamRatio],
    params_[kParamKnee],
    mode,
    link,
    params_[kParamPdr]);

  const BlockState state = makeBlockState();

  const int slots = std::max(kHistMinSlots, std::min(kHistSlots, histVisibleSlots_));
  histSamplesPerSlot_ = std::max(
    1, static_cast<int>(sampleRate_ * kHistoryDisplayMs * 0.001f / static_cast<float>(slots)));

  io_.setBypassGains(state.bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  const bool wantExtSc = state.sidechainActive && data.numInputs >= 2;
  const bool scBusActive = wantExtSc && isAudioInputActive(1);

  auto sidechainAt = [&](int32 i, float mainL, float mainR) {
    if (!scBusActive)
      return std::pair<float, float>(mainL, mainR);
    if (data.symbolicSampleSize == kSample32)
    {
      const auto& in = data.inputs[1];
      const float scL = in.channelBuffers32[0][i];
      const float scR = in.numChannels > 1 ? in.channelBuffers32[1][i] : scL;
      return std::pair<float, float>(scL, scR);
    }
    const auto& in = data.inputs[1];
    const float scL = static_cast<float>(in.channelBuffers64[0][i]);
    const float scR =
      in.numChannels > 1 ? static_cast<float>(in.channelBuffers64[1][i]) : scL;
    return std::pair<float, float>(scL, scR);
  };

  if (!io_.begin(data))
  {
    for (int32 i = 0; i < data.numSamples; ++i)
    {
      float zL = 0.f;
      float zR = 0.f;
      const auto [scL, scR] = sidechainAt(i, zL, zR);
      processSample(state, zL, zR, scL, scR);
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
      const auto [scL, scR] = sidechainAt(i, L, R);
      processSample(state, L, R, scL, scR);
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
      const auto [scL, scR] = sidechainAt(i, L, R);
      processSample(state, L, R, scL, scR);
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

tresult PLUGIN_API CompressorPlugin::setState(IBStream* state)
{
  if (!state)
    return kResultFalse;
  IBStreamer streamer(state, kLittleEndian);

  uint32 magic = 0;
  uint32 version = 0;
  int32 count = 0;
  if (!streamer.readInt32u(magic) || magic != kStateMagic)
    return kResultFalse;
  if (!streamer.readInt32u(version) || version > kStateVersion)
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
  notifyHostStateRestored();
  return kResultOk;
}

tresult PLUGIN_API CompressorPlugin::getState(IBStream* state)
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

} // namespace Compressor
} // namespace calfNXT
