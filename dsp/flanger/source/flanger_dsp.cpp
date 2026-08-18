#include "flanger_dsp.h"

#include "base/source/fstreamer.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace calfNXT {
namespace Flanger {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5846u; // 'CNXF'
constexpr uint32 kStateVersion = 1;

float linToDbSafe(float lin)
{
  if (!(lin > 1.0e-12f) || !std::isfinite(lin))
    return -96.f;
  return 20.f * std::log10(lin);
}

/**
 * Fill (fHz, dB) pairs at comb peaks and notches.
 * Positions: +fb peaks at k/τ, notches at (k+½)/τ (−fb swapped).
 * Heights: one analytical peak dB and one notch dB for the whole set —
 * per-frequency |H| jumps because fractional-delay freqGain drifts off the
 * ideal extrema (especially in the treble).
 */
int collectTeeth(const Dsp::SimpleFlanger& fx, float delaySamples, float sr, float fb,
                 float* fOut, float* dbOut, int maxTeeth)
{
  constexpr float kFMin = 20.f;
  constexpr float kFMax = 20000.f;
  if (maxTeeth < 1)
    return 0;

  const float delay = std::max(delaySamples, 1.f);
  const float spacing = sr / delay;
  const float peakOff = (fb >= 0.f) ? 0.f : 0.5f;
  const float dry = fx.dryLast();
  const float wet = fx.wetLast();
  // Ideal delayed = ±1 at extrema → real h, frequency-independent |dry+wet·h|.
  const float hPeak = (fb >= 0.f) ? (1.f / std::max(1.e-6f, 1.f - fb))
                                  : (-1.f / std::max(1.e-6f, 1.f + fb));
  const float hNotch = (fb >= 0.f) ? (-1.f / std::max(1.e-6f, 1.f + fb))
                                   : (1.f / std::max(1.e-6f, 1.f - fb));
  const float peakDb = linToDbSafe(std::fabs(dry + wet * hPeak));
  const float notchDb = linToDbSafe(std::fabs(dry + wet * hNotch));

  int n = 0;
  // Start on a peak so even half-steps from peakOff = peaks, odd = notches.
  const float pFirst = std::ceil((kFMin / spacing - peakOff) * 2.f) * 0.5f + peakOff;
  for (float p = pFirst; n < maxTeeth; p += 0.5f)
  {
    const float hz = p * spacing;
    if (hz > kFMax)
      break;
    if (hz < kFMin)
      continue;
    const int kRound = static_cast<int>(std::lround((p - peakOff) * 2.f));
    const bool peak = (kRound % 2) == 0;
    fOut[n] = hz;
    dbOut[n] = peak ? peakDb : notchDb;
    ++n;
  }
  return n;
}
} // namespace

FlangerPlugin::FlangerPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API FlangerPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  left_.setup(static_cast<float>(sampleRate_));
  right_.setup(static_cast<float>(sampleRate_));
  applyParams(makeBlockState(), true);
  return kResultOk;
}

tresult PLUGIN_API FlangerPlugin::setActive(TBool state)
{
  if (state)
  {
    left_.setup(static_cast<float>(sampleRate_));
    right_.setup(static_cast<float>(sampleRate_));
    vizDelayInit_ = false;
    applyParams(makeBlockState(), true);
  }
  return EffectBase::setActive(state);
}

tresult PLUGIN_API FlangerPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  left_.setup(static_cast<float>(sampleRate_));
  right_.setup(static_cast<float>(sampleRate_));
  vizDelayInit_ = false;
  applyParams(makeBlockState(), true);
  return EffectBase::setupProcessing(newSetup);
}

FlangerPlugin::BlockState FlangerPlugin::makeBlockState() const
{
  BlockState s;
  s.active = params_[kParamActive] >= 0.5f;
  s.lfo = params_[kParamLfo] >= 0.5f;
  s.reset = params_[kParamReset] >= 0.5f;
  s.minDelay = params_[kParamMinDelay];
  s.modDepth = params_[kParamModDepth];
  s.modRate = params_[kParamModRate];
  s.feedback = params_[kParamFeedback];
  s.stereoDeg = params_[kParamStereo];
  s.amount = params_[kParamAmount];
  s.dry = params_[kParamDry];
  return s;
}

