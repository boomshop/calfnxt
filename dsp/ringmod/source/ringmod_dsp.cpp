#include "ringmod_dsp.h"

#include "base/source/fstreamer.h"
#include "dsp_math.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Ringmod {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5852u; // 'CNXR'
constexpr uint32 kStateVersion = 1;

inline float centsRatio(float cents)
{
  return std::pow(2.f, cents / 1200.f);
}

inline float unipolar(float bipolar) { return (bipolar + 1.f) * 0.5f; }

inline float lerp(float lo, float hi, float t)
{
  return lo + (hi - lo) * t;
}

/** Lerp with unordered endpoints (Min/Max may be crossed in the UI briefly). */
inline float lerpRange(float a, float b, float t)
{
  const float lo = std::min(a, b);
  const float hi = std::max(a, b);
  return lerp(lo, hi, t);
}
} // namespace

RingmodPlugin::RingmodPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API RingmodPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

void RingmodPlugin::resetProcessing()
{
  const float sr = static_cast<float>(sampleRate_);
  modL_.activate();
  modR_.activate();
  lfo1_.activate();
  lfo2_.activate();
  applyBaseOscParams(makeBlockState());
  (void)sr;
  lfo1Activity_.store(0.f, std::memory_order_relaxed);
  lfo2Activity_.store(0.f, std::memory_order_relaxed);
}

tresult PLUGIN_API RingmodPlugin::setActive(TBool state)
{
  if (state)
    resetProcessing();
  else
  {
    modL_.deactivate();
    modR_.deactivate();
    lfo1_.deactivate();
    lfo2_.deactivate();
  }
  return EffectBase::setActive(state);
}

tresult PLUGIN_API RingmodPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  resetProcessing();
  return EffectBase::setupProcessing(newSetup);
}

RingmodPlugin::BlockState RingmodPlugin::makeBlockState() const
{
  BlockState s;
  s.bypass = params_[kParamBypass] >= 0.5f;
  s.listen = params_[kParamModListen] >= 0.5f;
  s.lfo1FreqActive = params_[kParamLfo1ModFreqActive] >= 0.5f;
  s.lfo1DetuneActive = params_[kParamLfo1ModDetuneActive] >= 0.5f;
  s.lfo2Lfo1Active = params_[kParamLfo2Lfo1FreqActive] >= 0.5f;
  s.lfo2AmountActive = params_[kParamLfo2ModAmountActive] >= 0.5f;
  s.modMode = static_cast<int>(std::lround(std::clamp(params_[kParamModMode], 0.f, 4.f)));
  s.lfo1Mode = static_cast<int>(std::lround(std::clamp(params_[kParamLfo1Mode], 0.f, 4.f)));
  s.lfo2Mode = static_cast<int>(std::lround(std::clamp(params_[kParamLfo2Mode], 0.f, 4.f)));
  s.modFreq = std::clamp(params_[kParamModFreq], 1.f, 20000.f);
  s.modAmount = std::clamp(params_[kParamModAmount], 0.f, 1.f);
  s.modPhase = std::clamp(params_[kParamModPhase], 0.f, 1.f);
  s.modDetune = std::clamp(params_[kParamModDetune], -200.f, 200.f);
  s.lfo1Freq = std::clamp(params_[kParamLfo1Freq], 0.01f, 10.f);
  s.lfo2Freq = std::clamp(params_[kParamLfo2Freq], 0.01f, 10.f);
  s.lfo1FreqLo = std::clamp(params_[kParamLfo1ModFreqLo], 1.f, 20000.f);
  s.lfo1FreqHi = std::clamp(params_[kParamLfo1ModFreqHi], 1.f, 20000.f);
  s.lfo1DetuneLo = std::clamp(params_[kParamLfo1ModDetuneLo], -200.f, 200.f);
  s.lfo1DetuneHi = std::clamp(params_[kParamLfo1ModDetuneHi], -200.f, 200.f);
  s.lfo2Lfo1Lo = std::clamp(params_[kParamLfo2Lfo1FreqLo], 0.01f, 10.f);
  s.lfo2Lfo1Hi = std::clamp(params_[kParamLfo2Lfo1FreqHi], 0.01f, 10.f);
  s.lfo2AmountLo = std::clamp(params_[kParamLfo2ModAmountLo], 0.f, 1.f);
  s.lfo2AmountHi = std::clamp(params_[kParamLfo2ModAmountHi], 0.f, 1.f);
  return s;
}

