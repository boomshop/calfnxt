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

void StereoPlugin::processSample(float& L, float& R)
{
  // Input levels (replaces balance-in)
  L *= Dsp::dbToLin(params_[kParamLevelL]);
  R *= Dsp::dbToLin(params_[kParamLevelR]);

  const int mode = static_cast<int>(
    std::lround(std::clamp(params_[kParamMode], 0.f, 6.f)));
  const float slev = Dsp::dbToLin(params_[kParamSlev]);
  const float sbal = 1.f + params_[kParamSbal];
  const float mlev = Dsp::dbToLin(params_[kParamMlev]);
  const float mpan = 1.f + params_[kParamMpan];

  float l = L;
  float r = R;
  switch (mode)
  {
    case 0: // LR > LR
    {
      const float m = (L + R) * 0.5f;
      const float s = (L - R) * 0.5f;
      l = m * mlev * std::min(1.f, 2.f - mpan) + s * slev * std::min(1.f, 2.f - sbal);
      r = m * mlev * std::min(1.f, mpan) - s * slev * std::min(1.f, sbal);
      break;
    }
    case 1: // LR > MS (L=mid, R=side)
    {
      const float ll = L * std::min(1.f, 2.f - sbal);
      const float rr = R * std::min(1.f, sbal);
      l = 0.5f * (ll + rr) * mlev;
      r = 0.5f * (ll - rr) * slev;
      break;
    }
    case 2: // MS > LR (L=mid, R=side in)
    {
      l = L * mlev * std::min(1.f, 2.f - mpan) + R * slev * std::min(1.f, 2.f - sbal);
      r = L * mlev * std::min(1.f, mpan) - R * slev * std::min(1.f, sbal);
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
      l = m * mlev * std::min(1.f, 2.f - mpan) + s * slev * std::min(1.f, 2.f - sbal);
      r = m * mlev * std::min(1.f, mpan) - s * slev * std::min(1.f, sbal);
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
  const bool decorrOn = params_[kParamDecorr] >= 0.5f;
  const float amount = params_[kParamDecorrAmount];
  if (decorrOn && amount > 1.0e-5f && mode != 1 && mode != 3 && mode != 4 && mode != 5)
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
    const float dry = 1.f - amount;
    float L2 = dry * Lh + amount * Ld;
    float R2 = dry * Rh + amount * Rd;

    const float m2 = (L2 + R2) * 0.5f;
    L2 = L2 - m2 + m;
    R2 = R2 - m2 + m;

    L = L2 + sLow;
    R = R2 - sLow;
  }

  // Mute / phase
  if (params_[kParamMuteL] >= 0.5f)
    L = 0.f;
  if (params_[kParamMuteR] >= 0.5f)
    R = 0.f;
  if (params_[kParamPhaseL] >= 0.5f)
    L = -L;
  if (params_[kParamPhaseR] >= 0.5f)
    R = -R;

  // Delay (±ms): positive delays R, negative delays L (Calf convention).
  if (!delayBuf_.empty())
  {
    const int bufSize = static_cast<int>(delayBuf_.size());
    delayBuf_[delayPos_] = L;
    delayBuf_[delayPos_ + 1] = R;

    int nbuf = static_cast<int>(sampleRate_ * (std::fabs(params_[kParamDelay]) / 1000.f));
    nbuf -= nbuf % 2;
    nbuf = std::clamp(nbuf, 0, bufSize - 2);
    if (params_[kParamDelay] > 0.f && nbuf > 0)
      R = delayBuf_[(delayPos_ - nbuf + 1 + bufSize) % bufSize];
    else if (params_[kParamDelay] < 0.f && nbuf > 0)
      L = delayBuf_[(delayPos_ - nbuf + bufSize) % bufSize];

    delayPos_ = (delayPos_ + 2) % bufSize;
  }

  // Stereo base
  float sb = params_[kParamStereoBase];
  if (sb < 0.f)
    sb *= 0.5f;
  {
    const float ll = L + sb * L - sb * R;
    const float rr = R + sb * R - sb * L;
    L = ll;
    R = rr;
  }

  // Stereo phase rotation
  {
    const float deg = params_[kParamStereoPhase];
    const float rad = deg * static_cast<float>(M_PI / 180.0);
    const float c = std::cos(rad);
    const float s = std::sin(rad);
    const float ll = L * c - R * s;
    const float rr = L * s + R * c;
    L = ll;
    R = rr;
  }

  // Balance out
  const float balOut = params_[kParamBalanceOut];
  L *= (1.f - std::max(0.f, balOut));
  R *= (1.f + std::min(0.f, balOut));

  fieldTap_.process(L, R);
}

tresult PLUGIN_API StereoPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);
  updateDecorrelate();
  sideSplit_.prepareBlock();

  const bool bypass = params_[kParamBypass] >= 0.5f;
  io_.setBypassGains(bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  if (!io_.begin(data))
    return kResultOk;

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
      processSample(L, R);
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
      processSample(L, R);
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
  for (int i = 0; i < kParamCount; ++i)
    streamer.writeFloat(params_[i]);
  return kResultOk;
}

} // namespace Stereo
} // namespace calfNXT