void FlangerPlugin::applyParams(const BlockState& s, bool forcePhase)
{
  left_.setMinDelayMs(s.minDelay);
  right_.setMinDelayMs(s.minDelay);
  left_.setModDepthMs(s.modDepth);
  right_.setModDepthMs(s.modDepth);
  left_.setRateHz(s.modRate);
  right_.setRateHz(s.modRate);
  left_.setFeedback(s.feedback);
  right_.setFeedback(s.feedback);
  const float wetLin = Dsp::dbToLin(std::clamp(s.amount, -60.f, 12.f));
  const float dryLin = Dsp::dbToLin(std::clamp(s.dry, -60.f, 12.f));
  left_.setWet(wetLin);
  right_.setWet(wetLin);
  left_.setDry(dryLin);
  right_.setDry(dryLin);
  left_.setLfoActive(s.lfo);
  right_.setLfoActive(s.lfo);

  const float rPhase = std::clamp(s.stereoDeg, 0.f, 360.f) / 360.f;
  if (s.reset || forcePhase)
  {
    if (s.reset)
      clearReset_ = true;
    left_.resetPhase(0.f);
    right_.resetPhase(rPhase);
    lastRPhase_ = rPhase;
  }
  else if (std::fabs(rPhase - lastRPhase_) > 1.0e-4f)
  {
    right_.setPhase(left_.phase());
    right_.incPhase(rPhase);
    lastRPhase_ = rPhase;
  }
}

void FlangerPlugin::publishComb()
{
  constexpr float kDelayEma = 0.76f;
  const float tgtL = left_.lastDelaySamples();
  const float tgtR = right_.lastDelaySamples();
  if (!vizDelayInit_)
  {
    vizDelayL_ = tgtL;
    vizDelayR_ = tgtR;
    vizDelayInit_ = true;
  }
  else
  {
    vizDelayL_ = kDelayEma * vizDelayL_ + (1.f - kDelayEma) * tgtL;
    vizDelayR_ = kDelayEma * vizDelayR_ + (1.f - kDelayEma) * tgtR;
  }

  const float sr = static_cast<float>(sampleRate_);
  const float fb = left_.feedback();
  float fL[kMaxTeeth];
  float dbL[kMaxTeeth];
  float fR[kMaxTeeth];
  float dbR[kMaxTeeth];
  const int nL = collectTeeth(left_, vizDelayL_, sr, fb, fL, dbL, kMaxTeeth);
  const int nR = collectTeeth(right_, vizDelayR_, sr, fb, fR, dbR, kMaxTeeth);

  combOut_[0] = static_cast<float>(nL);
  combOut_[1] = static_cast<float>(nR);
  int w = 2;
  for (int i = 0; i < nL; ++i)
  {
    combOut_[w++] = fL[i];
    combOut_[w++] = dbL[i];
  }
  for (int i = 0; i < nR; ++i)
  {
    combOut_[w++] = fR[i];
    combOut_[w++] = dbR[i];
  }
  combOutN_ = w;
  combReady_.store(true, std::memory_order_release);
}

int FlangerPlugin::takeCombExtrema(float* out, int maxOut)
{
  if (!out || maxOut < 2)
    return 0;
  if (!combReady_.load(std::memory_order_acquire))
    return 0;
  if (combOutN_ < 2 || maxOut < combOutN_)
    return 0;
  std::memcpy(out, combOut_, static_cast<size_t>(combOutN_) * sizeof(float));
  return combOutN_;
}

tresult PLUGIN_API FlangerPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);
  BlockState state = makeBlockState();
  applyParams(state, false);

  if (clearReset_)
  {
    if (auto* p = getParameterObject(kParamReset))
      p->setNormalized(p->toNormalized(0.f));
    params_[kParamReset] = 0.f;
    clearReset_ = false;
  }

  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  const int combInterval = std::max(1, static_cast<int>(sampleRate_ / 30.0));
  combCountdown_ -= data.numSamples;
  const bool wantComb = combCountdown_ <= 0;
  if (wantComb)
    combCountdown_ = combInterval;

  if (!io_.begin(data))
  {
    const int32 n = data.numSamples;
    for (int32 i = 0; i < n; ++i)
    {
      left_.process(0.f, false);
      right_.process(0.f, false);
    }
    if (wantComb)
      publishComb();
    return kResultOk;
  }

  const int32 nFrames = data.numSamples;
  const int32 nCh = data.outputs[0].numChannels;
  const bool wetOn = state.active;

  auto run = [&](auto** out) {
    for (int32 i = 0; i < nFrames; ++i)
    {
      float L = nCh > 0 ? static_cast<float>(out[0][i]) : 0.f;
      float R = nCh > 1 ? static_cast<float>(out[1][i]) : L;
      L = left_.process(L, wetOn);
      R = right_.process(R, wetOn);
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

  if (wantComb)
    publishComb();
  io_.end(data);
  return kResultOk;
}

tresult PLUGIN_API FlangerPlugin::setState(IBStream* state)
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

  float plains[kParamCount] {};
  for (int i = 0; i < kParamCount; ++i)
  {
    if (auto* p = getParameterObject(static_cast<ParamID>(i)))
      plains[i] = static_cast<float>(p->toPlain(p->getNormalized()));
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
  applyParams(makeBlockState(), true);
  notifyHostStateRestored();
  return kResultOk;
}

tresult PLUGIN_API FlangerPlugin::getState(IBStream* state)
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

} // namespace Flanger
} // namespace calfNXT
