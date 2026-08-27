#include "delay_dsp.h"

#include "base/source/fstreamer.h"
#include "dsp_math.h"
#include "gain_util.h"
#include "pluginterfaces/vst/ivstprocesscontext.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Delay {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5845u; // 'CNXE'
constexpr uint32 kStateVersion = 1;

inline float lerp(float a, float b, float t) { return a + (b - a) * t; }

inline void delaylineImpl(
  int age,
  int deltime,
  float dryValue,
  float delayedValue,
  float& out,
  float& del,
  Dsp::SmoothGain& amt,
  Dsp::SmoothGain& fb)
{
  if (age <= deltime)
  {
    out = 0.f;
    del = dryValue;
    amt.step();
    fb.step();
    return;
  }
  float delayed = delayedValue;
  Dsp::sanitizeDenormal(delayed);
  out = delayed * amt.get();
  del = dryValue + delayed * fb.get();
  Dsp::sanitizeDenormal(out);
  Dsp::sanitizeDenormal(del);
}

inline void delayline2Impl(
  int age,
  int deltime,
  float dryValue,
  float delayedValue,
  float delayedFb,
  float& out,
  float& del,
  Dsp::SmoothGain& amt,
  Dsp::SmoothGain& fb)
{
  if (age <= deltime)
  {
    out = 0.f;
    del = dryValue;
    amt.step();
    fb.step();
    return;
  }
  float delayed = delayedValue;
  float fbTap = delayedFb;
  Dsp::sanitizeDenormal(delayed);
  Dsp::sanitizeDenormal(fbTap);
  out = delayed * amt.get();
  del = dryValue + fbTap * fb.get();
  Dsp::sanitizeDenormal(out);
  Dsp::sanitizeDenormal(del);
}
} // namespace

DelayPlugin::DelayPlugin()
  : Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API DelayPlugin::initialize(FUnknown* context)
{
  const tresult r = EffectBase::initialize(context);
  if (r != kResultOk)
    return r;
  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

void DelayPlugin::resetProcessing()
{
  std::memset(buffers_, 0, sizeof(buffers_));
  bufptr_ = 0;
  age_ = 0;
  amtL_.setSampleRate(static_cast<float>(sampleRate_));
  amtR_.setSampleRate(static_cast<float>(sampleRate_));
  fbL_.setSampleRate(static_cast<float>(sampleRate_));
  fbR_.setSampleRate(static_cast<float>(sampleRate_));
  dry_.setSampleRate(static_cast<float>(sampleRate_));
  chmix_.setSampleRate(static_cast<float>(sampleRate_));
  amtL_.reset(0.f);
  amtR_.reset(0.f);
  fbL_.reset(0.f);
  fbR_.reset(0.f);
  dry_.reset(1.f);
  chmix_.reset(0.f);
  fbFilter_.setSampleRate(static_cast<float>(sampleRate_));
  fbFilter_.reset();
  updateTimingAndGains();
}

tresult PLUGIN_API DelayPlugin::setActive(TBool state)
{
  if (state)
    resetProcessing();
  return EffectBase::setActive(state);
}

tresult PLUGIN_API DelayPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  resetProcessing();
  return EffectBase::setupProcessing(newSetup);
}

