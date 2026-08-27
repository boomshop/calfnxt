#include "harmonics_dsp.h"

#include "base/source/fstreamer.h"
#include "dsp_math.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Harmonics {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5848u; // 'CNXH'
// v7: pre-listen; v8: +oversample / asymmetry / tone
constexpr uint32 kStateVersion = 8;

int snapOversample(float plain)
{
  return std::clamp(static_cast<int>(std::lround(plain)), 1, 4);
}
} // namespace

HarmonicsPlugin::HarmonicsPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API HarmonicsPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

void HarmonicsPlugin::resetProcessing()
{
  const uint32_t sr = static_cast<uint32_t>(std::max(1.0, sampleRate_));
  distL_.setSampleRate(sr);
  distR_.setSampleRate(sr);
  distL_.activate();
  distR_.activate();
  pre_.setSampleRate(static_cast<float>(sampleRate_));
  postHot_.setSampleRate(static_cast<float>(sampleRate_));
  postClean_.setSampleRate(static_cast<float>(sampleRate_));
  pre_.reset();
  postHot_.reset();
  postClean_.reset();
  toneL_.reset();
  toneR_.reset();
  toneDb_ = 1.0e9f; // force tone coeff update
  toneFc_ = 0.f;
  shapeZone_ = 0.f;
  // ~120 ms release for the active-zone amplitude.
  shapeZoneFall_ = std::exp(-1.f / static_cast<float>(sampleRate_ * 0.12));
  for (int i = 0; i < kShapeHistBins; ++i)
  {
    histAcc_[i] = 0.f;
    histDisp_[i] = 0.f;
  }
  applyFilterParams();
  applyToneParams();
}

void HarmonicsPlugin::applyFilterParams()
{
  const int preHp = Dsp::complementaryModeToStages(params_[kParamPreHpMode]);
  const int preLp = Dsp::complementaryModeToStages(params_[kParamPreLpMode]);
  const int postHp = Dsp::complementaryModeToStages(params_[kParamPostHpMode]);
  const int postLp = Dsp::complementaryModeToStages(params_[kParamPostLpMode]);
  pre_.setParams(params_[kParamPreHipass], params_[kParamPreLopass], preHp, preLp);
  postHot_.setParams(
    params_[kParamPostHipass], params_[kParamPostLopass], postHp, postLp);
  postClean_.setParams(
    params_[kParamPostHipass], params_[kParamPostLopass], postHp, postLp);
}

void HarmonicsPlugin::applyToneParams()
{
  const float db = std::clamp(params_[kParamTone], -12.f, 12.f);
  const float sr = static_cast<float>(sampleRate_);
  const float ny = sr * 0.45f;

  // Effective wet band ≈ Feed ∩ Post (what the delta can carry after filters).
  float fLo = 20.f;
  float fHi = std::min(20000.f, ny);
  if (Dsp::complementaryModeToStages(params_[kParamPreHpMode]) > 0)
    fLo = std::max(fLo, params_[kParamPreHipass]);
  if (Dsp::complementaryModeToStages(params_[kParamPostHpMode]) > 0)
    fLo = std::max(fLo, params_[kParamPostHipass]);
  if (Dsp::complementaryModeToStages(params_[kParamPreLpMode]) > 0)
    fHi = std::min(fHi, params_[kParamPreLopass]);
  if (Dsp::complementaryModeToStages(params_[kParamPostLpMode]) > 0)
    fHi = std::min(fHi, params_[kParamPostLopass]);
  fLo = std::clamp(fLo, 20.f, ny);
  fHi = std::clamp(fHi, 20.f, ny);
  if (fHi < fLo * 1.05f)
    fHi = std::min(ny, fLo * 1.5f);

  // Shelf sits at the band's geometric centre — Exciter→air, Bass→lows, Wide→mids.
  const float fc = std::sqrt(fLo * fHi);

  if (db == toneDb_ && fc == toneFc_)
    return;
  toneDb_ = db;
  toneFc_ = fc;

  if (std::fabs(db) < 0.05f)
  {
    toneL_.setNull();
    toneR_.setNull();
    return;
  }

  const float peak = Dsp::dbToLin(db);
  toneL_.setHighshelfRbj(fc, 0.707f, peak, sr);
  toneR_.copyCoeffs(toneL_);
}

void HarmonicsPlugin::observeSend(float sendL, float sendR)
{
  const float peak = std::max(std::fabs(sendL), std::fabs(sendR));
  if (peak >= shapeZone_)
    shapeZone_ = peak;
  else
    shapeZone_ *= shapeZoneFall_;

  // Signed sample into histogram (Louder channel).
  const float x = (std::fabs(sendL) >= std::fabs(sendR)) ? sendL : sendR;
  const float xn = std::clamp(x, -1.f, 1.f);
  const float t = (xn + 1.f) * 0.5f * static_cast<float>(kShapeHistBins);
  int bin = static_cast<int>(t);
  if (bin >= kShapeHistBins)
    bin = kShapeHistBins - 1;
  if (bin < 0)
    bin = 0;
  histAcc_[bin] += 1.f;
}

