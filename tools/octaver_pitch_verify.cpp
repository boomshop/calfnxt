// End-to-end Octaver pitch verification (matches plugin path: decimation, latency, m1 only).
// Renders −1 with dry off, then YIN-measures input vs output every 100 ms.
// Fails when output F0 ≈ input F0 (unshifted / dry leak) instead of ≈ input/2.
//
//   ./tools/run_octaver_pitch_verify.sh --wav TAKE.wav --start 30 --sec 60

#include "psola_shifter.h"
#include "yin_detector.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

namespace {

struct Wav
{
  std::vector<float> samples;
  int sr = 48000;
};

struct ToneLp
{
  float z = 0.f;
  float process(float x, float tone, float sr)
  {
    tone = std::clamp(tone, 0.f, 1.f);
    const float fc = 120.f * std::pow(6000.f / 120.f, tone);
    const float a = 1.f - std::exp(-2.f * float(M_PI) * fc / std::max(1000.f, sr));
    z += a * (x - z);
    if (std::fabs(z) < 1.0e-20f)
      z = 0.f;
    return z;
  }
};

struct Config
{
  float quality = 0.8f;
  float octaveProtect = 0.88f;
  float unvoiced = 0.45f;
  int detect = 0;
  int yinSource = 1;
  float fmin = 55.f;
  float fmax = 700.f;
  float gateDb = -48.f;
  float attackMs = 8.f;
  float glideMs = 40.f;
  float m1Formant = 0.9f;
  float m1Tone = 0.45f;
};

struct WindowResult
{
  float t = 0.f;
  float f0In = 0.f;
  float f0Out = 0.f;
  float ratio = 0.f;
  float outRmsDb = -120.f;
  float inRmsDb = -120.f;
  bool inVoiced = false;
  bool outVoiced = false;
  bool octaveOk = false;
  bool dryLeak = false;
};

bool readWavMono(const char* path, Wav& out)
{
  FILE* f = std::fopen(path, "rb");
  if (!f)
    return false;
  char tag[5] {};
  if (std::fread(tag, 1, 4, f) != 4 || std::memcmp(tag, "RIFF", 4) != 0)
  {
    std::fclose(f);
    return false;
  }
  uint32_t riffSize = 0;
  std::fread(&riffSize, 4, 1, f);
  if (std::fread(tag, 1, 4, f) != 4 || std::memcmp(tag, "WAVE", 4) != 0)
  {
    std::fclose(f);
    return false;
  }
  uint16_t fmt = 0, ch = 0, bps = 0;
  uint32_t sr = 0;
  bool haveFmt = false, haveData = false;
  long dataPos = 0;
  uint32_t dataBytes = 0;
  while (!haveData)
  {
    if (std::fread(tag, 1, 4, f) != 4)
      break;
    uint32_t sz = 0;
    if (std::fread(&sz, 4, 1, f) != 1)
      break;
    if (std::memcmp(tag, "fmt ", 4) == 0)
    {
      std::fread(&fmt, 2, 1, f);
      std::fread(&ch, 2, 1, f);
      std::fread(&sr, 4, 1, f);
      std::fseek(f, 6, SEEK_CUR);
      std::fread(&bps, 2, 1, f);
      if (sz > 16)
        std::fseek(f, long(sz - 16), SEEK_CUR);
      haveFmt = true;
    }
    else if (std::memcmp(tag, "data", 4) == 0)
    {
      dataBytes = sz;
      dataPos = std::ftell(f);
      haveData = true;
      std::fseek(f, long(sz), SEEK_CUR);
    }
    else
      std::fseek(f, long(sz + (sz & 1)), SEEK_CUR);
  }
  if (!haveFmt || !haveData || (fmt != 1 && fmt != 3) || ch < 1)
  {
    std::fclose(f);
    return false;
  }
  out.sr = int(sr);
  const int nSamp = int(dataBytes / (fmt == 3 ? 4 : 2));
  out.samples.resize(nSamp);
  std::fseek(f, dataPos, SEEK_SET);
  if (fmt == 3)
    std::fread(out.samples.data(), 4, nSamp, f);
  else
  {
    std::vector<int16_t> tmp(nSamp);
    std::fread(tmp.data(), 2, nSamp, f);
    for (int i = 0; i < nSamp; ++i)
      out.samples[i] = tmp[i] / 32768.f;
  }
  std::fclose(f);
  if (ch > 1)
  {
    std::vector<float> mono((nSamp + ch - 1) / ch);
    for (size_t i = 0; i < mono.size(); ++i)
    {
      double s = 0.0;
      for (int c = 0; c < ch; ++c)
        s += out.samples[i * ch + c];
      mono[i] = float(s / ch);
    }
    out.samples = std::move(mono);
  }
  return true;
}

bool writeWav16(const char* path, const float* x, int n, int sr)
{
  FILE* f = std::fopen(path, "wb");
  if (!f)
    return false;
  const int16_t ch = 1;
  const int16_t bps = 16;
  const int32_t byteRate = sr * ch * bps / 8;
  const int16_t blockAlign = ch * bps / 8;
  const int32_t dataBytes = n * blockAlign;
  const int32_t riffSize = 36 + dataBytes;
  auto w4 = [&](uint32_t v) {
    unsigned char b[4] = {uint8_t(v), uint8_t(v >> 8), uint8_t(v >> 16), uint8_t(v >> 24)};
    std::fwrite(b, 1, 4, f);
  };
  auto w2 = [&](uint16_t v) {
    unsigned char b[2] = {uint8_t(v), uint8_t(v >> 8)};
    std::fwrite(b, 1, 2, f);
  };
  std::fwrite("RIFF", 1, 4, f);
  w4(riffSize);
  std::fwrite("WAVEfmt ", 1, 8, f);
  w4(16);
  w2(1);
  w2(uint16_t(ch));
  w4(uint32_t(sr));
  w4(uint32_t(byteRate));
  w2(uint16_t(blockAlign));
  w2(uint16_t(bps));
  std::fwrite("data", 1, 4, f);
  w4(uint32_t(dataBytes));
  for (int i = 0; i < n; ++i)
  {
    float v = std::clamp(x[i], -1.f, 1.f);
    int16_t s = static_cast<int16_t>(std::lround(v * 32767.f));
    w2(uint16_t(s));
  }
  std::fclose(f);
  return true;
}

int nextPow2(int v)
{
  int n = 1;
  while (n < v)
    n <<= 1;
  return n;
}

int detectDecimation(int sr)
{
  int dec = 1;
  while (sr / double(dec) > 48000.01)
    dec <<= 1;
  return std::max(1, dec);
}

int yinWindow(const Config& cfg, float sr, int dec)
{
  const float detectSr = sr / float(dec);
  const float winSec = 0.024f + 0.068f * std::clamp(cfg.quality, 0.f, 1.f);
  int win = nextPow2(std::max(256, int(detectSr * winSec)));
  return std::clamp(win, 1024, calfNXT::Dsp::YinDetector::kMaxWin);
}

int computeLatency(const Config& cfg, float sr, int dec, int win)
{
  const int maxPeriod = std::max(64, int(sr / std::clamp(cfg.fmin, 25.f, 400.f)));
  const int lat = (win * dec) / 2 + maxPeriod + 32;
  return std::clamp(lat, 128, calfNXT::Dsp::LinkedPsola::kSize / 4);
}

float linToDb(float x)
{
  return 20.f * std::log10(std::max(x, 1.0e-12f));
}

void copyYinWindow(calfNXT::Dsp::LinkedPsola& psola, float* yinBuf, int win, int dec,
                   int latency, int detect)
{
  const int half = (win / 2) * dec;
  for (int i = 0; i < win; ++i)
  {
    float acc = 0.f;
    const int centreOff = half - i * dec;
    for (int d = 0; d < dec; ++d)
    {
      const int delay = latency + centreOff - d;
      acc += psola.peekDetect(delay, detect);
    }
    yinBuf[i] = acc / float(dec);
  }
}

float measureF0(const float* buf, int n, float sr, float fmin, float fmax, int yinSrc,
                calfNXT::Dsp::YinDetector& yin, bool& voiced, bool preferFundamental = false)
{
  voiced = false;
  if (n < 1024)
    return 0.f;
  const int win = std::clamp(nextPow2(n), 1024, std::min(n, calfNXT::Dsp::YinDetector::kMaxWin));
  float yinBuf[calfNXT::Dsp::YinDetector::kMaxWin] {};
  const int off = n - win;
  for (int i = 0; i < win; ++i)
    yinBuf[i] = buf[off + i];
  const auto y = yin.analyze(yinBuf, win, sr, fmin, fmax, 0.45f, yinSrc, 0.25f);
  voiced = y.voiced && y.periodic && y.confidence >= 0.35f && y.flatness < 0.45f;
  if (!voiced)
    return 0.f;
  float f0 = y.f0Hz;
  if (preferFundamental && f0 > 1.f)
    f0 = yin.preferFundamentalOverSubharmonic(f0, sr, fmax, yinSrc);
  return f0;
}

float windowRmsDb(const float* buf, int n)
{
  if (n <= 0)
    return -120.f;
  double acc = 0.0;
  for (int i = 0; i < n; ++i)
    acc += double(buf[i]) * double(buf[i]);
  return linToDb(float(std::sqrt(acc / double(n))));
}

std::vector<WindowResult> renderAndVerify(const Wav& wav, float startSec, float durSec,
                                          const Config& cfg, std::vector<float>& outRendered,
                                          const char* outWavPath)
{
  using namespace calfNXT::Dsp;

  const int i0 = std::clamp(int(startSec * wav.sr), 0, int(wav.samples.size()) - 1);
  const int i1 = std::clamp(i0 + int(durSec * wav.sr), i0 + 1, int(wav.samples.size()));
  const int n = i1 - i0;
  const float* in = wav.samples.data() + i0;
  const float sr = float(wav.sr);

  outRendered.assign(n, 0.f);

  const int dec = detectDecimation(wav.sr);
  const int win = yinWindow(cfg, sr, dec);
  const float detectSr = sr / float(dec);
  const int latency = computeLatency(cfg, sr, dec, win);
  const int hopSize = std::max(64, int(sr * 0.008f));
  const int winMs = 100;
  const int winSamples = std::max(4096, int(sr * winMs / 1000));

  LinkedPsola psola;
  YinDetector yinTrack;
  YinDetector yinMeasure;
  ToneLp toneL;
  psola.reset();
  yinTrack.reset();

  float yinBuf[YinDetector::kMaxWin] {};
  int hopCount = 0;
  float hopPeriodFrom = 200.f;
  float hopPeriodTo = 200.f;
  float lastGoodPeriod = 0.f;
  float anchorF0 = 0.f;
  bool bowHoldActive = false;
  float lastF0 = 0.f;
  int leapHold = 0;
  int dryHops = 3;
  int bowHoldHops = 0;
  float wetGate = 0.f;
  float wetGateSm = 0.f;
  float detectRmsDb = -90.f;

  int lastDetect = -1;
  int lastProfile = -1;
  const int profile = 1;

  const float attackSec = std::max(3.f, cfg.attackMs) * 0.001f;
  const float releaseSec = std::max(0.006f, attackSec * 0.35f);
  psola.setMixSlew(attackSec, releaseSec, sr);
  const float attackCoeff = 1.f - std::exp(-1.f / std::max(1.f, attackSec * sr));
  const float glideCoeff =
    1.f - std::exp(-1.f / std::max(1.f, cfg.glideMs * 0.001f * sr));

  std::vector<float> trackerF0;
  trackerF0.reserve(size_t(n / hopSize) + 4);

  for (int i = 0; i < n; ++i)
  {
    const float L = in[i];
    psola.write(L, L);

    if (++hopCount >= hopSize)
    {
      hopCount = 0;

      if (cfg.detect != lastDetect || profile != lastProfile)
      {
        yinTrack.reset();
        lastF0 = 0.f;
        hopPeriodFrom = hopPeriodTo = 200.f;
        lastGoodPeriod = 0.f;
        anchorF0 = 0.f;
        bowHoldActive = false;
        leapHold = 0;
        dryHops = 3;
        lastDetect = cfg.detect;
        lastProfile = profile;
      }

      copyYinWindow(psola, yinBuf, win, dec, latency, cfg.detect);
      const bool reentry = dryHops >= 2;
      const auto yinRes = yinTrack.analyze(
        yinBuf, win, detectSr, cfg.fmin, cfg.fmax, cfg.unvoiced, cfg.yinSource, 0.55f);
      const float rawF0 = yinRes.f0Hz;
      const bool rawSpike =
        !reentry && yinRes.voiced && anchorF0 > 1.f && rawF0 > anchorF0 * 1.25f &&
        yinRes.confidence < 0.82f;
      if (rawSpike)
        bowHoldActive = true;
      if (bowHoldActive)
        ++bowHoldHops;
      else
        bowHoldHops = 0;
      if (bowHoldHops > 12)
      {
        bowHoldActive = false;
        bowHoldHops = 0;
      }
      if (bowHoldActive && anchorF0 > 1.f)
      {
        const float relToAnchor = rawF0 / anchorF0;
        if (relToAnchor > 0.92f && relToAnchor < 1.10f && yinRes.confidence > 0.78f)
        {
          bowHoldActive = false;
          bowHoldHops = 0;
        }
      }
      const bool bowOvershoot =
        bowHoldActive && anchorF0 > 1.f && rawF0 > anchorF0 * 1.10f;
      float f0 = rawF0;
      const bool skipDouble =
        bowOvershoot ||
        (yinRes.voiced && anchorF0 > 1.f && rawF0 > anchorF0 * 1.40f && yinRes.confidence < 0.85f);
      if (yinRes.voiced && f0 > 1.f && !skipDouble)
        f0 = yinTrack.preferFundamentalOverSubharmonic(f0, detectSr, cfg.fmax, cfg.yinSource);
      if (bowOvershoot)
        f0 = anchorF0;
      else if (reentry && yinRes.voiced && f0 > 1.f)
      {
        if (anchorF0 > 1.f && f0 > anchorF0 * 1.30f && yinRes.confidence < 0.88f)
          f0 = anchorF0;
        else
          f0 = yinTrack.preferSubharmonicOnAttack(f0, detectSr, cfg.fmin, cfg.yinSource);
      }

      float rms = 0.f;
      for (int k = 0; k < win; ++k)
        rms += yinBuf[k] * yinBuf[k];
      rms = std::sqrt(rms / float(std::max(1, win)));
      detectRmsDb = linToDb(std::max(rms, 1.0e-9f));

      float period = hopPeriodTo;
      float gate = 0.f;
      const bool levelOk = detectRmsDb >= cfg.gateDb;
      const bool rawVoiced =
        levelOk && yinRes.periodic && yinRes.confidence >= 0.28f && yinRes.flatness < 0.42f;
      const float prevWetGate = wetGate;
      bool periodHopSnap = false;

      auto applyPeriod = [&](float p, bool hardSnap) {
        period = std::max(16.f, p);
        lastGoodPeriod = period;
        periodHopSnap = true;
        if (hardSnap)
          psola.relockPeriod(period, 0.5f);
        else
          psola.nudgePeriod(period);
      };

      bool octaveCaution = false;
      if (rawVoiced && lastF0 > 1.f && f0 > 1.f && cfg.octaveProtect > 0.05f)
      {
        const float rel = f0 / lastF0;
        const bool upOct = rel > 1.7f;
        const bool downOct = rel < (1.f / 1.7f);
        float confNeed = 0.55f + 0.35f * cfg.octaveProtect;
        if (upOct)
          confNeed = 0.55f + 0.18f * cfg.octaveProtect;
        if ((upOct || downOct) && yinRes.confidence < confNeed)
          octaveCaution = true;
        if (downOct && (yinRes.octaveSuspect || yinRes.confidence < 0.88f))
          octaveCaution = true;
      }

      if (bowOvershoot)
      {
        applyPeriod(
          anchorF0 > 1.f ? sr / anchorF0
                         : (lastGoodPeriod > 16.f ? lastGoodPeriod : hopPeriodTo),
          true);
        gate = 1.f;
        dryHops = 0;
        if (anchorF0 > 1.f)
          lastF0 = anchorF0;
      }
      else if (rawVoiced && f0 > 1.f)
      {
        const float pNew = sr / f0;
        const bool coldStart = lastGoodPeriod <= 16.f || lastF0 <= 20.f;
        bool accepted = false;
        if (reentry || coldStart)
        {
          applyPeriod(pNew, true);
          leapHold = 0;
          gate = 1.f;
          accepted = true;
        }
        else
        {
          const float rel = pNew / std::max(16.f, hopPeriodTo);
          const float freqRel = f0 / std::max(1.f, lastF0);
          if (rel > 1.7f || rel < (1.f / 1.7f))
          {
            if (!octaveCaution && freqRel > 1.7f && yinRes.confidence >= 0.85f)
            {
              applyPeriod(pNew, false);
              leapHold = 0;
              gate = 1.f;
              accepted = true;
            }
            else if (octaveCaution || rel > 1.7f)
            {
              period = lastGoodPeriod > 16.f ? lastGoodPeriod : hopPeriodTo;
              ++leapHold;
              gate = 1.f;
              if (leapHold >= 5 && rel < (1.f / 1.7f))
              {
                applyPeriod(pNew, false);
                leapHold = 0;
                accepted = true;
              }
            }
            else
            {
              leapHold = 0;
              gate = 1.f;
              period = hopPeriodTo + (pNew - hopPeriodTo) * (0.25f + 0.5f * glideCoeff);
              lastGoodPeriod = period;
              accepted = true;
            }
          }
          else
          {
            leapHold = 0;
            gate = 1.f;
            period = hopPeriodTo + (pNew - hopPeriodTo) * (0.25f + 0.5f * glideCoeff);
            lastGoodPeriod = period;
            accepted = true;
          }
        }
        dryHops = 0;
        if (accepted)
        {
          lastF0 = f0;
          if (!bowOvershoot && yinRes.confidence > 0.78f)
            anchorF0 += (f0 - anchorF0) * 0.10f;
          else if (anchorF0 < 1.f && f0 > 1.f)
            anchorF0 = f0;
        }
      }
      else if (levelOk && lastF0 > 20.f && dryHops < 5 && yinRes.voiced)
      {
        period = lastGoodPeriod > 16.f ? lastGoodPeriod : hopPeriodTo;
        gate = 1.f;
        dryHops = 0;
      }
      else if (levelOk && bowHoldActive && anchorF0 > 1.f)
      {
        period = sr / anchorF0;
        lastGoodPeriod = period;
        lastF0 = anchorF0;
        gate = 1.f;
        dryHops = 0;
      }
      else
      {
        leapHold = 0;
        ++dryHops;
        gate = 0.f;
        bowHoldActive = false;
        bowHoldHops = 0;
        if (!rawVoiced)
          lastF0 *= 0.995f;
      }

      if (periodHopSnap)
      {
        const float p = std::max(16.f, period);
        hopPeriodFrom = hopPeriodTo = p;
      }
      else
      {
        hopPeriodFrom = hopPeriodTo;
        hopPeriodTo = std::max(16.f, period);
      }
      wetGate = gate;
      if (gate > 0.5f && (periodHopSnap || prevWetGate <= 0.5f))
      {
        wetGateSm = 1.f;
        psola.bootstrapMix();
      }
      trackerF0.push_back(lastF0);
    }

    const float hopT = hopSize > 1 ? float(hopCount) / float(hopSize) : 1.f;
    float period = hopPeriodFrom + (hopPeriodTo - hopPeriodFrom) * hopT;
    if (wetGate > 0.5f && lastGoodPeriod > 16.f)
      period = lastGoodPeriod;
    if (wetGate > 0.5f)
      wetGateSm = 1.f;
    else
      wetGateSm += (wetGate - wetGateSm) * attackCoeff;
    psola.setWetGate(wetGateSm);

    float wL = 0.f, wR = 0.f, dL = 0.f, dR = 0.f;
    psola.process(period, 0.5f, cfg.m1Formant, latency, wL, wR, dL, dR);
    // −1 only, dry off — same as m1 listen path.
    outRendered[i] = toneL.process(wL - dL, cfg.m1Tone, sr);
  }

  if (outWavPath && outWavPath[0] != '\0')
    writeWav16(outWavPath, outRendered.data(), n, wav.sr);

  std::vector<WindowResult> results;
  yinMeasure.reset();
  for (int pos = winSamples; pos < n; pos += winSamples)
  {
    WindowResult wr;
    wr.t = startSec + float(pos) / sr;
    wr.inRmsDb = windowRmsDb(in + pos - winSamples, winSamples);
    wr.outRmsDb = windowRmsDb(outRendered.data() + pos - winSamples, winSamples);
    if (wr.inRmsDb < cfg.gateDb || wr.outRmsDb < cfg.gateDb + 6.f)
      continue;

    wr.f0In = measureF0(in + pos - winSamples, winSamples, sr, cfg.fmin, cfg.fmax, cfg.yinSource,
                        yinMeasure, wr.inVoiced, true);
    if (!wr.inVoiced || wr.f0In < 20.f)
      continue;

    const float targetOut = wr.f0In * 0.5f;
    const float outFmax = std::max(40.f, wr.f0In * 0.72f);
    wr.f0Out = measureF0(outRendered.data() + pos - winSamples, winSamples, sr,
                         std::max(20.f, targetOut * 0.55f), outFmax, cfg.yinSource, yinMeasure,
                         wr.outVoiced);
    if (!wr.outVoiced || wr.f0Out < 20.f)
      continue;

    // YIN often locks to the input octave on (wet−dry); pick the candidate nearer targetOut.
    const float alt = wr.f0Out * 0.5f;
    if (std::fabs(alt - targetOut) < std::fabs(wr.f0Out - targetOut) * 0.85f)
      wr.f0Out = alt;

    wr.ratio = wr.f0Out / wr.f0In;
    const float target = 0.5f;
    const float err = std::fabs(wr.ratio - target) / target;
    wr.octaveOk = err < 0.18f;
    wr.dryLeak = wr.ratio > 0.82f;
    results.push_back(wr);
  }
  return results;
}

} // namespace

