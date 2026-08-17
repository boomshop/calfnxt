#include "pulsator_dsp.h"

#include "base/source/fstreamer.h"
#include "dsp_math.h"
#include "pluginterfaces/vst/ivstprocesscontext.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Pulsator {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5850u; // 'CNXP'
constexpr uint32 kStateVersion = 1;
} // namespace

PulsatorPlugin::PulsatorPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API PulsatorPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

float PulsatorPlugin::pulseWidthFromEnum(int pw)
{
  switch (pw)
  {
    case 0: return 0.125f;
    case 1: return 0.25f;
    case 2: return 0.5f;
    case 4: return 2.f;
    default:
    case 3: return 1.f;
  }
}

void PulsatorPlugin::resetProcessing()
{
  const float sr = static_cast<float>(sampleRate_);
  lfoL_.activate();
  lfoR_.activate();
  gainL_.setSampleRate(sr, 1.5f);
  gainR_.setSampleRate(sr, 1.5f);
  gainL_.reset(1.f);
  gainR_.reset(1.f);
  applyLfoParams(makeBlockState());
  publishLfoViz();
}

tresult PLUGIN_API PulsatorPlugin::setActive(TBool state)
{
  if (state)
    resetProcessing();
  else
  {
    lfoL_.deactivate();
    lfoR_.deactivate();
  }
  return EffectBase::setActive(state);
}

tresult PLUGIN_API PulsatorPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  resetProcessing();
  return EffectBase::setupProcessing(newSetup);
}

PulsatorPlugin::BlockState PulsatorPlugin::makeBlockState() const
{
  BlockState s;
  s.bypass = params_[kParamBypass] >= 0.5f;
  s.mono = params_[kParamMono] >= 0.5f;
  s.sync = params_[kParamSync] >= 0.5f;
  s.mode = static_cast<int>(std::lround(std::clamp(params_[kParamMode], 0.f, 4.f)));
  s.pulseWidth = static_cast<int>(std::lround(std::clamp(params_[kParamPulsewidth], 0.f, 4.f)));
  s.amount = std::clamp(params_[kParamAmount], 0.f, 1.f);
  s.offsetL = std::clamp(params_[kParamOffsetL], 0.f, 1.f);
  s.offsetR = std::clamp(params_[kParamOffsetR], 0.f, 1.f);
  s.bpm = std::clamp(params_[kParamBpm], 0.5f, 300.f);
  s.pw = pulseWidthFromEnum(s.pulseWidth);

  // Delay-style: BPM is SSOT (UI mirrors ms ↔ bpm). Sync locks to host tempo.
  // 0.5 BPM ≈ 0.0083 Hz ≈ 2 min/cycle — slow L↔R wandering.
  const bool hostValid = hostTempoValid_.load(std::memory_order_relaxed) != 0;
  float bpm = s.bpm;
  if (s.sync && hostValid)
    bpm = std::clamp(hostTempoBpm_.load(std::memory_order_relaxed), 0.5f, 300.f);
  s.freqHz = bpm / 60.f;
  return s;
}

void PulsatorPlugin::applyLfoParams(const BlockState& s)
{
  const float sr = static_cast<float>(sampleRate_);
  // Amount on the LFO scales bipolar amplitude; classic Calf passes amount here.
  lfoL_.setParams(s.freqHz, s.mode, s.offsetL, sr, s.amount, s.pw);
  lfoR_.setParams(s.freqHz, s.mode, s.offsetR, sr, s.amount, s.pw);
}

void PulsatorPlugin::handleReset()
{
  const bool pressed = params_[kParamReset] >= 0.5f;
  if (pressed && !resetArmed_)
  {
    lfoL_.setPhase(0.f);
    lfoR_.setPhase(0.f);
    resetArmed_ = true;
  }
  else if (!pressed)
    resetArmed_ = false;
}

void PulsatorPlugin::publishLfoViz()
{
  phaseL_.store(lfoL_.phase(), std::memory_order_relaxed);
  phaseR_.store(lfoR_.phase(), std::memory_order_relaxed);
  valL_.store(lfoL_.getValue(), std::memory_order_relaxed);
  valR_.store(lfoR_.getValue(), std::memory_order_relaxed);
}

void PulsatorPlugin::updateHostTempo(ProcessData& data)
{
  if (data.processContext && (data.processContext->state & ProcessContext::kTempoValid))
  {
    hostTempoBpm_.store(static_cast<float>(data.processContext->tempo), std::memory_order_relaxed);
    hostTempoValid_.store(1, std::memory_order_relaxed);
  }
  else
    hostTempoValid_.store(0, std::memory_order_relaxed);
}

