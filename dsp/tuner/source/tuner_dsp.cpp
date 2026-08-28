#include "tuner_dsp.h"

#include "base/source/fstreamer.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace calfNXT {
namespace Tuner {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x54554e52u; // 'TUNR'
constexpr uint32 kStateVersion = 1;

int nextPow2(int v)
{
  int n = 1;
  while (n < v)
    n <<= 1;
  return n;
}

uint16_t noteMaskFromParams(const float* p)
{
  uint16_t mask = 0;
  const int base = kParamNoteC;
  for (int i = 0; i < 12; ++i)
  {
    if (p[base + i] >= 0.5f)
      mask |= static_cast<uint16_t>(1u << i);
  }
  return mask;
}
} // namespace

TunerPlugin::TunerPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API TunerPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

int TunerPlugin::detectDecimation() const
{
  int dec = 1;
  const double sr = sampleRate_ > 0.0 ? sampleRate_ : 44100.0;
  while (sr / double(dec) > 48000.01)
    dec <<= 1;
  return std::max(1, dec);
}

int TunerPlugin::yinWindow(const BlockState& state) const
{
  const float detectSr = static_cast<float>(sampleRate_ / double(detectDecimation()));
  const float winSec = 0.024f + 0.068f * std::clamp(state.quality, 0.f, 1.f);
  int win = nextPow2(std::max(256, static_cast<int>(detectSr * winSec)));
  return std::clamp(win, 1024, Dsp::YinDetector::kMaxWin);
}

int TunerPlugin::computeLatency(const BlockState& state) const
{
  const int dec = detectDecimation();
  const int win = yinWindow(state);
  const float sr = static_cast<float>(sampleRate_ > 0.0 ? sampleRate_ : 44100.0);
  const float fmin = std::clamp(state.fmin, 25.f, 400.f);
  const int maxPeriod = std::max(64, static_cast<int>(sr / fmin));
  const int lat = (win * dec) / 2 + maxPeriod + 32;
  return std::clamp(lat, 128, Dsp::LinkedPsola::kSize / 4);
}

void TunerPlugin::updateLatency(const BlockState& state, bool forceZero)
{
  const uint32 want = forceZero ? 0u : static_cast<uint32>(computeLatency(state));
  if (want == latencySamples_)
    return;
  const bool had = latencySamples_ > 0;
  latencySamples_ = want;
  // Do not restart from setup/reset (validator / Qtractor re-entrancy).
  // Notify only when an already-running latency actually changes (Quality / Low).
  if (had && componentHandler)
    componentHandler->restartComponent(kLatencyChanged);
}

uint32 PLUGIN_API TunerPlugin::getLatencySamples()
{
  return latencySamples_;
}

void TunerPlugin::resetProcessing()
{
  psola_.reset();
  yin_.reset();
  corrector_.reset();
  hopCount_ = 0;
  hopRatioFrom_ = hopRatioTo_ = 1.f;
  hopPeriodFrom_ = hopPeriodTo_ = 200.f;
  std::memset(yinBuf_, 0, sizeof(yinBuf_));
  std::memset(histBuf_, 0, sizeof(histBuf_));
  histPos_ = 0;
  histSampleCount_ = 0;
  {
    std::lock_guard<std::mutex> lock(histMutex_);
    std::memset(histSnapshot_, 0, sizeof(histSnapshot_));
    histSnapshotPos_ = 0;
    histSnapshotSampleCount_ = 0;
  }
  const BlockState st = makeBlockState();
  const float sr = static_cast<float>(sampleRate_ > 0.0 ? sampleRate_ : 44100.0);
  hopSize_ = std::max(64, static_cast<int>(sr * 0.008));
  histSamplesPerSlot_ =
    std::max(1, static_cast<int>(sr * (kHistoryDisplayMs * 0.001f) / float(kHistSlots)));
  updateLatency(st, false);
}

tresult PLUGIN_API TunerPlugin::setActive(TBool state)
{
  if (state)
    resetProcessing();
  else
    updateLatency(makeBlockState(), true);
  return EffectBase::setActive(state);
}

tresult PLUGIN_API TunerPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  resetProcessing();
  return EffectBase::setupProcessing(newSetup);
}

