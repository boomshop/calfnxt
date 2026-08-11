#include "stereo_dsp.h"

#include "gain_util.h"
#include "base/source/fstreamer.h"

#include <algorithm>
#include <cmath>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace calfNXT {
namespace Stereo {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5853u; // 'CNXS'
constexpr uint32 kStateVersion = 3;
} // namespace

StereoPlugin::StereoPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API StereoPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

tresult PLUGIN_API StereoPlugin::setActive(TBool state)
{
  if (state)
  {
    rebuildDelayBuffer();
    sideSplit_.reset();
    sideSplit_.setSampleRate(static_cast<float>(sampleRate_));
    sideSplit_.setBands(2);
    decorrL_.reset();
    decorrR_.reset();
    fieldTap_.setSampleRate(sampleRate_);
    lastXover_ = -1.f;
    lastSlope_ = -1.f;
    lastSpread_ = -1.f;
    lastStages_ = -1;
    updateDecorrelate();
  }
  return EffectBase::setActive(state);
}

tresult PLUGIN_API StereoPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  rebuildDelayBuffer();
  sideSplit_.setSampleRate(static_cast<float>(sampleRate_));
  sideSplit_.setBands(2);
  fieldTap_.setSampleRate(sampleRate_);
  updateDecorrelate();
  return EffectBase::setupProcessing(newSetup);
}

void StereoPlugin::rebuildDelayBuffer()
{
  // ±20 ms + margin, interleaved stereo.
  const int n = std::max(4, static_cast<int>(sampleRate_ * 0.05) * 2);
  delayBuf_.assign(static_cast<size_t>(n), 0.f);
  delayPos_ = 0;
  delayMsCur_ = params_[kParamDelay];
  // ~8 ms smoothing toward the knob — avoids zipper when the read head jumps.
  delaySmoothCoeff_ = static_cast<float>(
    1.0 - std::exp(-1.0 / (0.008 * std::max(1.0, sampleRate_))));
}

void StereoPlugin::updateDecorrelate()
{
  const float xover = params_[kParamDecorrXover];
  const float spread = params_[kParamDecorrSpread];
  const float slopeDb = params_[kParamDecorrSlope];
  const int stages = static_cast<int>(
    std::lround(std::clamp(params_[kParamDecorrStages], 1.f, 8.f)));

  if (xover != lastXover_)
  {
    sideSplit_.setFreq(0, xover);
    lastXover_ = xover;
  }
  if (slopeDb != lastSlope_)
  {
    sideSplit_.setSlopeDb(slopeDb);
    lastSlope_ = slopeDb;
  }
  if (spread != lastSpread_ || stages != lastStages_)
  {
    decorrL_.setStages(stages);
    decorrR_.setStages(stages);
    decorrL_.setSpread(spread, false);
    decorrR_.setSpread(spread, true);
    lastSpread_ = spread;
    lastStages_ = stages;
  }
}

StereoPlugin::BlockState StereoPlugin::makeBlockState() const
{
  BlockState state;
  state.levelLinL = Dsp::dbToLin(params_[kParamLevelL]);
  state.levelLinR = Dsp::dbToLin(params_[kParamLevelR]);
  state.mode = static_cast<int>(std::lround(std::clamp(params_[kParamMode], 0.f, 6.f)));
  state.slev = Dsp::dbToLin(params_[kParamSlev]);
  state.mlev = Dsp::dbToLin(params_[kParamMlev]);

  const float sbal = 1.f + params_[kParamSbal];
  const float mpan = 1.f + params_[kParamMpan];
  state.sbalL = std::min(1.f, 2.f - sbal);
  state.sbalR = std::min(1.f, sbal);
  state.mpanL = std::min(1.f, 2.f - mpan);
  state.mpanR = std::min(1.f, mpan);

  state.decorrAmount = params_[kParamDecorrAmount];
  state.decorrOn = params_[kParamDecorr] >= 0.5f &&
                   state.decorrAmount > 1.0e-5f &&
                   state.mode != 1 && state.mode != 3 && state.mode != 4 && state.mode != 5;

  state.muteL = params_[kParamMuteL] >= 0.5f;
  state.muteR = params_[kParamMuteR] >= 0.5f;
  state.phaseL = params_[kParamPhaseL] >= 0.5f;
  state.phaseR = params_[kParamPhaseR] >= 0.5f;

  state.delayTargetMs = params_[kParamDelay];
  state.stereoBase = params_[kParamStereoBase];
  if (state.stereoBase < 0.f)
    state.stereoBase *= 0.5f;

  const float rad = params_[kParamStereoPhase] * static_cast<float>(M_PI / 180.0);
  state.phaseCos = std::cos(rad);
  state.phaseSin = std::sin(rad);

  const float balOut = params_[kParamBalanceOut];
  state.balanceOutL = 1.f - std::max(0.f, balOut);
  state.balanceOutR = 1.f + std::min(0.f, balOut);
  return state;
}

