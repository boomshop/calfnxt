#include "octaver_dsp.h"

#include "base/source/fstreamer.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <cstring>

namespace calfNXT {
namespace Octaver {

using namespace Steinberg;
using namespace Steinberg::Vst;

namespace {
constexpr uint32 kStateMagic = 0x4f435456u; // 'OCTV'
constexpr uint32 kStateVersion = 2; // + mono (trailing)

int nextPow2(int v)
{
  int n = 1;
  while (n < v)
    n <<= 1;
  return n;
}

float midiFromHz(float hz, float ref = 440.f)
{
  if (!(hz > 1.f))
    return 0.f;
  return 69.f + 12.f * std::log2(hz / ref);
}

float linToDbSafe(float x)
{
  return 20.f * std::log10(std::max(x, 1.0e-12f));
}

/** Always '.' decimal — Ardour often runs under de_DE. */
void diagFprintFloat(FILE* f, float v, int prec = 1)
{
  char buf[32];
  std::snprintf(buf, sizeof(buf), "%.*f", prec, double(v));
  for (char* p = buf; *p; ++p)
    if (*p == ',')
      *p = '.';
  std::fputs(buf, f);
}
} // namespace

OctaverPlugin::OctaverPlugin()
: Plugin::EffectBase(ViewRect(0, 0, kEditorWidth, kEditorHeight))
{
}

tresult PLUGIN_API OctaverPlugin::initialize(FUnknown* context)
{
  tresult result = EffectBase::initialize(context);
  if (result != kResultOk)
    return result;

  addStereoIO();
  registerParameters(parameters);
  readParamPlains(params_, kParamCount);
  return kResultOk;
}

int OctaverPlugin::detectDecimation() const
{
  int dec = 1;
  const double sr = sampleRate_ > 0.0 ? sampleRate_ : 44100.0;
  while (sr / double(dec) > 48000.01)
    dec <<= 1;
  return std::max(1, dec);
}

int OctaverPlugin::yinWindow(const BlockState& state) const
{
  const float detectSr = static_cast<float>(sampleRate_ / double(detectDecimation()));
  const float winSec = 0.024f + 0.068f * std::clamp(state.quality, 0.f, 1.f);
  int win = nextPow2(std::max(256, static_cast<int>(detectSr * winSec)));
  return std::clamp(win, 1024, Dsp::YinDetector::kMaxWin);
}

int OctaverPlugin::yinSource(int profile) const
{
  // Bass→guitar thresholds, Cello→strings, Voice→voice, Guitar→guitar.
  switch (std::clamp(profile, 0, 3))
  {
    case 1:
      return 1;
    case 2:
      return 0;
    default:
      return 2;
  }
}

int OctaverPlugin::computeLatency(const BlockState& state) const
{
  const int dec = detectDecimation();
  const int win = yinWindow(state);
  const float sr = static_cast<float>(sampleRate_ > 0.0 ? sampleRate_ : 44100.0);
  const float fmin = std::clamp(state.fmin, 25.f, 400.f);
  const int maxPeriod = std::max(64, static_cast<int>(sr / fmin));
  const int lat = (win * dec) / 2 + maxPeriod + 32;
  return std::clamp(lat, 128, Dsp::LinkedPsola::kSize / 4);
}

void OctaverPlugin::updateLatency(const BlockState& state, bool forceZero)
{
  const uint32 want = forceZero ? 0u : static_cast<uint32>(computeLatency(state));
  if (want == latencySamples_)
    return;
  const bool had = latencySamples_ > 0;
  latencySamples_ = want;
  if (had && componentHandler)
    componentHandler->restartComponent(kLatencyChanged);
}

uint32 PLUGIN_API OctaverPlugin::getLatencySamples()
{
  return latencySamples_;
}

void OctaverPlugin::resetProcessing()
{
  psolaM1_.reset();
  psolaM2_.reset();
  psolaP1_.reset();
  yin_.reset();
  sub_.reset();
  toneM1L_.reset();
  toneM1R_.reset();
  toneM2L_.reset();
  toneM2R_.reset();
  toneP1L_.reset();
  toneP1R_.reset();
  hopCount_ = 0;
  pitch_.reset();
  lastInMidi_ = 0.f;
  duckHops_ = 0;
  staleGateHops_ = 0;
  wetGateSm_ = 0.f;
  lastDetect_ = -1;
  lastProfile_ = -1;
  std::memset(yinBuf_, 0, sizeof(yinBuf_));
  std::memset(histBuf_, 0, sizeof(histBuf_));
  histPos_ = 0;
  histSampleCount_ = 0;
  {
    std::lock_guard<std::mutex> lock(histMutex_);
    std::memset(histSnapshot_, 0, sizeof(histSnapshot_));
    histSnapshotPos_ = 0;
    histSnapshotSampleCount_ = 0;
  }
  const BlockState st = makeBlockState();
  const float sr = static_cast<float>(sampleRate_ > 0.0 ? sampleRate_ : 44100.0);
  hopSize_ = std::max(64, static_cast<int>(sr * 0.008));
  {
    const int slots = std::max(kHistMinSlots, std::min(kHistSlots, histVisibleSlots_));
    histSamplesPerSlot_ =
      std::max(1, static_cast<int>(sr * (kHistoryDisplayMs * 0.001f) / float(slots)));
  }
  updateLatency(st, false);
  sampleCounter_ = 0;
  diagM1Acc_ = 0.0;
  diagM1N_ = 0;
  diagParamsDumped_ = false;
}

tresult PLUGIN_API OctaverPlugin::setActive(TBool state)
{
  if (state)
    resetProcessing();
  else
    updateLatency(makeBlockState(), true);
  return EffectBase::setActive(state);
}

tresult PLUGIN_API OctaverPlugin::setupProcessing(ProcessSetup& newSetup)
{
  sampleRate_ = newSetup.sampleRate > 0.0 ? newSetup.sampleRate : 44100.0;
  resetProcessing();
  return EffectBase::setupProcessing(newSetup);
}

OctaverPlugin::BlockState OctaverPlugin::makeBlockState() const
{
  BlockState s;
  s.bypass = params_[kParamBypass] >= 0.5f;
  s.mono = params_[kParamMono] >= 0.5f;
  s.profile = std::clamp(static_cast<int>(std::lround(params_[kParamProfile])), 0, 3);
  s.quality = std::clamp(params_[kParamQuality], 0.f, 1.f);
  s.octaveProtect = std::clamp(params_[kParamOctaveProtect], 0.f, 1.f);
  s.unvoiced = std::clamp(params_[kParamUnvoiced], 0.f, 1.f);
  s.detect = static_cast<int>(std::lround(std::clamp(params_[kParamDetect], 0.f, 3.f)));
  s.fmin = params_[kParamFmin];
  s.fmax = std::max(params_[kParamFmax], s.fmin + 20.f);
  s.glideMs = params_[kParamGlide];
  s.gateDb = params_[kParamGate];
  s.attackMs = params_[kParamAttack];

  s.dryOn = params_[kParamDryOn] >= 0.5f;
  s.dryLevelDb = std::clamp(params_[kParamDryLevel], -60.f, 12.f);
  s.dryBal = std::clamp(params_[kParamDryBal], -1.f, 1.f);
  s.dryListen = params_[kParamDryListen] >= 0.5f;

  s.m1On = params_[kParamM1On] >= 0.5f;
  s.m1LevelDb = std::clamp(params_[kParamM1Level], -60.f, 12.f);
  s.m1Bal = std::clamp(params_[kParamM1Bal], -1.f, 1.f);
  s.m1Formant = std::clamp(params_[kParamM1Formant], 0.f, 1.f);
  s.m1Tone = std::clamp(params_[kParamM1Tone], 0.f, 1.f);
  s.m1Listen = params_[kParamM1Listen] >= 0.5f;

  s.m2On = params_[kParamM2On] >= 0.5f;
  s.m2LevelDb = std::clamp(params_[kParamM2Level], -60.f, 12.f);
  s.m2Bal = std::clamp(params_[kParamM2Bal], -1.f, 1.f);
  s.m2Formant = std::clamp(params_[kParamM2Formant], 0.f, 1.f);
  s.m2Tone = std::clamp(params_[kParamM2Tone], 0.f, 1.f);
  s.m2Listen = params_[kParamM2Listen] >= 0.5f;

  s.p1On = params_[kParamP1On] >= 0.5f;
  s.p1LevelDb = std::clamp(params_[kParamP1Level], -60.f, 12.f);
  s.p1Bal = std::clamp(params_[kParamP1Bal], -1.f, 1.f);
  s.p1Formant = std::clamp(params_[kParamP1Formant], 0.f, 1.f);
  s.p1Tone = std::clamp(params_[kParamP1Tone], 0.f, 1.f);
  s.p1Listen = params_[kParamP1Listen] >= 0.5f;

  s.subOn = params_[kParamSubOn] >= 0.5f;
  s.subLevelDb = std::clamp(params_[kParamSubLevel], -60.f, 12.f);
  s.subBal = std::clamp(params_[kParamSubBal], -1.f, 1.f);
  s.subWave = std::clamp(static_cast<int>(std::lround(params_[kParamSubWave])), 0, 3);
  s.subHarm = std::clamp(params_[kParamSubHarm], 0.f, 1.f);
  s.subTone = std::clamp(params_[kParamSubTone], 0.f, 1.f);
  s.subListen = params_[kParamSubListen] >= 0.5f;
  return s;
}

void OctaverPlugin::balanceGains(float bal, float& gL, float& gR)
{
  bal = std::clamp(bal, -1.f, 1.f);
  const float ang = (bal + 1.f) * 0.25f * float(M_PI);
  gL = std::cos(ang);
  gR = std::sin(ang);
}

void OctaverPlugin::copyYinWindow(const BlockState& state, int latency)
{
  const int dec = detectDecimation();
  const int win = yinWindow(state);
  const int half = (win / 2) * dec;
  for (int i = 0; i < win; ++i)
  {
    float acc = 0.f;
    const int centreOff = half - i * dec;
    for (int d = 0; d < dec; ++d)
    {
      const int delay = latency + centreOff - d;
      acc += psolaM1_.peekDetect(delay, state.detect);
    }
    yinBuf_[i] = acc / float(dec);
  }
}

void OctaverPlugin::histFeed(float inMidi, float layerBits, float conf, float flags)
{
  const int pos = histPos_;
  histBuf_[pos + 0] = inMidi;
  histBuf_[pos + 1] = layerBits;
  histBuf_[pos + 2] = conf;
  histBuf_[pos + 3] = flags;
  histBuf_[pos + 4] = 0.f;
  ++histSampleCount_;
  if (histSampleCount_ >= histSamplesPerSlot_)
  {
    histSampleCount_ = 0;
    {
      std::lock_guard<std::mutex> lock(histMutex_);
      histSnapshot_[pos + 0] = inMidi;
      histSnapshot_[pos + 1] = layerBits;
      histSnapshot_[pos + 2] = conf;
      histSnapshot_[pos + 3] = flags;
      histSnapshot_[pos + 4] = 0.f;
      histSnapshotPos_ = pos;
      histSnapshotSampleCount_ = 0;
      histSnapshotSamplesPerSlot_ = histSamplesPerSlot_;
    }
    histPos_ = (histPos_ + kHistChannels) % kHistBufSize;
    histBuf_[histPos_ + 0] = inMidi;
    histBuf_[histPos_ + 1] = layerBits;
    histBuf_[histPos_ + 2] = conf;
    histBuf_[histPos_ + 3] = flags;
    histBuf_[histPos_ + 4] = 0.f;
  }
}

void OctaverPlugin::publishHistSnapshot()
{
  std::lock_guard<std::mutex> lock(histMutex_);
  std::memcpy(histSnapshot_, histBuf_, sizeof(histBuf_));
  histSnapshotPos_ = histPos_;
  histSnapshotSampleCount_ = histSampleCount_;
  histSnapshotSamplesPerSlot_ = histSamplesPerSlot_;
}

int OctaverPlugin::takePitchHistory(float* out, int maxOut)
{
  const int slots = std::max(kHistMinSlots, std::min(kHistSlots, histVisibleSlots_));
  const int outCount = slots * kHistChannels;
  if (maxOut < outCount + 1)
    return 0;

  float phase = 0.f;
  {
    std::lock_guard<std::mutex> lock(histMutex_);
    const int startPos =
      (kHistBufSize + histSnapshotPos_ - (slots - 1) * kHistChannels) % kHistBufSize;
    const int sps = std::max(1, histSnapshotSamplesPerSlot_);
    phase = static_cast<float>(histSnapshotSampleCount_) / static_cast<float>(sps);
    for (int i = 0; i < slots; ++i)
    {
      const int srcIdx = (startPos + i * kHistChannels) % kHistBufSize;
      out[i * kHistChannels + 0] = histSnapshot_[srcIdx + 0];
      out[i * kHistChannels + 1] = histSnapshot_[srcIdx + 1];
      out[i * kHistChannels + 2] = histSnapshot_[srcIdx + 2];
      out[i * kHistChannels + 3] = histSnapshot_[srcIdx + 3];
      out[i * kHistChannels + 4] = histSnapshot_[srcIdx + 4];
    }
  }
  out[outCount] = std::clamp(phase, 0.f, 1.f);
  return outCount + 1;
}

void OctaverPlugin::configureVizBins(const char* id, int bins)
{
  if (!id || std::strcmp(id, vizPitchId()) != 0)
    return;
  histVisibleSlots_ = std::max(kHistMinSlots, std::min(kHistSlots, bins));
}

tresult PLUGIN_API OctaverPlugin::process(ProcessData& data)
{
  syncParamPlains(data, params_, kParamCount);

  if (!diagChecked_)
  {
    diagChecked_ = true;
    const char* env = std::getenv("CALFNXT_OCTAVER_DIAG");
    diagEnabled_ = env && env[0] != '\0' && env[0] != '0';
    if (diagEnabled_)
    {
      const char* logPath = std::getenv("CALFNXT_OCTAVER_DIAG_LOG");
      if (!logPath || !logPath[0])
        logPath = "/tmp/calfnxt-octaver.log";
      diagFile_ = std::fopen(logPath, "w");
      if (diagFile_)
      {
        std::fprintf(diagFile_,
                     "# calfnxt octaver diag  sr=%.1f\n"
                     "# t gate rawF0 f0 lastF0 conf period pSm mix grains path "
                     "m1Db detRms flat octSus reserved\n"
                     "# path: 0=off 2=cold 3=leapAccept 4=leapHold 5=glide 6=scrape\n",
                     sampleRate_);
        std::fflush(diagFile_);
      }
    }
  }

  const BlockState state = makeBlockState();
  updateLatency(state, false);

  io_.setBypassGains(state.bypass);
  io_.setGainsDb(params_[kParamInGain], params_[kParamOutGain]);
  psolaM1_.setMono(state.mono);
  psolaM2_.setMono(state.mono);
  psolaP1_.setMono(state.mono);

  if (!data.outputs || data.numOutputs < 1 || data.numSamples <= 0)
    return kResultOk;

  const bool hasHostAudio = io_.begin(data);
  const int32 nFrames = data.numSamples;
  const int32 nCh = data.outputs[0].numChannels;
  const int32 nInCh = (data.numInputs > 0 && data.inputs) ? data.inputs[0].numChannels : 0;
  const int latency = static_cast<int>(std::max(1u, latencySamples_));
  const float sr = static_cast<float>(sampleRate_ > 0.0 ? sampleRate_ : 44100.0);

  if (diagEnabled_ && diagFile_ && !diagParamsDumped_)
  {
    diagParamsDumped_ = true;
    std::fprintf(diagFile_,
                 "# params bypass=%.0f profile=%d quality=%.2f oct=%.2f unv=%.2f detect=%d "
                 "fmin=%.1f fmax=%.1f glide=%.1f gate=%.1f attack=%.1f "
                 "dry_on=%d dry_lvl=%.1f m1_on=%d m1_lvl=%.1f m1_form=%.2f m1_tone=%.2f "
                 "m2_on=%d p1_on=%d sub_on=%d listen(dry/m1/m2/p1/sub)=%d/%d/%d/%d/%d "
                 "lat=%u inCh=%d outCh=%d hostAudio=%d\n",
                 params_[kParamBypass], state.profile, state.quality, state.octaveProtect,
                 state.unvoiced, state.detect, state.fmin, state.fmax, state.glideMs, state.gateDb,
                 state.attackMs, int(state.dryOn), state.dryLevelDb, int(state.m1On),
                 state.m1LevelDb, state.m1Formant, state.m1Tone, int(state.m2On), int(state.p1On),
                 int(state.subOn), int(state.dryListen), int(state.m1Listen), int(state.m2Listen),
                 int(state.p1Listen), int(state.subListen), latencySamples_, nInCh, nCh,
                 int(hasHostAudio));
    std::fflush(diagFile_);
  }

  hopSize_ = std::max(64, static_cast<int>(sr * 0.008));
  // Pace slots by the *visible* count (vizcfg ≈ chart width), not kHistSlots —
  // otherwise a ~256-slot roll shows ~5 s while the label still says 10 s.
  {
    const int slots = std::max(kHistMinSlots, std::min(kHistSlots, histVisibleSlots_));
    histSamplesPerSlot_ =
      std::max(1, static_cast<int>(sr * (kHistoryDisplayMs * 0.001f) / float(slots)));
  }

  const float detectSr = sr / float(detectDecimation());
  const int win = yinWindow(state);
  const int src = yinSource(state.profile);

  if (state.detect != lastDetect_ || state.profile != lastProfile_)
  {
    yin_.reset();
    psolaM1_.reset();
    psolaM2_.reset();
    psolaP1_.reset();
    pitch_.reset();
    staleGateHops_ = 0;
    wetGateSm_ = 0.f;
    lastDetect_ = state.detect;
    lastProfile_ = state.profile;
  }

  // Exclusive listen: first match wins.
  int listen = -1;
  if (state.dryListen)
    listen = 0;
  else if (state.m1Listen)
    listen = 1;
  else if (state.m2Listen)
    listen = 2;
  else if (state.p1Listen)
    listen = 3;
  else if (state.subListen)
    listen = 4;

  const float needM1 = (state.m1On || listen == 1) ? 1.f : 0.f;
  const float needM2 = (state.m2On || listen == 2) ? 1.f : 0.f;
  const float needP1 = (state.p1On || listen == 3) ? 1.f : 0.f;
  const float needSub = (state.subOn || listen == 4) ? 1.f : 0.f;

  float dryGL = 1.f, dryGR = 1.f;
  float m1GL = 1.f, m1GR = 1.f;
  float m2GL = 1.f, m2GR = 1.f;
  float p1GL = 1.f, p1GR = 1.f;
  float subGL = 1.f, subGR = 1.f;
  balanceGains(state.dryBal, dryGL, dryGR);
  balanceGains(state.m1Bal, m1GL, m1GR);
  balanceGains(state.m2Bal, m2GL, m2GR);
  balanceGains(state.p1Bal, p1GL, p1GR);
  balanceGains(state.subBal, subGL, subGR);

  const float attackSec = std::max(3.f, state.attackMs) * 0.001f;
  const float releaseSec = std::max(0.006f, attackSec * 0.35f);
  psolaM1_.setMixSlew(attackSec, releaseSec, sr);
  psolaM2_.setMixSlew(attackSec, releaseSec, sr);
  psolaP1_.setMixSlew(attackSec, releaseSec, sr);

  const float attackCoeff =
    1.f - std::exp(-1.f / std::max(1.f, attackSec * sr));
  const float glideCoeff =
    1.f - std::exp(-1.f / std::max(1.f, state.glideMs * 0.001f * sr));

  float layerBits = 0.f;
  if (state.dryOn)
    layerBits += 1.f;
  if (state.m1On)
    layerBits += 2.f;
  if (state.m2On)
    layerBits += 4.f;
  if (state.p1On)
    layerBits += 8.f;
  if (state.subOn)
    layerBits += 16.f;

  auto run = [&](auto** out, bool zeros) {
    for (int32 i = 0; i < nFrames; ++i)
    {
      float L = zeros || nCh <= 0 ? 0.f : static_cast<float>(out[0][i]);
      float R = zeros || nCh <= 1 ? L : static_cast<float>(out[1][i]);
      if (zeros)
        R = 0.f;

      psolaM1_.write(L, R);
      psolaM2_.write(L, R);
      psolaP1_.write(L, R);

      if (++hopCount_ >= hopSize_)
      {
        hopCount_ = 0;
        copyYinWindow(state, latency);
        float rms = 0.f;
        for (int k = 0; k < win; ++k)
          rms += yinBuf_[k] * yinBuf_[k];
        rms = std::sqrt(rms / float(std::max(1, win)));
        const float detectRmsDb = Dsp::linToDb(std::max(rms, 1.0e-9f));

        Dsp::OctaverPitchParams pp;
        pp.octaveProtect = state.octaveProtect;
        pp.gateDb = state.gateDb;
        pp.glideCoeff = glideCoeff;
        pp.fmin = state.fmin;
        pp.fmax = state.fmax;
        pp.yinSource = src;

        const auto yin = yin_.analyze(
          yinBuf_, win, detectSr, state.fmin, state.fmax, state.unvoiced, src, 0.55f);
        const auto hop = Dsp::octaverPitchHop(
          pitch_, yin_, pp, sr, detectSr, yin.f0Hz, yin.confidence, yin.flatness, yin.voiced,
          yin.periodic, yin.octaveSuspect, detectRmsDb);

        if (hop.clearDetectorTrack)
          yin_.clearTrack();

        if (hop.applySnap)
        {
          if (hop.hardSnap)
          {
            psolaM1_.relockPeriod(hop.period, 0.5f);
            if (needM2 > 0.f)
              psolaM2_.relockPeriod(hop.period, 0.25f);
            if (needP1 > 0.f)
              psolaP1_.relockPeriod(hop.period, 2.f);
          }
          else
          {
            psolaM1_.nudgePeriod(hop.period);
            if (needM2 > 0.f)
              psolaM2_.nudgePeriod(hop.period);
            if (needP1 > 0.f)
              psolaP1_.nudgePeriod(hop.period);
          }
        }

        lastInMidi_ = Dsp::octaverMidiFromHz(pitch_.lastF0);
        const bool gateOn = hop.gate > 0.5f;
        if (gateOn && (hop.periodHopSnap || hop.prevWetGate <= 0.5f))
        {
          wetGateSm_ = 1.f;
          psolaM1_.bootstrapMix();
          if (needM2 > 0.f)
            psolaM2_.bootstrapMix();
          if (needP1 > 0.f)
            psolaP1_.bootstrapMix();
        }
        if (gateOn)
          staleGateHops_ = 0;

        if (diagEnabled_ && diagFile_)
        {
          const float tSec = float(sampleCounter_) / sr;
          const float m1Rms = diagM1N_ > 0
                                ? linToDbSafe(float(std::sqrt(diagM1Acc_ / double(diagM1N_))))
                                : -120.f;
          diagM1Acc_ = 0.0;
          diagM1N_ = 0;
          const float periodEff =
            pitch_.lastGoodPeriod > 16.f ? pitch_.lastGoodPeriod : hop.period;
          diagFprintFloat(diagFile_, tSec, 3);
          std::fprintf(diagFile_, " %.0f ", hop.gate);
          diagFprintFloat(diagFile_, hop.rawF0, 1);
          std::fputc(' ', diagFile_);
          diagFprintFloat(diagFile_, hop.f0, 1);
          std::fputc(' ', diagFile_);
          diagFprintFloat(diagFile_, pitch_.lastF0, 1);
          std::fputc(' ', diagFile_);
          diagFprintFloat(diagFile_, hop.confidence, 2);
          std::fputc(' ', diagFile_);
          diagFprintFloat(diagFile_, periodEff, 1);
          std::fputc(' ', diagFile_);
          diagFprintFloat(diagFile_, psolaM1_.trackedPeriod(), 1);
          std::fputc(' ', diagFile_);
          diagFprintFloat(diagFile_, psolaM1_.wetMix(), 2);
          std::fprintf(diagFile_, " %d %d ", psolaM1_.grainCount(), hop.pathCode);
          diagFprintFloat(diagFile_, m1Rms, 1);
          std::fputc(' ', diagFile_);
          diagFprintFloat(diagFile_, pitch_.detectRmsDb, 1);
          std::fputc(' ', diagFile_);
          diagFprintFloat(diagFile_, hop.flatness, 2);
          std::fprintf(diagFile_, " %d %d\n", int(hop.octaveSuspect), 0);
        }
      }

      const float hopT = hopSize_ > 1 ? float(hopCount_) / float(hopSize_) : 1.f;
      float period = Dsp::octaverPsolaPeriod(pitch_, hopT);

      // Bypass ducks layers via the same wetGate crossfade (automation-safe).
      const float gateTarget = state.bypass ? 0.f : pitch_.wetGate;
      if (gateTarget > 0.5f)
        wetGateSm_ = 1.f;
      else
        wetGateSm_ += (gateTarget - wetGateSm_) * attackCoeff;
      Dsp::sanitizeDenormal(wetGateSm_);

      // Wet grains on m1 track the pitch whenever the detector gate is open.
      // Layer m1_on only controls whether (wet−dry) is mixed to the output.
      psolaM1_.setWetGate(wetGateSm_);
      psolaM2_.setWetGate(needM2 > 0.f ? wetGateSm_ : 0.f);
      psolaP1_.setWetGate(needP1 > 0.f ? wetGateSm_ : 0.f);

      float dryL = 0.f, dryR = 0.f;
      float m1L = 0.f, m1R = 0.f;
      float m2L = 0.f, m2R = 0.f;
      float p1L = 0.f, p1R = 0.f;

      {
        float wL = 0.f, wR = 0.f, dL = 0.f, dR = 0.f;
        // Always run m1 path for delayed dry (PDC).
        psolaM1_.process(period, 0.5f, state.m1Formant, latency, wL, wR, dL, dR);
        dryL = dL;
        dryR = dR;
        const float m1DiffL = wL - dL;
        const float m1DiffR = wR - dR;
        if (diagEnabled_)
        {
          diagM1Acc_ += double(m1DiffL) * double(m1DiffL);
          ++diagM1N_;
        }
        if (needM1 > 0.f)
        {
          m1L = toneM1L_.process(m1DiffL, state.m1Tone, sr);
          m1R = toneM1R_.process(m1DiffR, state.m1Tone, sr);
        }
      }
      if (needM2 > 0.f)
      {
        float wL = 0.f, wR = 0.f, dL = 0.f, dR = 0.f;
        psolaM2_.process(period, 0.25f, state.m2Formant, latency, wL, wR, dL, dR);
        m2L = toneM2L_.process(wL - dL, state.m2Tone, sr);
        m2R = toneM2R_.process(wR - dR, state.m2Tone, sr);
      }
      if (needP1 > 0.f)
      {
        float wL = 0.f, wR = 0.f, dL = 0.f, dR = 0.f;
        psolaP1_.process(period, 2.f, state.p1Formant, latency, wL, wR, dL, dR);
        p1L = toneP1L_.process(wL - dL, state.p1Tone, sr);
        p1R = toneP1R_.process(wR - dR, state.p1Tone, sr);
      }

      float subMono = 0.f;
      if (needSub > 0.f)
      {
        const float subGate = wetGateSm_ * (pitch_.detectRmsDb >= state.gateDb ? 1.f : 0.f);
        subMono = sub_.process(pitch_.lastF0, subGate, sr, state.subWave, state.subHarm, state.subTone);
      }

      float oL = 0.f;
      float oR = 0.f;
      if (state.bypass)
      {
        // Delayed dry (PDC). wetGateSm_→0 keeps PSOLA on the dry fastpath.
        oL = dryL;
        oR = dryR;
      }
      else if (listen >= 0)
      {
        switch (listen)
        {
          case 0:
            oL = dryL * dryGL;
            oR = dryR * dryGR;
            break;
          case 1:
            oL = m1L * m1GL;
            oR = m1R * m1GR;
            break;
          case 2:
            oL = m2L * m2GL;
            oR = m2R * m2GR;
            break;
          case 3:
            oL = p1L * p1GL;
            oR = p1R * p1GR;
            break;
          default:
            oL = subMono * subGL;
            oR = subMono * subGR;
            break;
        }
      }
      else
      {
        const float dryG = Dsp::dbToLin(state.dryLevelDb);
        const float m1G = Dsp::dbToLin(state.m1LevelDb);
        const float m2G = Dsp::dbToLin(state.m2LevelDb);
        const float p1G = Dsp::dbToLin(state.p1LevelDb);
        const float subG = Dsp::dbToLin(state.subLevelDb);
        if (state.dryOn)
        {
          oL += dryL * dryG * dryGL;
          oR += dryR * dryG * dryGR;
        }
        if (state.m1On)
        {
          oL += m1L * m1G * m1GL;
          oR += m1R * m1G * m1GR;
        }
        if (state.m2On)
        {
          oL += m2L * m2G * m2GL;
          oR += m2R * m2G * m2GR;
        }
        if (state.p1On)
        {
          oL += p1L * p1G * p1GL;
          oR += p1R * p1G * p1GR;
        }
        if (state.subOn)
        {
          oL += subMono * subG * subGL;
          oR += subMono * subG * subGR;
        }
      }

      float flags = 0.f;
      const bool gated = pitch_.wetGate > 0.5f;
      if (gated)
        flags += 1.f;
      if (!gated && pitch_.lastConf > 0.1f)
        flags += 2.f;
      if (pitch_.lastOctaveSuspect)
        flags += 4.f;
      // Never draw a pitch while ungated — pause conf spikes were painting
      // phantom octave lines in the roll.
      const float midiOut = gated ? lastInMidi_ : 0.f;
      const float confOut = gated ? pitch_.lastConf : 0.f;
      histFeed(midiOut, layerBits, confOut, flags);

      if (nCh > 0)
        out[0][i] = oL;
      if (nCh > 1)
        out[1][i] = oR;
      ++sampleCounter_;
    }
  };

  if (!hasHostAudio && data.numOutputs > 0)
    data.outputs[0].silenceFlags = 0;

  if (data.symbolicSampleSize == kSample32)
  {
    if (data.outputs[0].channelBuffers32)
      run(data.outputs[0].channelBuffers32, !hasHostAudio);
  }
  else if (data.outputs[0].channelBuffers64)
    run(data.outputs[0].channelBuffers64, !hasHostAudio);

  io_.end(data);
  return kResultOk;
}

tresult PLUGIN_API OctaverPlugin::setState(IBStream* state)
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

tresult PLUGIN_API OctaverPlugin::getState(IBStream* state)
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

} // namespace Octaver
} // namespace calfNXT