void DelayPlugin::updateTimingAndGains()
{
  const bool sync = params_[kParamSync] >= 0.5f;
  float bpm = std::clamp(params_[kParamBpm], 30.f, 300.f);
  if (sync && hostTempoValid_.load(std::memory_order_relaxed))
    bpm = std::clamp(hostTempoBpm_.load(std::memory_order_relaxed), 30.f, 300.f);
  // When not synced, BPM is SSOT; UI mirrors ms ↔ bpm. When synced, host tempo wins.

  const float subdiv = std::max(1.f, std::round(std::clamp(params_[kParamSubdiv], 1.f, 16.f)));
  const float timeL = std::max(1.f, std::round(std::clamp(params_[kParamTimeL], 1.f, 16.f)));
  const float timeR = std::max(1.f, std::round(std::clamp(params_[kParamTimeR], 1.f, 16.f)));

  const float unit = static_cast<float>(60.0 * sampleRate_ / (static_cast<double>(bpm) * subdiv));
  deltimeL_ = std::max(1, static_cast<int>(std::lround(unit * timeL)));
  deltimeR_ = std::max(1, static_cast<int>(std::lround(unit * timeR)));
  deltimeL_ = std::min(deltimeL_, kMaxDelay - 1);
  deltimeR_ = std::min(deltimeR_, kMaxDelay - 1);

  const int deltimeFb = deltimeL_ + deltimeR_;
  const float fb = std::clamp(params_[kParamFeedback], 0.f, 1.f);
  const float amount = Dsp::dbToLin(std::clamp(params_[kParamAmount], -60.f, 12.f));
  mixMode_ = static_cast<MixMode>(
    std::clamp(static_cast<int>(std::lround(params_[kParamMixMode])), 0, 3));
  active_ = params_[kParamActive] >= 0.5f;

  dry_.set(Dsp::dbToLin(std::clamp(params_[kParamDry], -60.f, 12.f)));
  chmix_.set((1.f - std::clamp(params_[kParamWidth], -1.f, 1.f)) * 0.5f);

  switch (mixMode_)
  {
    case MixStereo:
    {
      // Mutual wall-clock decay: both sides vs geometric mean of Time L/R.
      // When timeL==timeR → fbL=fbR=fb. Turning either time retunes both.
      const float tRef = std::sqrt(timeL * timeR);
      fbL_.set(std::pow(fb, timeL / std::max(1.e-6f, tRef)));
      fbR_.set(std::pow(fb, timeR / std::max(1.e-6f, tRef)));
      amtL_.set(amount);
      amtR_.set(amount);
      break;
    }
    case MixPingPong:
      fbL_.set(fb);
      fbR_.set(fb);
      amtL_.set(amount);
      amtR_.set(amount);
      break;
    case MixLR:
      fbL_.set(fb);
      fbR_.set(fb);
      amtL_.set(amount);
      amtR_.set(amount * std::pow(fb, static_cast<float>(deltimeR_) / std::max(1, deltimeFb)));
      break;
    case MixRL:
      fbL_.set(fb);
      fbR_.set(fb);
      amtL_.set(amount * std::pow(fb, static_cast<float>(deltimeL_) / std::max(1, deltimeFb)));
      amtR_.set(amount);
      break;
  }

  fbFilter_.setParams(
    params_[kParamHipass],
    params_[kParamLopass],
    Dsp::filterModeToStages(params_[kParamHpMode]),
    Dsp::filterModeToStages(params_[kParamLpMode]));
}

void DelayPlugin::processSample(float inL, float inR, float& outL, float& outR)
{
  const float lineInL = active_ ? inL : 0.f;
  const float lineInR = active_ ? inR : 0.f;

  float wetL = 0.f;
  float wetR = 0.f;
  float delL = 0.f;
  float delR = 0.f;

  switch (mixMode_)
  {
    case MixStereo:
    case MixPingPong:
    {
      const int v = mixMode_ == MixPingPong ? 1 : 0;
      delaylineImpl(
        age_,
        deltimeL_,
        lineInL,
        buffers_[v][(bufptr_ - deltimeL_) & kAddrMask],
        wetL,
        delL,
        amtL_,
        fbL_);
      delaylineImpl(
        age_,
        deltimeR_,
        lineInR,
        buffers_[1 - v][(bufptr_ - deltimeR_) & kAddrMask],
        wetR,
        delR,
        amtR_,
        fbR_);
      break;
    }
    case MixLR:
    case MixRL:
    {
      const int v = mixMode_ == MixRL ? 1 : 0;
      const int deltimeFb = deltimeL_ + deltimeR_;
      const int deltimeLCorr = mixMode_ == MixRL ? deltimeFb : deltimeL_;
      const int deltimeRCorr = mixMode_ == MixLR ? deltimeFb : deltimeR_;
      delayline2Impl(
        age_,
        deltimeL_,
        lineInL,
        buffers_[v][(bufptr_ - deltimeLCorr) & kAddrMask],
        buffers_[v][(bufptr_ - deltimeFb) & kAddrMask],
        wetL,
        delL,
        amtL_,
        fbL_);
      delayline2Impl(
        age_,
        deltimeR_,
        lineInR,
        buffers_[1 - v][(bufptr_ - deltimeRCorr) & kAddrMask],
        buffers_[1 - v][(bufptr_ - deltimeFb) & kAddrMask],
        wetR,
        delR,
        amtR_,
        fbR_);
      break;
    }
  }

  // Feedback tone after write-sum (simple HP/LP — not complementary LR).
  delL = fbFilter_.processChannel(0, delL);
  delR = fbFilter_.processChannel(1, delR);
  Dsp::sanitizeDenormal(delL);
  Dsp::sanitizeDenormal(delR);

  buffers_[0][bufptr_] = delL;
  buffers_[1][bufptr_] = delR;
  bufptr_ = (bufptr_ + 1) & kAddrMask;
  if (age_ < kMaxDelay)
    age_ += 1;

  // Track wet + recirculating write energy (Amount=0 still drains the line).
  const float tailPeak = std::max(
    std::max(std::fabs(wetL), std::fabs(wetR)),
    std::max(std::fabs(delL), std::fabs(delR)));
  if (tailPeak > blockTailPeak_)
    blockTailPeak_ = tailPeak;

  const float cm = chmix_.get();
  const float tmpL = lerp(wetL, wetR, cm);
  const float tmpR = lerp(wetR, wetL, cm);
  const float d = dry_.get();
  outL = inL * d + tmpL;
  outR = inR * d + tmpR;
  Dsp::sanitizeDenormal(outL);
  Dsp::sanitizeDenormal(outR);
}