void HarmonicsPlugin::processSample(float& L, float& R, bool bypass,
                                    bool preListen, bool postListen, float dry,
                                    float wet)
{
  if (bypass)
  {
    shapeZone_ *= shapeZoneFall_;
    return;
  }

  // Two parallel paths:
  //   dry:  input
  //   wet:  feed → waveshaper → post
  // Mix uses wet−clean (clean = feed→post, no shaper) so Dry stays raw and
  // Dry+Wet never double the linear band (no cancellation notches).
  const float inL = L;
  const float inR = R;

  const float sendL = pre_.processWet(0, inL);
  const float sendR = pre_.processWet(1, inR);
  observeSend(sendL, sendR);

  float shapedL = distL_.process(sendL);
  float shapedR = distR_.process(sendR);

  const float hotL = postHot_.processWet(0, shapedL);
  const float hotR = postHot_.processWet(1, shapedR);
  const float cleanL = postClean_.processWet(0, sendL);
  const float cleanR = postClean_.processWet(1, sendR);
  float deltaL = hotL - cleanL;
  float deltaR = hotR - cleanR;
  deltaL = static_cast<float>(toneL_.process(deltaL));
  deltaR = static_cast<float>(toneR_.process(deltaR));
  toneL_.sanitize();
  toneR_.sanitize();

  Dsp::sanitizeDenormal(deltaL);
  Dsp::sanitizeDenormal(deltaR);

  // Feed listen solos the send; post listen solos what Wet adds (delta).
  if (postListen)
  {
    L = deltaL * wet;
    R = deltaR * wet;
    return;
  }
  if (preListen)
  {
    L = sendL;
    R = sendR;
    return;
  }

  L = inL * dry + deltaL * wet;
  R = inR * dry + deltaR * wet;
}

int HarmonicsPlugin::takeShapePoint(float* out, int maxOut)
{
  const int need = 1 + kShapeHistBins;
  if (!out || maxOut < need)
    return 0;

  // Soft heatmap: max-normalize this flush's hits, then decay display bins
  // (~2 s fade at ~30 Hz viz rate).
  float peak = 0.f;
  for (int i = 0; i < kShapeHistBins; ++i)
    peak = std::max(peak, histAcc_[i]);
  const float inv = peak > 1.e-6f ? 1.f / peak : 0.f;
  constexpr float kHistDecay = 0.9835f; // ≈ e^{-1/60}
  for (int i = 0; i < kShapeHistBins; ++i)
  {
    const float v = histAcc_[i] * inv;
    histDisp_[i] = std::max(histDisp_[i] * kHistDecay, v);
    histAcc_[i] = 0.f;
  }

  out[0] = std::clamp(shapeZone_, 0.f, 1.f);
  for (int i = 0; i < kShapeHistBins; ++i)
    out[1 + i] = std::clamp(histDisp_[i], 0.f, 1.f);
  return need;
}

tresult PLUGIN_API HarmonicsPlugin::setActive(TBool state)
{
  tresult result = EffectBase::setActive(state);
  if (result != kResultOk)
    return result;
  if (state)
    resetProcessing();
  else
  {
    distL_.deactivate();
    distR_.deactivate();
  }
  return kResultOk;
}

tresult PLUGIN_API HarmonicsPlugin::setupProcessing(ProcessSetup& newSetup)
{
  tresult result = EffectBase::setupProcessing(newSetup);
  if (result != kResultOk)
    return result;
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  resetProcessing();
  return kResultOk;
}

tresult PLUGIN_API HarmonicsPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);

  const bool bypass = params_[kParamBypass] >= 0.5f;
  const bool preListen = params_[kParamPreListen] >= 0.5f;
  const bool postListen = params_[kParamListen] >= 0.5f;
  const float dry = Dsp::dbToLin(std::clamp(params_[kParamDry], -60.f, 12.f));
  const float wet = Dsp::dbToLin(std::clamp(params_[kParamWet], -60.f, 12.f));
  const float drive = std::clamp(params_[kParamDrive], 0.1f, 10.f);
  const float blend = std::clamp(params_[kParamBlend], -10.f, 10.f);
  const float asymmetry = std::clamp(params_[kParamAsymmetry], -1.f, 1.f);
  const int over = snapOversample(params_[kParamOversample]);

  distL_.setOversample(over);
  distR_.setOversample(over);
  distL_.setParams(blend, drive, asymmetry);
  distR_.setParams(blend, drive, asymmetry);
  applyFilterParams();
  applyToneParams();

  io_.setBypassGains(bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  const bool hasHostAudio = io_.begin(data);
  const bool quietIn = !hasHostAudio || io_.inputWasQuiet();
  // No long tail — skip OS shaper on quiet; scrub denormals once.
  if (quietIn)
  {
    distL_.sanitize();
    distR_.sanitize();
    if (hasHostAudio)
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
      processSample(L, R, bypass, preListen, postListen, dry, wet);
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
      processSample(L, R, bypass, preListen, postListen, dry, wet);
      if (nCh > 0)
        out[0][i] = L;
      if (nCh > 1)
        out[1][i] = R;
    }
  }

  distL_.sanitize();
  distR_.sanitize();

  io_.end(data);
  return kResultOk;
}

tresult PLUGIN_API HarmonicsPlugin::setState(IBStream* state)
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
  applyFilterParams();
  applyToneParams();
  notifyHostStateRestored();
  return kResultOk;
}

tresult PLUGIN_API HarmonicsPlugin::getState(IBStream* state)
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

} // namespace Harmonics
} // namespace calfNXT
