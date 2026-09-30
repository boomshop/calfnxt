#include "crusher_dsp.h"

#include "base/source/fstreamer.h"
#include "channel_mode.h"
#include "dsp_math.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace calfNXT {
namespace Crusher {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e5843u; // 'CNXC'
constexpr uint32 kStateVersion = 3; // v3: + channel
constexpr float kHistoryDisplayMs = 8000.f;
/** Ignore near-silence when tracking out/in ratios (avoids 0/ε spikes). */
constexpr float kHistRatioFloor = 1.e-4f;

float warpOutDisp(float maxIn, float maxOut, float maxBoost, float minCut)
{
  float outDisp = maxOut;
  if (maxBoost > 1.001f)
    outDisp = std::max(outDisp, maxIn * maxBoost);
  else if (minCut < 0.999f)
    outDisp = std::min(outDisp, maxIn * minCut);
  return outDisp;
}

void accumulateRatio(float inA, float outA, float& maxBoost, float& minCut)
{
  if (inA < kHistRatioFloor)
    return;
  const float scale = outA / inA;
  maxBoost = std::max(maxBoost, std::max(1.f, scale));
  minCut = std::min(minCut, std::min(1.f, scale));
}
} // namespace

CrusherPlugin::CrusherPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API CrusherPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

void CrusherPlugin::histResetSlotScale(float inL, float outL, float inR, float outR)
{
  histMaxBoostL_ = 1.f;
  histMinCutL_ = 1.f;
  histMaxBoostR_ = 1.f;
  histMinCutR_ = 1.f;
  accumulateRatio(inL, outL, histMaxBoostL_, histMinCutL_);
  accumulateRatio(inR, outR, histMaxBoostR_, histMinCutR_);
}

void CrusherPlugin::histFeedSample(float inL, float outL, float inR, float outR)
{
  // Always advance the ring so opening the editor shows recent history.
  float* s = hist_.slot();
  s[0] = std::max(inL, s[0]);
  s[1] = std::max(outL, s[1]);
  s[2] = std::max(inR, s[2]);
  s[3] = std::max(outR, s[3]);
  accumulateRatio(inL, outL, histMaxBoostL_, histMinCutL_);
  accumulateRatio(inR, outR, histMaxBoostR_, histMinCutR_);
  s[1] = warpOutDisp(s[0], s[1], histMaxBoostL_, histMinCutL_);
  s[3] = warpOutDisp(s[2], s[3], histMaxBoostR_, histMinCutR_);

  const float seed[kHistChannels] = {inL, outL, inR, outR};
  const int before = hist_.sampleCount();
  hist_.endSample(seed);
  if (hist_.sampleCount() == 0 && before != 0)
    histResetSlotScale(inL, outL, inR, outR);
}

void CrusherPlugin::publishHistSnapshot()
{
  if (!vizConsumerActive())
    return;
  hist_.publish();
}

void CrusherPlugin::resetProcessing()
{
  shapeZone_ = 0.f;
  // ~120 ms release for the active-zone amplitude.
  shapeZoneFall_ = std::exp(-1.f / static_cast<float>(sampleRate_ * 0.12));
  for (int i = 0; i < kShapeHistBins; ++i)
  {
    histAcc_[i] = 0.f;
    histDisp_[i] = 0.f;
  }
  hist_.reset();
  hist_.setDisplayWindow(sampleRate_, kHistoryDisplayMs);
  histResetSlotScale(0.f, 0.f, 0.f, 0.f);
  applyCrushParams(makeBlockState());
}

tresult PLUGIN_API CrusherPlugin::setActive(TBool state)
{
  if (state)
    resetProcessing();
  return EffectBase::setActive(state);
}

tresult PLUGIN_API CrusherPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  scratch64_.prepare(newSetup.maxSamplesPerBlock);
  bit_.setSampleRate(static_cast<uint32_t>(sampleRate_));
  resetProcessing();
  return EffectBase::setupProcessing(newSetup);
}

CrusherPlugin::BlockState CrusherPlugin::makeBlockState() const
{
  BlockState s;
  s.bypass = params_[kParamBypass] >= 0.5f;
  s.mode = params_[kParamMode] >= 0.5f ? 1 : 0;
  s.channel = Dsp::channelModeFromPlain(params_[kParamChannel]);
  s.bits = std::clamp(params_[kParamBits], 1.f, 16.f);
  s.morph = std::clamp(params_[kParamMorph], 0.f, 1.f);
  s.dcLin = std::clamp(Dsp::dbToLin(std::clamp(params_[kParamDc], -12.f, 12.f)), 0.25f, 4.f);
  s.aa = std::clamp(params_[kParamAntiAliasing], 0.f, 1.f);
  return s;
}

void CrusherPlugin::applyCrushParams(const BlockState& s)
{
  bit_.setParams(s.bits, s.morph, s.mode, s.dcLin, s.aa);
}