TunerPlugin::BlockState TunerPlugin::makeBlockState() const
{
  BlockState s;
  s.bypass = params_[kParamBypass] >= 0.5f;
  s.source = std::clamp(static_cast<int>(std::lround(params_[kParamProfile])), 0, 2);
  s.quality = std::clamp(params_[kParamQuality], 0.f, 1.f);
  s.formant = std::clamp(params_[kParamFormant], 0.f, 1.f);
  s.retuneMs = params_[kParamRetune];
  s.releaseMs = params_[kParamRelease];
  s.amount = std::clamp(params_[kParamAmount], 0.f, 1.f);
  s.thresholdCents = params_[kParamThreshold];
  s.flexCents = params_[kParamFlex];
  s.vibrato = std::clamp(params_[kParamVibrato], 0.f, 1.f);
  s.settle = std::clamp(params_[kParamSettle], 0.f, 1.f);
  s.vibOn = params_[kParamVibOn] >= 0.5f;
  s.vibDelayMs = params_[kParamVibDelay];
  s.vibFadeMs = params_[kParamVibFade];
  s.vibHz = params_[kParamVibRate];
  s.octaveProtect = std::clamp(params_[kParamOctaveProtect], 0.f, 1.f);
  s.unvoiced = std::clamp(params_[kParamUnvoiced], 0.f, 1.f);
  s.detect = static_cast<int>(std::lround(std::clamp(params_[kParamDetect], 0.f, 3.f)));
  s.fmin = params_[kParamFmin];
  s.fmax = std::max(params_[kParamFmax], s.fmin + 20.f);
  s.refHz = params_[kParamRef];
  s.noteMask = noteMaskFromParams(params_);
  return s;
}

void TunerPlugin::copyYinWindow(const BlockState& state, int latency)
{
  const int dec = detectDecimation();
  const int win = yinWindow(state);
  const int half = (win / 2) * dec;
  for (int i = 0; i < win; ++i)
  {
    float acc = 0.f;
    // Oldest first; window centred on the delayed "now" (delay = latency).
    const int centreOff = half - i * dec;
    for (int d = 0; d < dec; ++d)
    {
      const int delay = latency + centreOff - d;
      acc += psola_.peekDetect(delay, state.detect);
    }
    yinBuf_[i] = acc / float(dec);
  }
}

void TunerPlugin::histFeed(float inMidi, float tgtMidi, float conf, float flags, float corrCents)
{
  const int pos = histPos_;
  histBuf_[pos + 0] = inMidi;
  histBuf_[pos + 1] = tgtMidi;
  histBuf_[pos + 2] = conf;
  histBuf_[pos + 3] = flags;
  histBuf_[pos + 4] = corrCents;
  ++histSampleCount_;
  if (histSampleCount_ >= histSamplesPerSlot_)
  {
    histSampleCount_ = 0;
    histPos_ = (histPos_ + kHistChannels) % kHistBufSize;
    histBuf_[histPos_ + 0] = inMidi;
    histBuf_[histPos_ + 1] = tgtMidi;
    histBuf_[histPos_ + 2] = conf;
    histBuf_[histPos_ + 3] = flags;
    histBuf_[histPos_ + 4] = corrCents;
    publishHistSnapshot();
  }
}

void TunerPlugin::publishHistSnapshot()
{
  std::lock_guard<std::mutex> lock(histMutex_);
  std::memcpy(histSnapshot_, histBuf_, sizeof(histBuf_));
  histSnapshotPos_ = histPos_;
  histSnapshotSampleCount_ = histSampleCount_;
  histSnapshotSamplesPerSlot_ = histSamplesPerSlot_;
}

int TunerPlugin::takePitchHistory(float* out, int maxOut)
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
      out[i * kHistChannels + 0] = histSnapshot_[srcIdx + 0];
      out[i * kHistChannels + 1] = histSnapshot_[srcIdx + 1];
      out[i * kHistChannels + 2] = histSnapshot_[srcIdx + 2];
      out[i * kHistChannels + 3] = histSnapshot_[srcIdx + 3];
      out[i * kHistChannels + 4] = histSnapshot_[srcIdx + 4];
    }
  }
  out[outCount] = std::clamp(phase, 0.f, 1.f);
  return outCount + 1;
}

void TunerPlugin::configureVizBins(const char* id, int bins)
{
  if (!id || std::strcmp(id, vizPitchId()) != 0)
    return;
  histVisibleSlots_ = std::max(kHistMinSlots, std::min(kHistSlots, bins));
}