int DelayPlugin::takeHostTempo(float* out, int maxOut)
{
  if (!out || maxOut < 2)
    return 0;
  out[0] = hostTempoValid_.load(std::memory_order_relaxed) ? 1.f : 0.f;
  out[1] = hostTempoBpm_.load(std::memory_order_relaxed);
  return 2;
}

tresult PLUGIN_API DelayPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);

  if (data.processContext
      && (data.processContext->state & ProcessContext::kTempoValid)
      && data.processContext->tempo > 0.0)
  {
    hostTempoBpm_.store(static_cast<float>(data.processContext->tempo), std::memory_order_relaxed);
    hostTempoValid_.store(1, std::memory_order_relaxed);
  }
  else
  {
    hostTempoValid_.store(0, std::memory_order_relaxed);
  }

  updateTimingAndGains();

  io_.setBypassGains(false);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  const bool hasHostAudio = io_.begin(data);
  const bool quietIn = !hasHostAudio || io_.inputWasQuiet();

  // Idle only when input is quiet AND delay/FB/gain slews are drained.
  if (quietIn && !engineHasTail())
  {
    if (hasHostAudio)
      io_.end(data);
    return kResultOk;
  }

  blockTailPeak_ = 0.f;

  if (!hasHostAudio)
  {
    // Host silenceFlags: outs may be absent/invalid (VST3 validator).
    // Drain delay state only — content-quiet path (Ardour) still writes tails.
    for (int32 i = 0; i < data.numSamples; ++i)
    {
      float zL = 0.f, zR = 0.f;
      processSample(0.f, 0.f, zL, zR);
    }
    lastTailPeak_ = blockTailPeak_;
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
      processSample(L, R, L, R);
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
      processSample(L, R, L, R);
      if (nCh > 0)
        out[0][i] = L;
      if (nCh > 1)
        out[1][i] = R;
    }
  }

  lastTailPeak_ = blockTailPeak_;
  io_.end(data);
  return kResultOk;
}

bool DelayPlugin::engineHasTail() const
{
  if (lastTailPeak_ > kIdleResidual)
    return true;
  // Amount / feedback / dry / width still slewing — keep advancing SmoothGain.
  if (!amtL_.isSettled() || !amtR_.isSettled() || !fbL_.isSettled() || !fbR_.isSettled()
      || !dry_.isSettled() || !chmix_.isSettled())
    return true;
  return false;
}

tresult PLUGIN_API DelayPlugin::setState(IBStream* state)
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

tresult PLUGIN_API DelayPlugin::getState(IBStream* state)
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

} // namespace Delay
} // namespace calfNXT
