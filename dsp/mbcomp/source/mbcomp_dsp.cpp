#include "mbcomp_dsp.h"

#include "base/source/fstreamer.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace calfNXT {
namespace Mbcomp {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x434e584Du; // 'CNXM'
constexpr uint32 kStateVersion = 1;
constexpr float kHistoryDisplayMs = 10000.f;

float linToDbSafe(float lin)
{
  if (!(lin > 1.0e-12f))
    return -96.f;
  return 20.f * std::log10(lin);
}

Dsp::DetectorMode detectorModeFromPlain(float v)
{
  switch (static_cast<int>(std::lround(std::clamp(v, 0.f, 2.f))))
  {
    case 1:
      return Dsp::DetectorMode::Rms;
    case 2:
      return Dsp::DetectorMode::Opto;
    default:
      return Dsp::DetectorMode::Peak;
  }
}

Dsp::StereoLink stereoLinkFromPlain(float v)
{
  switch (static_cast<int>(std::lround(std::clamp(v, 0.f, 2.f))))
  {
    case 1:
      return Dsp::StereoLink::Average;
    case 2:
      return Dsp::StereoLink::Mid;
    default:
      return Dsp::StereoLink::Max;
  }
}
} // namespace

MbcompPlugin::MbcompPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API MbcompPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

int MbcompPlugin::numBands() const
{
  return std::clamp(static_cast<int>(std::lround(params_[kParamNumBands])), 2, kMaxBands);
}

void MbcompPlugin::resetProcessing()
{
  const float sr = static_cast<float>(sampleRate_);
  splitL_.setSampleRate(sr);
  splitR_.setSampleRate(sr);
  splitL_.reset();
  splitR_.reset();

  for (int b = 0; b < kMaxBands; ++b)
  {
    gr_[b].setSampleRate(sr);
    gr_[b].reset();
    grMeter_[b].reset(sr);
    bandInHold_[b].reset();
    bandOutHold_[b].reset();
    lastGrDb_[b] = 0.f;
    std::memset(histBuf_[b], 0, sizeof(histBuf_[b]));
    histPos_[b] = 0;
    histSampleCount_[b] = 0;
  }
  histSamplesPerSlot_ = 1;
  histVisibleSlots_ = 160;
  {
    std::lock_guard<std::mutex> lock(vizMutex_);
    for (int b = 0; b < kMaxBands; ++b)
    {
      pointInDb_[b] = -96.f;
      pointOutDb_[b] = -96.f;
    }
  }
  {
    std::lock_guard<std::mutex> lock(histMutex_);
    for (int b = 0; b < kMaxBands; ++b)
    {
      std::memset(histSnapshot_[b], 0, sizeof(histSnapshot_[b]));
      histSnapshotPos_[b] = 0;
      histSnapshotSampleCount_[b] = 0;
    }
    histSnapshotSamplesPerSlot_ = 1;
  }
}

tresult PLUGIN_API MbcompPlugin::setActive(TBool state)
{
  if (state)
    resetProcessing();
  return EffectBase::setActive(state);
}

tresult PLUGIN_API MbcompPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  resetProcessing();
  return EffectBase::setupProcessing(newSetup);
}

void MbcompPlugin::histFeedSample(int band, float fullPeak, float bandPeak, float grLin)
{
  if (band < 0 || band >= kMaxBands)
    return;
  const int sps = std::max(1, histSamplesPerSlot_);
  float* buf = histBuf_[band];
  int& pos = histPos_[band];
  int& count = histSampleCount_[band];

  buf[pos + 0] = std::max(buf[pos + 0], fullPeak);
  buf[pos + 1] = std::max(buf[pos + 1], bandPeak);
  if (count == 0)
    buf[pos + 2] = grLin;
  else
    buf[pos + 2] = std::min(buf[pos + 2], grLin);

  ++count;
  if (count >= sps)
  {
    pos = (pos + kHistChannels) % kHistBufSize;
    count = 0;
    buf[pos + 0] = 0.f;
    buf[pos + 1] = 0.f;
    buf[pos + 2] = 1.f;
  }
}