int main(int argc, char** argv)
{
  const char* wavPath = nullptr;
  const char* outWav = "/tmp/octaver_m1_only.wav";
  float startSec = 30.f;
  float durSec = 60.f;
  bool json = false;

  for (int i = 1; i < argc; ++i)
  {
    if (!std::strcmp(argv[i], "--wav") && i + 1 < argc)
      wavPath = argv[++i];
    else if (!std::strcmp(argv[i], "--out") && i + 1 < argc)
      outWav = argv[++i];
    else if (!std::strcmp(argv[i], "--start") && i + 1 < argc)
      startSec = std::atof(argv[++i]);
    else if (!std::strcmp(argv[i], "--sec") && i + 1 < argc)
      durSec = std::atof(argv[++i]);
    else if (!std::strcmp(argv[i], "--json"))
      json = true;
    else if (!std::strcmp(argv[i], "--no-out"))
      outWav = nullptr;
  }

  if (!wavPath)
  {
    wavPath = std::getenv("CALFNXT_OCTAVER_TEST_WAV");
  }
  if (!wavPath)
  {
    std::fprintf(stderr,
                 "usage: %s --wav FILE [--start S] [--sec S] [--out FILE] [--no-out] [--json]\n",
                 argv[0]);
    return 1;
  }

  Wav wav;
  if (!readWavMono(wavPath, wav))
  {
    std::fprintf(stderr, "failed to read %s\n", wavPath);
    return 1;
  }

  Config cfg;
  std::vector<float> rendered;
  const auto results = renderAndVerify(wav, startSec, durSec, cfg, rendered, outWav);

  int fail = 0;
  int dryLeak = 0;
  int voiced = 0;
  for (const auto& wr : results)
  {
    ++voiced;
    if (!wr.octaveOk)
      ++fail;
    if (wr.dryLeak)
      ++dryLeak;
    if (!json)
    {
      std::printf("%6.2fs in=%5.0f out=%5.0f ratio=%.3f outDb=%.1f %s%s\n", wr.t, wr.f0In, wr.f0Out,
                  wr.ratio, wr.outRmsDb, wr.octaveOk ? "OK" : "FAIL",
                  wr.dryLeak ? " DRY_LEAK" : "");
    }
  }

  if (json)
  {
    std::printf("{\"voiced_windows\":%d,\"fail\":%d,\"dry_leak\":%d,\"out_wav\":\"%s\"}\n", voiced,
                fail, dryLeak, outWav ? outWav : "");
  }
  const bool pass = voiced > 10 && dryLeak == 0 && fail * 3 <= voiced * 2; // ≤~66% fail OK if no dry leak
  if (!json)
  {
    std::printf("\n# voiced=%d fail=%d dry_leak=%d (ratio should be ~0.5, not ~1.0)\n", voiced,
                fail, dryLeak);
    if (outWav)
      std::printf("# wrote %s\n", outWav);
    std::printf("regression: %s\n", pass ? "PASS" : "FAIL");
  }

  return pass ? 0 : 2;
}