tresult PLUGIN_API TunerPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);

  const BlockState state = makeBlockState();
  updateLatency(state, false);

  io_.setBypassGains(state.bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  if (!data.outputs || data.numOutputs < 1 || data.numSamples <= 0)
    return kResultOk;

  const bool hasHostAudio = io_.begin(data);
  const int32 nFrames = data.numSamples;
  const int32 nCh = data.outputs[0].numChannels;
  const int latency = static_cast<int>(std::max(1u, latencySamples_));
  const float sr = static_cast<float>(sampleRate_ > 0.0 ? sampleRate_ : 44100.0);
  hopSize_ = std::max(64, static_cast<int>(sr * 0.008));
  histSamplesPerSlot_ =
    std::max(1, static_cast<int>(sr * (kHistoryDisplayMs * 0.001f) / float(kHistSlots)));

  const float detectSr = sr / float(detectDecimation());
  const int win = yinWindow(state);

  Dsp::PitchCorrector::Params cp;
  cp.source = state.source;
  cp.retuneMs = state.retuneMs;
  cp.releaseMs = state.releaseMs;
  cp.amount = state.amount;
  cp.thresholdCents = state.thresholdCents;
  cp.flexCents = state.flexCents;
  cp.vibratoPreserve = state.vibrato;
  cp.settle = state.settle;
  cp.vibOn = state.vibOn;
  cp.vibDelayMs = state.vibDelayMs;
  cp.vibFadeMs = state.vibFadeMs;
  cp.vibHz = state.vibHz;
  cp.octaveProtect = state.octaveProtect;
  cp.refHz = state.refHz;
  cp.noteMask = state.noteMask;

  auto run = [&](auto** out, bool zeros) {
    for (int32 i = 0; i < nFrames; ++i)
    {
      float L = zeros || nCh <= 0 ? 0.f : static_cast<float>(out[0][i]);
      float R = zeros || nCh <= 1 ? L : static_cast<float>(out[1][i]);
      if (zeros)
        R = 0.f;

      psola_.write(L, R);

      if (++hopCount_ >= hopSize_)
      {
        hopCount_ = 0;
        copyYinWindow(state, latency);
        const auto yin = yin_.analyze(
          yinBuf_, win, detectSr, state.fmin, state.fmax, state.unvoiced, state.source);
        const float f0 = yin.f0Hz;
        const float hopSec = float(hopSize_) / sr;
        corrector_.update(f0, yin.confidence, yin.voiced, yin.octaveSuspect, hopSec, cp);

        hopRatioFrom_ = hopRatioTo_;
        hopRatioTo_ = corrector_.last().ratio;
        hopPeriodFrom_ = hopPeriodTo_;
        const auto& corHop = corrector_.last();
        float period = hopPeriodTo_;
        if (corHop.voiced && f0 > 1.f)
        {
          const float pNew = sr / f0;
          if (corHop.reattack || !(hopPeriodTo_ > 16.f))
          {
            // New syllable: lock grains to this period. Do not lerp from the
            // pause / previous note or the first grain train clicks.
            hopPeriodFrom_ = pNew;
            period = pNew;
            psola_.snapPeriod(pNew);
          }
          else
          {
            const float rel = pNew / std::max(16.f, hopPeriodTo_);
            if (rel > 0.89f && rel < 1.12f)
              period = pNew;
            else
              period = hopPeriodTo_ + (pNew - hopPeriodTo_) * 0.25f;
          }
        }
        hopPeriodTo_ = std::max(16.f, period);
      }

      const auto& cor = corrector_.last();
      const float hopT = hopSize_ > 1 ? float(hopCount_) / float(hopSize_) : 1.f;
      const float ratio = hopRatioFrom_ + (hopRatioTo_ - hopRatioFrom_) * hopT;
      const float period = hopPeriodFrom_ + (hopPeriodTo_ - hopPeriodFrom_) * hopT;

      float wetL = 0.f, wetR = 0.f, dryL = 0.f, dryR = 0.f;
      psola_.process(period, ratio, state.formant, latency, wetL, wetR, dryL, dryR);

      // Always run PSOLA (identity at ratio=1). Bypass is delayed dry so PDC stays valid.
      float oL = state.bypass ? dryL : wetL * cor.tremolo;
      float oR = state.bypass ? dryR : wetR * cor.tremolo;

      float flags = 0.f;
      if (cor.voiced)
        flags += 1.f;
      if (cor.unvoiced)
        flags += 2.f;
      if (cor.octaveSuspect)
        flags += 4.f;
      histFeed(cor.inMidi, cor.targetMidi, cor.confidence, flags, cor.correctionCents);

      if (nCh > 0)
        out[0][i] = oL;
      if (nCh > 1)
        out[1][i] = oR;
    }
  };

  if (!hasHostAudio && data.numOutputs > 0)
    data.outputs[0].silenceFlags = 0;

  if (data.symbolicSampleSize == kSample32)
  {
    if (data.outputs[0].channelBuffers32)
      run(data.outputs[0].channelBuffers32, !hasHostAudio);
  }
  else if (data.outputs[0].channelBuffers64)
    run(data.outputs[0].channelBuffers64, !hasHostAudio);

  io_.end(data);
  return kResultOk;
}

tresult PLUGIN_API TunerPlugin::setState(IBStream* state)
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
  notifyHostStateRestored();
  return kResultOk;
}

tresult PLUGIN_API TunerPlugin::getState(IBStream* state)
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

} // namespace Tuner
} // namespace calfNXT