void CrusherPlugin::processFloat(float* left, float* right, int32 nFrames, const BlockState& state)
{
  for (int32 i = 0; i < nFrames; ++i)
  {
    const float inL = left[i];
    const float inR = right ? right[i] : inL;
    float L = inL;
    float R = inR;

    switch (state.channel)
    {
      case Dsp::ChannelMode::Left:
        observeSend(inL, 0.f);
        L = bit_.process(inL);
        R = inR;
        break;
      case Dsp::ChannelMode::Right:
        observeSend(0.f, inR);
        L = inL;
        R = bit_.process(inR);
        break;
      case Dsp::ChannelMode::Mid:
      {
        float mid = 0.f;
        float side = 0.f;
        Dsp::encodeMs(inL, inR, mid, side);
        observeSend(mid, mid);
        mid = bit_.process(mid);
        Dsp::decodeMs(mid, side, L, R);
        break;
      }
      case Dsp::ChannelMode::Side:
      {
        float mid = 0.f;
        float side = 0.f;
        Dsp::encodeMs(inL, inR, mid, side);
        observeSend(side, side);
        side = bit_.process(side);
        Dsp::decodeMs(mid, side, L, R);
        break;
      }
      case Dsp::ChannelMode::Stereo:
      default:
        observeSend(inL, inR);
        L = bit_.process(inL);
        R = bit_.process(inR);
        break;
    }

    Dsp::sanitizeDenormal(L);
    Dsp::sanitizeDenormal(R);
    left[i] = L;
    if (right)
      right[i] = R;
    histFeedSample(std::fabs(inL), std::fabs(L), std::fabs(inR), std::fabs(R));
  }
}

void CrusherPlugin::observeSend(float sendL, float sendR)
{
  const float peak = std::max(std::fabs(sendL), std::fabs(sendR));
  if (peak >= shapeZone_)
    shapeZone_ = peak;
  else
    shapeZone_ *= shapeZoneFall_;

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

tresult PLUGIN_API CrusherPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);

  const BlockState state = makeBlockState();
  applyCrushParams(state);
  io_.setBypassGains(state.bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);

  const bool hasHostAudio = io_.begin(data);
  const int32 nFrames = data.numSamples;
  if (!hasHostAudio)
  {
    // Host silenceFlags: outs unusable — still scroll history + decay shape zone.
    if (nFrames > 0)
    {
      shapeZone_ *= std::pow(shapeZoneFall_, static_cast<float>(nFrames));
      for (int32 i = 0; i < nFrames; ++i)
        histFeedSample(0.f, 0.f, 0.f, 0.f);
      publishHistSnapshot();
    }
    return kResultOk;
  }

  if (nFrames <= 0)
  {
    io_.end(data);
    return kResultOk;
  }

  hist_.setDisplayWindow(sampleRate_, kHistoryDisplayMs);

  if (state.bypass || io_.inputWasQuiet())
  {
    shapeZone_ *= std::pow(shapeZoneFall_, static_cast<float>(nFrames));

    auto feedPassthrough = [&](auto** out) {
      for (int32 i = 0; i < nFrames; ++i)
      {
        if (state.bypass && out && out[0])
        {
          const float L = static_cast<float>(out[0][i]);
          const float R = (out[1]) ? static_cast<float>(out[1][i]) : L;
          const float aL = std::fabs(L);
          const float aR = std::fabs(R);
          histFeedSample(aL, aL, aR, aR);
        }
        else
          histFeedSample(0.f, 0.f, 0.f, 0.f);
      }
    };
    if (data.symbolicSampleSize == kSample32)
      feedPassthrough(data.outputs[0].channelBuffers32);
    else if (data.symbolicSampleSize == kSample64)
      feedPassthrough(data.outputs[0].channelBuffers64);
    else
    {
      for (int32 i = 0; i < nFrames; ++i)
        histFeedSample(0.f, 0.f, 0.f, 0.f);
    }

    publishHistSnapshot();
    io_.end(data);
    return kResultOk;
  }

  // channelBuffers32/64 share a union. A non-null 32-bit pointer is not proof
  // the block is float — Reaper's 64-bit path used to bail out here.
  const int32 nCh = data.outputs[0].numChannels;
  if (data.symbolicSampleSize == kSample32)
  {
    auto** outs = data.outputs[0].channelBuffers32;
    if (!outs || !outs[0])
    {
      io_.end(data);
      return kResultOk;
    }
    float* right = (nCh > 1 && outs[1]) ? outs[1] : nullptr;
    processFloat(outs[0], right, nFrames, state);
  }
  else if (data.symbolicSampleSize == kSample64)
  {
    auto** outs = data.outputs[0].channelBuffers64;
    double* right = (outs && nCh > 1 && outs[1]) ? outs[1] : nullptr;
    const bool ok = outs && outs[0]
                    && scratch64_.process(outs[0], right, nFrames,
                                          [&](float* left, float* rightF, int32 n) {
                                            processFloat(left, rightF, n, state);
                                          });
    if (!ok)
    {
      io_.end(data);
      return kResultOk;
    }
  }
  else
  {
    io_.end(data);
    return kResultOk;
  }

  publishHistSnapshot();
  io_.end(data);
  return kResultOk;
}

int CrusherPlugin::takeShapePoint(float* out, int maxOut)
{
  const int need = 1 + kShapeHistBins;
  if (!out || maxOut < need)
    return 0;

  float peak = 0.f;
  for (int i = 0; i < kShapeHistBins; ++i)
    peak = std::max(peak, histAcc_[i]);
  const float inv = peak > 1.e-6f ? 1.f / peak : 0.f;
  constexpr float kHistDecay = 0.9835f; // ≈ e^{-1/60} at ~30 Hz viz
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

int CrusherPlugin::takeEnvelopeDisplay(float* out, int maxOut)
{
  return hist_.take(out, maxOut, [](const float* src, float* dst) {
    dst[0] = std::fabs(src[0]);
    dst[1] = std::fabs(src[1]);
    dst[2] = std::fabs(src[2]);
    dst[3] = std::fabs(src[3]);
  });
}

void CrusherPlugin::configureVizBins(const char* id, int bins)
{
  if (!id || std::strcmp(id, vizEnvelopeId()) != 0)
    return;
  hist_.setVisibleSlots(bins);
}

tresult PLUGIN_API CrusherPlugin::setState(IBStream* state)
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

tresult PLUGIN_API CrusherPlugin::getState(IBStream* state)
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

} // namespace Crusher
} // namespace calfNXT