void MbcompPlugin::publishHistSnapshot()
{
  std::lock_guard<std::mutex> lock(histMutex_);
  for (int b = 0; b < kMaxBands; ++b)
  {
    std::memcpy(histSnapshot_[b], histBuf_[b], sizeof(histBuf_[b]));
    histSnapshotPos_[b] = histPos_[b];
    histSnapshotSampleCount_[b] = histSampleCount_[b];
  }
  histSnapshotSamplesPerSlot_ = histSamplesPerSlot_;
}

int MbcompPlugin::takeGainReductionDb(float* out, int maxOut)
{
  if (!out || maxOut < 1)
    return 0;
  const int n = std::min(numBands(), maxOut);
  for (int b = 0; b < n; ++b)
    out[b] = grMeter_[b].takeDb();
  return n;
}

int MbcompPlugin::takeBandGainsDb(float* out, int maxOut)
{
  // Chart GR curves: same values as meters (≤0 dB).
  if (!out || maxOut < 1)
    return 0;
  const int n = std::min(numBands(), maxOut);
  for (int b = 0; b < n; ++b)
    out[b] = lastGrDb_[b];
  return n;
}

int MbcompPlugin::takeBandIoLevelsDb(float* out, int maxOut)
{
  if (!out || maxOut < 2)
    return 0;
  const int n = numBands();
  if (maxOut < n * 2)
    return 0;
  for (int b = 0; b < n; ++b)
  {
    float inDb = -96.f;
    float outDb = -96.f;
    bandInHold_[b].takeDb(&inDb, 1);
    bandOutHold_[b].takeDb(&outDb, 1);
    out[b * 2 + 0] = inDb;
    out[b * 2 + 1] = outDb;
  }
  return n * 2;
}

int MbcompPlugin::takeDynamicsPoint(float* out, int maxOut)
{
  // Per-band operating points [in0, out0, in1, out1, …] so the UI can bind
  // the selected band's transfer curve (same math as single-band Compressor).
  if (!out || maxOut < 2)
    return 0;
  const int n = numBands();
  if (maxOut < n * 2)
    return 0;
  std::lock_guard<std::mutex> lock(vizMutex_);
  for (int b = 0; b < n; ++b)
  {
    out[b * 2 + 0] = pointInDb_[b];
    out[b * 2 + 1] = pointOutDb_[b];
  }
  return n * 2;
}

int MbcompPlugin::takeEnvelopeDisplay(float* out, int maxOut)
{
  // Layout: for each active band → [full, band, grLin] × slots, then one shared phase.
  const int bands = numBands();
  const int slots = std::max(kHistMinSlots, std::min(kHistSlots, histVisibleSlots_));
  const int perBand = slots * kHistChannels;
  const int outCount = bands * perBand + 1;
  if (maxOut < outCount)
    return 0;

  float phase = 0.f;
  {
    std::lock_guard<std::mutex> lock(histMutex_);
    const int sps = std::max(1, histSnapshotSamplesPerSlot_);
    phase = static_cast<float>(histSnapshotSampleCount_[0]) / static_cast<float>(sps);
    for (int b = 0; b < bands; ++b)
    {
      const int startPos =
        (kHistBufSize + histSnapshotPos_[b] - (slots - 1) * kHistChannels) % kHistBufSize;
      float* dst = out + b * perBand;
      for (int i = 0; i < slots; ++i)
      {
        const int srcIdx = (startPos + i * kHistChannels) % kHistBufSize;
        dst[i * kHistChannels + 0] = std::fabs(histSnapshot_[b][srcIdx + 0]);
        dst[i * kHistChannels + 1] = std::fabs(histSnapshot_[b][srcIdx + 1]);
        float gr = histSnapshot_[b][srcIdx + 2];
        if (!(gr > 0.f))
          gr = 1.f;
        dst[i * kHistChannels + 2] = std::clamp(gr, 1.0e-6f, 1.f);
      }
    }
  }
  out[outCount - 1] = std::clamp(phase, 0.f, 1.f);
  return outCount;
}

void MbcompPlugin::configureVizBins(const char* id, int bins)
{
  if (!id || std::strcmp(id, vizEnvelopeId()) != 0)
    return;
  histVisibleSlots_ = std::max(kHistMinSlots, std::min(kHistSlots, bins));
}

