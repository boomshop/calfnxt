#include "reverb_dsp.h"

#include "base/source/fstreamer.h"
#include "dsp_math.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace calfNXT {
namespace Reverb {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5852u; // 'CNXR'
constexpr uint32 kStateVersion = 1;

inline float onePoleCoeff(float ms, float sr)
{
  const float n = std::max(1.f, ms * 0.001f * sr);
  return 1.f - std::exp(-1.f / n);
}
} // namespace

ReverbPlugin::ReverbPlugin()
  : Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API ReverbPlugin::initialize(FUnknown* context)
{
  const tresult r = EffectBase::initialize(context);
  if (r != kResultOk)
    return r;
  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

void ReverbPlugin::resetProcessing()
{
  const float sr = static_cast<float>(sampleRate_);
  tone_.setSampleRate(sr);
  tone_.reset();
  airL_.reset();
  airR_.reset();
  er_.reset();
  er_.setup(sr);
  diffuse_.reset();
  diffuse_.setup(sr);
  predelay_.reset();
  late_.reset();
  late_.setup(sr);
  width_.reset();
  width_.setup(sr);

  dryGain_.setSampleRate(sr);
  wetGain_.setSampleRate(sr);
  erGain_.setSampleRate(sr);
  lateGain_.setSampleRate(sr);
  duckGain_.setSampleRate(sr);
  gateGain_.setSampleRate(sr);
  dryGain_.setInertiaMs(10.f);
  wetGain_.setInertiaMs(10.f);
  erGain_.setInertiaMs(10.f);
  lateGain_.setInertiaMs(10.f);
  duckGain_.setInertiaMs(5.f);
  gateGain_.setInertiaMs(5.f);

  envDuck_ = 0.f;
  envGate_ = 0.f;
  gateHoldCounter_ = 0.f;
  gateOpen_ = false;
  duckGain_.reset(1.f);
  gateGain_.reset(1.f);
  updateFromParams();
}

tresult PLUGIN_API ReverbPlugin::setActive(TBool state)
{
  const tresult r = EffectBase::setActive(state);
  if (state)
    resetProcessing();
  return r;
}

tresult PLUGIN_API ReverbPlugin::setupProcessing(ProcessSetup& newSetup)
{
  const tresult r = EffectBase::setupProcessing(newSetup);
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  resetProcessing();
  return r;
}

bool ReverbPlugin::engineHasTail() const
{
  // Never sleep while frozen or gate still open — both imply ongoing wet.
  if (freeze_)
    return true;
  if (gateOn_ && gateOpen_)
    return true;
  // Duck / gate envelopes must settle before idle (otherwise return clicks).
  if (envDuck_ > kIdleResidual)
    return true;
  if (gateOn_ && envGate_ > kIdleResidual)
    return true;
  if (late_.residualEnergy() > kIdleResidual)
    return true;
  // Covers ER taps, predelay, diffuse — previous block's internal peak.
  if (lastTailPeak_ > kIdleResidual)
    return true;
  // Amount / dry / duck / levels still slewing — keep SmoothGain advancing.
  if (!dryGain_.isSettled() || !wetGain_.isSettled() || !erGain_.isSettled()
      || !lateGain_.isSettled() || !duckGain_.isSettled() || !gateGain_.isSettled())
    return true;
  return false;
}

void ReverbPlugin::beginTailPeakBlock()
{
  blockTailPeak_ = 0.f;
}

void ReverbPlugin::endTailPeakBlock()
{
  lastTailPeak_ = blockTailPeak_;
}

void ReverbPlugin::updateFromParams()
{
  const float sr = static_cast<float>(sampleRate_);
  active_ = params_[kParamActive] >= 0.5f;
  freeze_ = params_[kParamFreeze] >= 0.5f;
  listen_ = params_[kParamListen] >= 0.5f;
  gateOn_ = params_[kParamGate] >= 0.5f;
  duckAmt_ = std::clamp(params_[kParamDuck], 0.f, 1.f);
  duckOn_ = duckAmt_ > 1.0e-4f;
  pathMode_ = params_[kParamPathMode] >= 0.5f ? 1 : 0;
  diffuseAmt_ = std::clamp(params_[kParamDiffuse], 0.f, 1.f);
  airAmt_ = std::clamp(params_[kParamAir], 0.f, 1.f);

  // Quality: Lo / Mid / Hi (CPU vs density). Appended ParamID — see setState.
  const int quality = std::clamp(int(params_[kParamQuality] + 0.5f), 0, 2);
  if (quality == 0)
  {
    late_.setActiveStages(4);
    er_.setTapLimits(12, 24);
    diffuse_.setStages(0);
    diffuseAmt_ = 0.f; // Pre Diff inactive on Lo
  }
  else if (quality == 1)
  {
    late_.setActiveStages(6);
    er_.setTapLimits(Dsp::ReverbEr::kMaxMulti, Dsp::ReverbEr::kMaxVelvet);
    diffuse_.setStages(4);
  }
  else
  {
    late_.setActiveStages(6);
    er_.setTapLimits(Dsp::ReverbEr::kMaxMulti, Dsp::ReverbEr::kMaxVelvet);
    diffuse_.setStages(6);
  }

  const float room = params_[kParamRoomSize];
  const float distance = params_[kParamDistance];

  // Predelay only on late; distance adds up to +40 ms.
  const float preMs = std::max(0.f, params_[kParamPredelay]) + distance * 40.f;
  predelaySamples_ = std::clamp(int(preMs * 0.001f * sr + 0.5f), 1, kPredelaySize - 1);

  tone_.setSampleRate(sr);
  tone_.setParams(
    params_[kParamHipass],
    params_[kParamLopass],
    Dsp::filterModeToStages(params_[kParamHpMode]),
    Dsp::filterModeToStages(params_[kParamLpMode]));

  // Air: mild high shelf on wet, boosted a bit by distance.
  const float airGain = 1.f + (airAmt_ + distance * 0.35f) * 0.45f;
  airOn_ = std::fabs(airGain - 1.f) > 1.0e-3f;
  if (airOn_)
  {
    airL_.setHighshelfRbj(6000.f, 0.7f, airGain, sr);
    airR_.copyCoeffs(airL_);
  }

  const int erMode = std::clamp(int(params_[kParamErMode] + 0.5f), 0, 2);
  erOn_ = erMode != 0;
  er_.setMode(static_cast<Dsp::ReverbEr::Mode>(erMode));
  er_.setRoomSizeM(room);
  er_.setDistance(distance);

  late_.setRoomSizeM(room);
  late_.setDistance(distance);
  late_.setTime(params_[kParamDecay]);
  late_.setDiffusion(params_[kParamDiffusion]);
  late_.setCutoff(params_[kParamHfDamp]);
  late_.setLfDamp(params_[kParamLfDamp]);
  late_.setMod(params_[kParamModRate], params_[kParamModDepth]);
  late_.setFreeze(freeze_);

  const int widthMode = std::clamp(int(params_[kParamWidthMode] + 0.5f), 0, 3);
  widthOn_ = widthMode != 0;
  width_.setMode(static_cast<Dsp::ReverbWidth::Mode>(widthMode));
  width_.setWidth(params_[kParamWidth]);

  dryGain_.set(Dsp::dbToLin(params_[kParamDry]));
  wetGain_.set(active_ ? Dsp::dbToLin(params_[kParamAmount]) : 0.f);
  erGain_.set(erOn_ ? Dsp::dbToLin(params_[kParamErLevel]) : 0.f);
  lateGain_.set(Dsp::dbToLin(params_[kParamLateLevel]));

  gateThreshLin_ = Dsp::dbToLin(params_[kParamGateThreshold]);
  gateHoldSamples_ = std::max(1.f, params_[kParamGateHold] * 0.001f * sr);
  gateReleaseCoeff_ = onePoleCoeff(params_[kParamGateRelease], sr);
  duckAttackCoeff_ = onePoleCoeff(20.f, sr);
  duckReleaseCoeff_ = onePoleCoeff(180.f, sr);
}

void ReverbPlugin::processDryOnly(float inL, float inR, float& outL, float& outR)
{
  const float dryG = dryGain_.get();
  outL = inL * dryG;
  outR = inR * dryG;
  Dsp::sanitizeDenormal(outL);
  Dsp::sanitizeDenormal(outR);
}

void ReverbPlugin::applyDryGainBlock(ProcessData& data)
{
  const int n = data.numSamples;
  if (data.symbolicSampleSize == kSample32)
  {
    float* outL = data.outputs[0].channelBuffers32[0];
    float* outR = data.outputs[0].channelBuffers32[1];
    for (int i = 0; i < n; ++i)
      processDryOnly(outL[i], outR[i], outL[i], outR[i]);
  }
  else
  {
    double* outL = data.outputs[0].channelBuffers64[0];
    double* outR = data.outputs[0].channelBuffers64[1];
    for (int i = 0; i < n; ++i)
    {
      float oL = 0.f, oR = 0.f;
      processDryOnly(float(outL[i]), float(outR[i]), oL, oR);
      outL[i] = oL;
      outR[i] = oR;
    }
  }
}

void ReverbPlugin::processSample(float inL, float inR, float& outL, float& outR)
{
  const float dryL = inL;
  const float dryR = inR;

  // Detector from dry for duck / gate
  const float det = std::max(std::fabs(dryL), std::fabs(dryR));

  // Duck envelope
  if (duckOn_)
  {
    if (det > envDuck_)
      envDuck_ += (det - envDuck_) * duckAttackCoeff_;
    else
      envDuck_ += (det - envDuck_) * duckReleaseCoeff_;
    Dsp::sanitizeDenormal(envDuck_);
    duckGain_.set(1.f - duckAmt_ * std::clamp(envDuck_ * 2.5f, 0.f, 1.f));
  }
  else
  {
    envDuck_ = 0.f;
    duckGain_.set(1.f);
  }

  // Gate envelope (opens on dry peaks)
  if (gateOn_)
  {
    if (det >= gateThreshLin_)
    {
      gateOpen_ = true;
      gateHoldCounter_ = gateHoldSamples_;
      envGate_ = 1.f;
    }
    else if (gateOpen_)
    {
      if (gateHoldCounter_ > 0.f)
        gateHoldCounter_ -= 1.f;
      else
      {
        envGate_ += (0.f - envGate_) * gateReleaseCoeff_;
        if (envGate_ < 1.0e-4f)
        {
          envGate_ = 0.f;
          gateOpen_ = false;
        }
      }
    }
    else
      envGate_ = 0.f;
  }
  else
  {
    envGate_ = 1.f;
    gateOpen_ = false;
  }
  Dsp::sanitizeDenormal(envGate_);
  gateGain_.set(envGate_);

  // Tone into ER / late feed (HP→LP with selectable slope; stages=0 is free)
  const float tL = tone_.processChannel(0, dryL);
  const float tR = tone_.processChannel(1, dryR);

  float erL = 0.f;
  float erR = 0.f;
  if (erOn_)
    er_.process(tL, tR, erL, erR);

  // Serial with ER off: feed late from tone (same as parallel).
  float lateInL = (!erOn_ || pathMode_ == 0) ? tL : erL;
  float lateInR = (!erOn_ || pathMode_ == 0) ? tR : erR;

  // Freeze: stop feeding the tank
  if (freeze_)
  {
    lateInL = 0.f;
    lateInR = 0.f;
  }

  float pdL = 0.f;
  float pdR = 0.f;
  predelay_.process(lateInL, lateInR, predelaySamples_, pdL, pdR);

  if (diffuseAmt_ > 1.0e-4f)
    diffuse_.process(pdL, pdR, diffuseAmt_);

  float lateL = pdL;
  float lateR = pdR;
  late_.process(lateL, lateR);

  float wetL = erL * erGain_.get() + lateL * lateGain_.get();
  float wetR = erR * erGain_.get() + lateR * lateGain_.get();

  if (airOn_)
  {
    wetL = float(airL_.process(wetL));
    wetR = float(airR_.process(wetR));
  }

  if (widthOn_)
    width_.process(wetL, wetR);

  // Tail peak from internals (not wet gain) so Amount=0 still drains the tank.
  // Also keep duck/gate envelopes visible to engineHasTail().
  const float tailPeak = std::max(
    std::max(std::fabs(erL), std::fabs(erR)),
    std::max(
      std::max(std::fabs(lateL), std::fabs(lateR)),
      std::max(std::fabs(pdL), std::fabs(pdR))));
  if (tailPeak > blockTailPeak_)
    blockTailPeak_ = tailPeak;

  // Keep gain smoothers advancing even while listening.
  const float dyn = duckGain_.get() * gateGain_.get();
  const float wetG = wetGain_.get() * dyn;
  const float dryG = dryGain_.get();

  if (listen_)
  {
    outL = tL;
    outR = tR;
  }
  else
  {
    outL = dryL * dryG + wetL * wetG;
    outR = dryR * dryG + wetR * wetG;
  }
  Dsp::sanitizeDenormal(outL);
  Dsp::sanitizeDenormal(outR);
}

tresult PLUGIN_API ReverbPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);
  updateFromParams();

  io_.setBypassGains(false);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  const bool wetNeeded = active_ || listen_;
  const bool hasHostAudio = io_.begin(data);
  // Content quiet (zeros without silenceFlags) still needs tail/envelope drain.
  const bool quietIn = !hasHostAudio || io_.inputWasQuiet();

  // Wet off: dry gain only (or true silence).
  if (!wetNeeded)
  {
    if (!hasHostAudio)
      return kResultOk;
    applyDryGainBlock(data);
    io_.end(data);
    return kResultOk;
  }

  // Idle only when input is quiet AND tank/ER/predelay/envelopes are drained.
  // Never cut hall tails or duck/gate release.
  if (quietIn && !engineHasTail())
  {
    if (hasHostAudio)
      io_.end(data);
    return kResultOk;
  }

  beginTailPeakBlock();

  // Host silenceFlags: outs may be unusable — drain tank state only.
  // Content-quiet (Ardour) still writes tails via the hasHostAudio path below.
  if (!hasHostAudio)
  {
    const int n = data.numSamples;
    for (int i = 0; i < n; ++i)
    {
      float oL = 0.f, oR = 0.f;
      processSample(0.f, 0.f, oL, oR);
    }
    endTailPeakBlock();
    if (airOn_)
    {
      airL_.sanitize();
      airR_.sanitize();
    }
    return kResultOk;
  }

  // hasHostAudio: outs already hold in_gain copies (zeros when quietIn).
  // Keep processing so tails/envelopes drain into the output.
  const int n = data.numSamples;
  if (data.symbolicSampleSize == kSample32)
  {
    float* outL = data.outputs[0].channelBuffers32[0];
    float* outR = data.outputs[0].channelBuffers32[1];
    for (int i = 0; i < n; ++i)
      processSample(outL[i], outR[i], outL[i], outR[i]);
  }
  else
  {
    double* outL = data.outputs[0].channelBuffers64[0];
    double* outR = data.outputs[0].channelBuffers64[1];
    for (int i = 0; i < n; ++i)
    {
      float oL = 0.f, oR = 0.f;
      processSample(float(outL[i]), float(outR[i]), oL, oR);
      outL[i] = oL;
      outR[i] = oR;
    }
  }

  endTailPeakBlock();
  io_.end(data);
  if (airOn_)
  {
    airL_.sanitize();
    airR_.sanitize();
  }
  return kResultOk;
}

tresult PLUGIN_API ReverbPlugin::setState(IBStream* state)
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
  if (!streamer.readInt32(count) || count < 1 || count > kParamCount)
    return kResultFalse;

  float plains[kParamCount] {};
  readParamPlains(plains, kParamCount); // defaults for any newly added params
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

tresult PLUGIN_API ReverbPlugin::getState(IBStream* state)
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

} // namespace Reverb
} // namespace calfNXT