void StereoPlugin::processSample(const BlockState& state, float& L, float& R)
{
  // Input levels (replaces balance-in)
  L *= state.levelLinL;
  R *= state.levelLinR;

  float l = L;
  float r = R;
  switch (state.mode)
  {
    case 0: // LR > LR
    {
      const float m = (L + R) * 0.5f;
      const float s = (L - R) * 0.5f;
      l = m * state.mlev * state.mpanL + s * state.slev * state.sbalL;
      r = m * state.mlev * state.mpanR - s * state.slev * state.sbalR;
      break;
    }
    case 1: // LR > MS (L=mid, R=side)
    {
      const float ll = L * state.sbalL;
      const float rr = R * state.sbalR;
      l = 0.5f * (ll + rr) * state.mlev;
      r = 0.5f * (ll - rr) * state.slev;
      break;
    }
    case 2: // MS > LR (L=mid, R=side in)
    {
      l = L * state.mlev * state.mpanL + R * state.slev * state.sbalL;
      r = L * state.mlev * state.mpanR - R * state.slev * state.sbalR;
      break;
    }
    case 3: // LR > LL
      r = L;
      l = L;
      break;
    case 4: // LR > RR
      l = R;
      r = R;
      break;
    case 5: // LR > L+R mono
      l = (L + R) * 0.5f;
      r = l;
      break;
    case 6: // LR > RL flip then M/S
    {
      std::swap(l, r);
      L = l;
      R = r;
      const float m = (L + R) * 0.5f;
      const float s = (L - R) * 0.5f;
      l = m * state.mlev * state.mpanL + s * state.slev * state.sbalL;
      r = m * state.mlev * state.mpanR - s * state.slev * state.sbalR;
      break;
    }
    default:
      break;
  }
  L = l;
  R = r;

  // Side decorrelate (explicit enable; skip pure mono modes and MS-encoded output).
  // Allpass the high-band L/R (not two sides averaged into m±sA/m±sB — that
  // cancels to mono when the chains diverge). Restore mid so the mono sum is
  // unchanged; low side stays untouched for bass mono-compatibility.
  if (state.decorrOn)
  {
    const float m = (L + R) * 0.5f;
    const float s = (L - R) * 0.5f;
    float sLow = 0.f;
    float sHigh = 0.f;
    sideSplit_.process2(s, sLow, sHigh);

    const float Lh = m + sHigh;
    const float Rh = m - sHigh;
    const float Ld = decorrL_.process(Lh);
    const float Rd = decorrR_.process(Rh);
    const float dry = 1.f - state.decorrAmount;
    float L2 = dry * Lh + state.decorrAmount * Ld;
    float R2 = dry * Rh + state.decorrAmount * Rd;

    const float m2 = (L2 + R2) * 0.5f;
    L2 = L2 - m2 + m;
    R2 = R2 - m2 + m;

    L = L2 + sLow;
    R = R2 - sLow;
  }

  // Mute / phase
  if (state.muteL)
    L = 0.f;
  if (state.muteR)
    R = 0.f;
  if (state.phaseL)
    L = -L;
  if (state.phaseR)
    R = -R;

  // Delay (±ms): positive delays R, negative delays L (Calf convention).
  // Ramp the delay time and lerp between adjacent taps to avoid clicks.
  if (!delayBuf_.empty())
  {
    const int bufSize = static_cast<int>(delayBuf_.size());
    delayBuf_[static_cast<size_t>(delayPos_)] = L;
    delayBuf_[static_cast<size_t>(delayPos_ + 1)] = R;

    delayMsCur_ += (state.delayTargetMs - delayMsCur_) * delaySmoothCoeff_;
    const float absMs = std::fabs(delayMsCur_);
    if (absMs > 1.0e-5f)
    {
      // Channel-sample delay (buffer is interleaved L/R).
      float dSamp = static_cast<float>(sampleRate_) * (absMs * 0.001f);
      const float maxSamp = static_cast<float>((bufSize / 2) - 2);
      dSamp = std::clamp(dSamp, 0.f, maxSamp);
      const int i0 = static_cast<int>(dSamp);
      const float frac = dSamp - static_cast<float>(i0);
      const int i1 = i0 + 1;

      auto readCh = [&](int ch /*0=L,1=R*/, int age) -> float {
        const int idx = (delayPos_ - age * 2 + ch + bufSize * 4) % bufSize;
        return delayBuf_[static_cast<size_t>(idx)];
      };

      if (delayMsCur_ > 0.f)
      {
        const float a = readCh(1, i0);
        const float b = readCh(1, i1);
        R = a + (b - a) * frac;
      }
      else
      {
        const float a = readCh(0, i0);
        const float b = readCh(0, i1);
        L = a + (b - a) * frac;
      }
    }

    delayPos_ = (delayPos_ + 2) % bufSize;
  }

  // Stereo base
  {
    const float ll = L + state.stereoBase * L - state.stereoBase * R;
    const float rr = R + state.stereoBase * R - state.stereoBase * L;
    L = ll;
    R = rr;
  }

  // Stereo phase rotation
  {
    const float ll = L * state.phaseCos - R * state.phaseSin;
    const float rr = L * state.phaseSin + R * state.phaseCos;
    L = ll;
    R = rr;
  }

  // Balance out
  L *= state.balanceOutL;
  R *= state.balanceOutR;

  fieldTap_.process(L, R);
}

tresult PLUGIN_API StereoPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);
  updateDecorrelate();
  sideSplit_.prepareBlock();
  const BlockState state = makeBlockState();

  const bool bypass = params_[kParamBypass] >= 0.5f;
  io_.setBypassGains(bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  if (!io_.begin(data))
  {
    fieldTap_.clearDisplay();
    return kResultOk;
  }

  if (bypass)
  {
    fieldTap_.clearDisplay();
    io_.end(data);
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

  fieldTap_.publish();
  io_.end(data);
  return kResultOk;
}

int StereoPlugin::takeCorrelation(float* out, int maxOut)
{
  if (!out || maxOut < 1)
    return 0;
  out[0] = fieldTap_.takeCorrelation();
  return 1;
}

int StereoPlugin::takeGonio(float* out, int maxOut)
{
  return fieldTap_.takeGonio(out, maxOut);
}

tresult PLUGIN_API StereoPlugin::setState(IBStream* state)
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
  updateDecorrelate();
  notifyHostStateRestored();
  return kResultOk;
}

tresult PLUGIN_API StereoPlugin::getState(IBStream* state)
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

} // namespace Stereo
} // namespace calfNXT