tresult PLUGIN_API MbcompPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);

  const int bands = numBands();
  const bool globalBypass = params_[kParamBypass] >= 0.5f;
  const float slopeDb = params_[kParamSlope];

  BandState bandState[kMaxBands];
  int listenBand = -1;
  for (int b = 0; b < bands; ++b)
  {
    BandState& st = bandState[b];
    // `active` is UI-legacy; bypass alone decides whether the compressor runs.
    st.active = true;
    st.bypass = params_[bandParam(b, kBandBypass)] >= 0.5f;
    st.listen = params_[bandParam(b, kBandListen)] >= 0.5f;
    st.mix = std::clamp(params_[bandParam(b, kBandMix)], 0.f, 1.f);
    st.dry = 1.f - st.mix;
    st.makeupDb = params_[bandParam(b, kBandMakeup)];
    st.makeupLin = Dsp::dbToLin(st.makeupDb);
    st.link = stereoLinkFromPlain(params_[bandParam(b, kBandLink)]);

    if (st.listen)
      listenBand = b;

    // Only configure compressors that will run this block.
    if (!st.bypass)
    {
      const auto mode = detectorModeFromPlain(params_[bandParam(b, kBandMode)]);
      gr_[b].setSampleRate(static_cast<float>(sampleRate_));
      gr_[b].setParams(
        params_[bandParam(b, kBandAttack)],
        params_[bandParam(b, kBandRelease)],
        params_[bandParam(b, kBandThreshold)],
        params_[bandParam(b, kBandRatio)],
        params_[bandParam(b, kBandKnee)],
        mode,
        st.link,
        params_[bandParam(b, kBandPdr)]);
    }
    else
    {
      gr_[b].reset();
      lastGrDb_[b] = 0.f;
    }
  }

  // Idle slots beyond the active band count — no compressor / meter work.
  for (int b = bands; b < kMaxBands; ++b)
  {
    gr_[b].reset();
    lastGrDb_[b] = 0.f;
    grMeter_[b].forceZero();
  }

  const int nSamples = data.numSamples;
  histSamplesPerSlot_ = std::max(
    1,
    static_cast<int>(std::lround(sampleRate_ * (kHistoryDisplayMs * 0.001) / static_cast<double>(kHistSlots))));

  io_.setBypassGains(globalBypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);
  if (!io_.begin(data))
    return kResultOk;

  if (!data.outputs || !data.outputs[0].channelBuffers32 || data.outputs[0].numChannels < 2)
  {
    io_.end(data);
    return kResultOk;
  }

  float* outL = data.outputs[0].channelBuffers32[0];
  float* outR = data.outputs[0].channelBuffers32[1];
  if (!outL || !outR)
  {
    io_.end(data);
    return kResultOk;
  }

  // Global bypass: dry I/O already in outs. Still run crossovers so history
  // keeps full + band peaks (same idea as Comp/DeEsser keeping the detector).
  if (globalBypass)
  {
    float xoversBypass[kMaxBands - 1] {};
    xoversBypass[0] = params_[kParamXover1];
    xoversBypass[1] = params_[kParamXover2];
    xoversBypass[2] = params_[kParamXover3];
    xoversBypass[3] = params_[kParamXover4];
    xoversBypass[4] = params_[kParamXover5];
    splitL_.setBands(bands);
    splitR_.setBands(bands);
    splitL_.setSlopeDb(slopeDb);
    splitR_.setSlopeDb(slopeDb);
    splitL_.setFreqs(xoversBypass, bands - 1);
    splitR_.setFreqs(xoversBypass, bands - 1);
    splitL_.prepareBlock();
    splitR_.prepareBlock();

    float bandsL[kMaxBands];
    float bandsR[kMaxBands];
    for (int i = 0; i < nSamples; ++i)
    {
      const float fullPeak = std::max(std::fabs(outL[i]), std::fabs(outR[i]));
      splitL_.process(outL[i], bandsL);
      splitR_.process(outR[i], bandsR);
      for (int b = 0; b < bands; ++b)
      {
        const float bandPeak =
          std::max(std::fabs(bandsL[b]), std::fabs(bandsR[b]));
        histFeedSample(b, fullPeak, bandPeak, 1.f);
      }
    }
    for (int b = 0; b < bands; ++b)
    {
      lastGrDb_[b] = 0.f;
      grMeter_[b].forceZero();
    }
    {
      std::lock_guard<std::mutex> lock(vizMutex_);
      for (int b = 0; b < bands; ++b)
      {
        pointInDb_[b] = -96.f;
        pointOutDb_[b] = -96.f;
      }
    }
    publishHistSnapshot();
    io_.end(data);
    return kResultOk;
  }

  float xovers[kMaxBands - 1] {};
  xovers[0] = params_[kParamXover1];
  xovers[1] = params_[kParamXover2];
  xovers[2] = params_[kParamXover3];
  xovers[3] = params_[kParamXover4];
  xovers[4] = params_[kParamXover5];

  // Configure only the splits in use for this band count / slope.
  splitL_.setBands(bands);
  splitR_.setBands(bands);
  splitL_.setSlopeDb(slopeDb);
  splitR_.setSlopeDb(slopeDb);
  splitL_.setFreqs(xovers, bands - 1);
  splitR_.setFreqs(xovers, bands - 1);
  splitL_.prepareBlock();
  splitR_.prepareBlock();

  float bandsL[kMaxBands];
  float bandsR[kMaxBands];

  for (int i = 0; i < nSamples; ++i)
  {
    float L = outL[i];
    float R = outR[i];
    const float fullPeak = std::max(std::fabs(L), std::fabs(R));

    splitL_.process(L, bandsL);
    splitR_.process(R, bandsR);

    float sumL = 0.f;
    float sumR = 0.f;
    float listenL = 0.f;
    float listenR = 0.f;
    const bool anyListen = listenBand >= 0;

    for (int b = 0; b < bands; ++b)
    {
      float bL = bandsL[b];
      float bR = bandsR[b];
      Dsp::sanitizeDenormal(bL);
      Dsp::sanitizeDenormal(bR);
      const float bandPeak = std::max(std::fabs(bL), std::fabs(bR));
      bandInHold_[b].accumulate(0, bandPeak);

      const BandState& st = bandState[b];
      float grLin = 1.f;

      if (!st.bypass)
      {
        float detL = bL;
        float detR = bR;
        if (st.link == Dsp::StereoLink::Mid)
        {
          const float mid = 0.5f * (bL + bR);
          detL = mid;
          detR = mid;
        }
        grLin = gr_[b].processDetector(detL, detR);
        Dsp::sanitizeDenormal(grLin);
        if (!(grLin > 0.f) || !std::isfinite(grLin))
          grLin = 1.f;

        const float wetL = bL * grLin * st.makeupLin;
        const float wetR = bR * grLin * st.makeupLin;
        bL = st.dry * bL + st.mix * wetL;
        bR = st.dry * bR + st.mix * wetR;
        Dsp::sanitizeDenormal(bL);
        Dsp::sanitizeDenormal(bR);

        const float grDb = linToDbSafe(grLin);
        grMeter_[b].process(grLin);
        lastGrDb_[b] = grDb;
        // Smoothed detector (not sample peak) — keeps the point on the curve.
        {
          const float inDb = linToDbSafe(gr_[b].lastDetectorLin());
          const float outDb = inDb + grDb + st.makeupDb;
          pointInDb_[b] = inDb;
          pointOutDb_[b] = outDb;
        }
      }
      else
      {
        // Bypassed band: passthrough only — compressor already reset above.
        grMeter_[b].forceZero();
        lastGrDb_[b] = 0.f;
        const float inDb = linToDbSafe(bandPeak);
        pointInDb_[b] = inDb;
        pointOutDb_[b] = inDb;
      }

      bandOutHold_[b].accumulate(0, std::max(std::fabs(bL), std::fabs(bR)));
      // Always feed full + band peaks; GR history is unity while bypassed.
      histFeedSample(b, fullPeak, bandPeak, grLin);

      if (anyListen && b == listenBand)
      {
        listenL = bL;
        listenR = bR;
      }
      sumL += bL;
      sumR += bR;
    }

    Dsp::sanitizeDenormal(sumL);
    Dsp::sanitizeDenormal(sumR);

    if (anyListen)
    {
      outL[i] = listenL;
      outR[i] = listenR;
    }
    else
    {
      outL[i] = sumL;
      outR[i] = sumR;
    }
  }

  publishHistSnapshot();
  io_.end(data);
  return kResultOk;
}

tresult PLUGIN_API MbcompPlugin::setState(IBStream* state)
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

tresult PLUGIN_API MbcompPlugin::getState(IBStream* state)
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

} // namespace Mbcomp
} // namespace calfNXT