tresult PLUGIN_API PulsatorPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);
  updateHostTempo(data);

  if (!io_.begin(data))
    return kResultOk;

  const int32 nFrames = data.numSamples;
  if (nFrames <= 0)
  {
    io_.end(data);
    return kResultOk;
  }

  handleReset();
  const BlockState state = makeBlockState();
  applyLfoParams(state);
  io_.setBypassGains(state.bypass);

  auto modGain = [](float lfoVal, float amount) {
    // Classic: out = in*((lfo*0.5 + amount/2)) + in*(1-amount)
    // → gain = (1-amount) + amount*(lfo_unit) where lfo_unit=(lfo/amount+1)/2 when amount>0
    // With SimpleLfo amount scaling, lfoVal ∈ [-amount,+amount], so:
    //   wetGain = lfoVal*0.5 + amount/2 = amount * (lfo_norm+1)/2
    //   total   = wetGain + (1-amount)
    return (1.f - amount) + (lfoVal * 0.5f + amount * 0.5f);
  };

  // Fast path: bypass — keep LFOs in phase for clickless return + chart.
  if (state.bypass)
  {
    lfoL_.advance(static_cast<uint32_t>(nFrames));
    lfoR_.advance(static_cast<uint32_t>(nFrames));
    gainL_.reset(1.f);
    gainR_.reset(1.f);
    publishLfoViz();
    io_.end(data);
    return kResultOk;
  }

  // Fast path: fully dry (amount≈0) — still advance LFOs for the chart.
  if (state.amount <= 1.0e-6f)
  {
    lfoL_.advance(static_cast<uint32_t>(nFrames));
    lfoR_.advance(static_cast<uint32_t>(nFrames));
    gainL_.reset(1.f);
    gainR_.reset(1.f);
    publishLfoViz();
    io_.end(data);
    return kResultOk;
  }

  const int32 nCh = data.outputs[0].numChannels;

  auto run = [&](auto** out) {
    for (int32 i = 0; i < nFrames; ++i)
    {
      float L = nCh > 0 ? static_cast<float>(out[0][i]) : 0.f;
      float R = nCh > 1 ? static_cast<float>(out[1][i]) : L;

      if (state.mono)
      {
        const float m = (L + R) * 0.5f;
        L = m;
        R = m;
      }

      const float targetL = modGain(lfoL_.getValue(), state.amount);
      const float targetR = modGain(lfoR_.getValue(), state.amount);
      const float gL = gainL_.process(targetL);
      const float gR = gainR_.process(targetR);

      float outL = L * gL;
      float outR = R * gR;
      Dsp::sanitize(outL);
      Dsp::sanitize(outR);

      if (nCh > 0)
        out[0][i] = outL;
      if (nCh > 1)
        out[1][i] = outR;

      lfoL_.advance(1);
      lfoR_.advance(1);
    }
  };

  if (data.symbolicSampleSize == kSample32)
    run(data.outputs[0].channelBuffers32);
  else
    run(data.outputs[0].channelBuffers64);

  publishLfoViz();
  io_.end(data);
  return kResultOk;
}

int PulsatorPlugin::takeHostTempo(float* out, int maxOut)
{
  if (!out || maxOut < 2)
    return 0;
  out[0] = hostTempoValid_.load(std::memory_order_relaxed) ? 1.f : 0.f;
  out[1] = hostTempoBpm_.load(std::memory_order_relaxed);
  return 2;
}

int PulsatorPlugin::takePulsatorLfo(float* out, int maxOut)
{
  if (!out || maxOut < 4)
    return 0;
  out[0] = phaseL_.load(std::memory_order_relaxed);
  out[1] = valL_.load(std::memory_order_relaxed);
  out[2] = phaseR_.load(std::memory_order_relaxed);
  out[3] = valR_.load(std::memory_order_relaxed);
  return 4;
}

tresult PLUGIN_API PulsatorPlugin::setState(IBStream* state)
{
  if (!state)
    return kResultFalse;
  IBStreamer streamer(state, kLittleEndian);

  uint32 magic = 0;
  uint32 version = 0;
  int32 count = 0;
  if (!streamer.readInt32u(magic) || magic != kStateMagic)
    return kResultFalse;
  if (!streamer.readInt32u(version) || version < 1)
    return kResultFalse;
  if (!streamer.readInt32(count) || count < 0)
    return kResultFalse;

  const int32 n = std::min(count, static_cast<int32>(kParamCount));
  for (int32 i = 0; i < n; ++i)
  {
    float v = 0.f;
    if (!streamer.readFloat(v))
      return kResultFalse;
    params_[i] = v;
    if (auto* p = parameters.getParameter(i))
      p->setNormalized(p->toNormalized(v));
  }
  for (int32 i = n; i < count; ++i)
  {
    float discard = 0.f;
    if (!streamer.readFloat(discard))
      return kResultFalse;
  }

  notifyHostStateRestored();
  return kResultOk;
}

tresult PLUGIN_API PulsatorPlugin::getState(IBStream* state)
{
  if (!state)
    return kResultFalse;
  IBStreamer streamer(state, kLittleEndian);
  if (!streamer.writeInt32u(kStateMagic))
    return kResultFalse;
  if (!streamer.writeInt32u(kStateVersion))
    return kResultFalse;
  if (!streamer.writeInt32(static_cast<int32>(kParamCount)))
    return kResultFalse;
  for (int32 i = 0; i < static_cast<int32>(kParamCount); ++i)
  {
    if (!streamer.writeFloat(params_[i]))
      return kResultFalse;
  }
  return kResultOk;
}

} // namespace Pulsator
} // namespace calfNXT