void RingmodPlugin::applyBaseOscParams(const BlockState& s)
{
  const float sr = static_cast<float>(sampleRate_);
  lfo1_.setParams(s.lfo1Freq, s.lfo1Mode, 0.f, sr, 1.f);
  lfo2_.setParams(s.lfo2Freq, s.lfo2Mode, 0.f, sr, 1.f);
  const float detL = centsRatio(s.modDetune * 0.5f);
  const float detR = centsRatio(s.modDetune * -0.5f);
  modL_.setParams(s.modFreq * detL, s.modMode, 0.f, sr, 1.f);
  modR_.setParams(s.modFreq * detR, s.modMode, s.modPhase, sr, 1.f);
}

void RingmodPlugin::handleResets()
{
  const bool r1 = params_[kParamLfo1Reset] >= 0.5f;
  const bool r2 = params_[kParamLfo2Reset] >= 0.5f;
  if (r1 && !lfo1ResetArmed_)
    lfo1_.setPhase(0.f);
  if (r2 && !lfo2ResetArmed_)
    lfo2_.setPhase(0.f);
  lfo1ResetArmed_ = r1;
  lfo2ResetArmed_ = r2;
}

tresult PLUGIN_API RingmodPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);

  const BlockState state = makeBlockState();
  handleResets();
  applyBaseOscParams(state);

  io_.setBypassGains(state.bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  const bool hasHostAudio = io_.begin(data);
  if (!hasHostAudio)
    return kResultOk;

  const int32 nFrames = data.numSamples;
  const bool anyLfoMod = state.lfo1FreqActive || state.lfo1DetuneActive
    || state.lfo2Lfo1Active || state.lfo2AmountActive;

  auto storeEffective = [&](float modFreq, float modDetune, float modAmount, float lfo1Freq) {
    effModFreq_.store(modFreq, std::memory_order_relaxed);
    effModDetune_.store(modDetune, std::memory_order_relaxed);
    effModAmount_.store(modAmount, std::memory_order_relaxed);
    effLfo1Freq_.store(lfo1Freq, std::memory_order_relaxed);
  };

  // Sample LFO-driven effective controls + activity (for UI on idle/dry paths).
  auto publishLfoViz = [&](const BlockState& s) {
    float baseFreq = s.modFreq;
    float detune = s.modDetune;
    float amount = s.modAmount;
    float lfo1Freq = s.lfo1Freq;
    if (s.lfo1FreqActive)
    {
      baseFreq = std::clamp(
        lerpRange(s.lfo1FreqLo, s.lfo1FreqHi, unipolar(lfo1_.getValue())), 1.f, 20000.f);
      modL_.setFreq(baseFreq);
      modR_.setFreq(baseFreq);
    }
    if (s.lfo1DetuneActive)
    {
      detune = lerpRange(s.lfo1DetuneLo, s.lfo1DetuneHi, unipolar(lfo1_.getValue()));
      const float f = s.lfo1FreqActive ? baseFreq : s.modFreq;
      modL_.setFreq(f * centsRatio(detune * 0.5f));
      modR_.setFreq(f * centsRatio(detune * -0.5f));
    }
    if (s.lfo2Lfo1Active)
    {
      lfo1Freq = std::clamp(
        lerpRange(s.lfo2Lfo1Lo, s.lfo2Lfo1Hi, unipolar(lfo2_.getValue())), 0.01f, 10.f);
      lfo1_.setFreq(lfo1Freq);
    }
    if (s.lfo2AmountActive)
      amount = std::clamp(
        lerpRange(s.lfo2AmountLo, s.lfo2AmountHi, unipolar(lfo2_.getValue())), 0.f, 1.f);
    storeEffective(baseFreq, detune, amount, lfo1Freq);
    lfo1Activity_.store(unipolar(lfo1_.getValue()), std::memory_order_relaxed);
    lfo2Activity_.store(unipolar(lfo2_.getValue()), std::memory_order_relaxed);
  };

  auto advanceOscBlock = [&]() {
    lfo1_.advance(static_cast<uint32_t>(nFrames));
    lfo2_.advance(static_cast<uint32_t>(nFrames));
    modL_.advance(static_cast<uint32_t>(nFrames));
    modR_.advance(static_cast<uint32_t>(nFrames));
    publishLfoViz(state);
  };

  // Quiet: keep LFO/osc phase continuous, skip sample multiply.
  if (io_.inputWasQuiet())
  {
    advanceOscBlock();
    io_.end(data);
    return kResultOk;
  }

  // Fast path: bypass — keep oscillators in phase for clickless return.
  if (state.bypass)
  {
    advanceOscBlock();
    io_.end(data);
    return kResultOk;
  }

  // Fast path: dry only (amount≈0, no listen, amount not LFO-modulated).
  // Still publish LFO activity / effective when other LFO routes are active.
  if (!state.listen && state.modAmount <= 1.0e-6f && !state.lfo2AmountActive)
  {
    advanceOscBlock();
    io_.end(data);
    return kResultOk;
  }

  const int32 nCh = data.outputs[0].numChannels;
  float led1 = 0.f;
  float led2 = 0.f;
  float lastModFreq = state.modFreq;
  float lastModDetune = state.modDetune;
  float lastModAmount = state.modAmount;
  float lastLfo1Freq = state.lfo1Freq;

  auto run = [&](auto** out) {
    for (int32 i = 0; i < nFrames; ++i)
    {
      float L = nCh > 0 ? static_cast<float>(out[0][i]) : 0.f;
      float R = nCh > 1 ? static_cast<float>(out[1][i]) : L;

      float baseFreq = state.modFreq;
      float detune = state.modDetune;
      float amount = state.modAmount;
      float lfo1Freq = state.lfo1Freq;

      if (anyLfoMod)
      {
        if (state.lfo1FreqActive)
        {
          baseFreq = std::clamp(
            lerpRange(state.lfo1FreqLo, state.lfo1FreqHi, unipolar(lfo1_.getValue())),
            1.f, 20000.f);
          modL_.setFreq(baseFreq);
          modR_.setFreq(baseFreq);
        }
        if (state.lfo1DetuneActive)
        {
          detune = lerpRange(
            state.lfo1DetuneLo, state.lfo1DetuneHi, unipolar(lfo1_.getValue()));
          const float f = state.lfo1FreqActive ? baseFreq : state.modFreq;
          modL_.setFreq(f * centsRatio(detune * 0.5f));
          modR_.setFreq(f * centsRatio(detune * -0.5f));
        }
        if (state.lfo2Lfo1Active)
        {
          lfo1Freq = std::clamp(
            lerpRange(state.lfo2Lfo1Lo, state.lfo2Lfo1Hi, unipolar(lfo2_.getValue())),
            0.01f, 10.f);
          lfo1_.setFreq(lfo1Freq);
        }
        if (state.lfo2AmountActive)
          amount = std::clamp(
            lerpRange(state.lfo2AmountLo, state.lfo2AmountHi, unipolar(lfo2_.getValue())),
            0.f, 1.f);
      }

      lastModFreq = baseFreq;
      lastModDetune = detune;
      lastModAmount = amount;
      lastLfo1Freq = lfo1Freq;

      float modulL = modL_.getValue() * amount;
      float modulR = modR_.getValue() * amount;
      Dsp::sanitize(modulL);
      Dsp::sanitize(modulR);

      float outL = 0.f;
      float outR = 0.f;
      if (state.listen)
      {
        outL = modulL;
        outR = modulR;
      }
      else
      {
        outL = L * modulL + L * (1.f - amount);
        outR = R * modulR + R * (1.f - amount);
      }
      Dsp::sanitize(outL);
      Dsp::sanitize(outR);

      if (nCh > 0)
        out[0][i] = outL;
      if (nCh > 1)
        out[1][i] = outR;

      // Last sample — LED follows the LFO waveform, not a block peak.
      led1 = unipolar(lfo1_.getValue());
      led2 = unipolar(lfo2_.getValue());

      lfo1_.advance(1);
      lfo2_.advance(1);
      modL_.advance(1);
      modR_.advance(1);
    }
  };

  if (data.symbolicSampleSize == kSample32)
    run(data.outputs[0].channelBuffers32);
  else
    run(data.outputs[0].channelBuffers64);

  lfo1Activity_.store(led1, std::memory_order_relaxed);
  lfo2Activity_.store(led2, std::memory_order_relaxed);
  storeEffective(lastModFreq, lastModDetune, lastModAmount, lastLfo1Freq);
  io_.end(data);
  return kResultOk;
}

int RingmodPlugin::takeLfoActivity(float* out, int maxOut)
{
  if (!out || maxOut < 2)
    return 0;
  out[0] = lfo1Activity_.load(std::memory_order_relaxed);
  out[1] = lfo2Activity_.load(std::memory_order_relaxed);
  return 2;
}

int RingmodPlugin::takeRingmodEffective(float* out, int maxOut)
{
  if (!out || maxOut < 4)
    return 0;
  out[0] = effModFreq_.load(std::memory_order_relaxed);
  out[1] = effModDetune_.load(std::memory_order_relaxed);
  out[2] = effModAmount_.load(std::memory_order_relaxed);
  out[3] = effLfo1Freq_.load(std::memory_order_relaxed);
  return 4;
}

tresult PLUGIN_API RingmodPlugin::setState(IBStream* state)
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

tresult PLUGIN_API RingmodPlugin::getState(IBStream* state)
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

} // namespace Ringmod
} // namespace calfNXT
