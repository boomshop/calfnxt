// Offline Tuner PSOLA click probe.
// Builds a synthetic voiced signal (or loads mono/stereo WAV), runs the same
// Yin → PitchCorrector → LinkedPsola path as the plugin, and scores
// impulsive second-differences on the residual (wet − delayed dry).
//
//   g++ -O2 -std=c++17 -I common/dsp tools/tuner_click_test.cpp -o /tmp/tuner_click_test -lm
//   /tmp/tuner_click_test
//   /tmp/tuner_click_test --wav /path/to/take.wav --out /tmp/tuner_out.wav
//
 // Regression history (JSONL append + compare vs previous / best):
//   /tmp/tuner_click_test --label wetgate-v1 --history tools/tuner_click_history.jsonl
//   /tmp/tuner_click_test --only-wav --wav TAKE --label wetgate-v1 \
//       --history tools/tuner_click_history.jsonl
//
// "nearSnap" hits coincide with reattack snapPeriod — expected at new
// syllables. Clean harmonic glides should score ~0.

#include "pitch_correct.h"
#include "psola_shifter.h"
#include "yin_detector.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

namespace {

constexpr float kSr = 48000.f;
constexpr int kHopMs = 8;
constexpr int kHistWin = 2048;

struct Wav
{
  std::vector<float> samples;
  int sr = 48000;
};

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
  uint32_t sr = 0, dataBytes = 0;
  bool haveFmt = false, haveData = false;
  long dataPos = 0;
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
      uint32_t br = 0;
      uint16_t ba = 0;
      std::fread(&br, 4, 1, f);
      std::fread(&ba, 2, 1, f);
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
  std::fseek(f, dataPos, SEEK_SET);
  const int frames = int(dataBytes / (ch * (bps / 8)));
  out.sr = int(sr);
  out.samples.resize(size_t(frames));
  for (int i = 0; i < frames; ++i)
  {
    float acc = 0.f;
    for (int c = 0; c < ch; ++c)
    {
      float s = 0.f;
      if (fmt == 1 && bps == 16)
      {
        int16_t v = 0;
        std::fread(&v, 2, 1, f);
        s = float(v) / 32768.f;
      }
      else if (fmt == 1 && bps == 24)
      {
        unsigned char b[3];
        std::fread(b, 1, 3, f);
        int32_t v = (int32_t(b[2]) << 16) | (int32_t(b[1]) << 8) | b[0];
        if (v & 0x800000)
          v |= ~0xffffff;
        s = float(v) / 8388608.f;
      }
      else if (fmt == 3 && bps == 32)
      {
        std::fread(&s, 4, 1, f);
      }
      else
      {
        std::fclose(f);
        return false;
      }
      acc += s;
    }
    out.samples[size_t(i)] = acc / float(ch);
  }
  std::fclose(f);
  return true;
}

/** Harmonic pulse (voiced) with continuous F0 trajectory. */
std::vector<float> synthGlide(float sr, float sec, float f0a, float f0b, float pauseAt = -1.f,
                              float pauseSec = 0.f)
{
  const int n = int(sr * sec);
  std::vector<float> x(size_t(n), 0.f);
  double phase = 0.0;
  for (int i = 0; i < n; ++i)
  {
    const float t = float(i) / sr;
    bool silent = pauseAt >= 0.f && t >= pauseAt && t < pauseAt + pauseSec;
    float f0 = f0a + (f0b - f0a) * std::clamp(t / sec, 0.f, 1.f);
    if (silent)
    {
      x[size_t(i)] = 0.f;
      continue;
    }
    phase += double(f0) / double(sr);
    phase -= std::floor(phase);
    // 4 harmonics, falling amplitude — enough for YIN, not a pure sine.
    float s = 0.f;
    for (int h = 1; h <= 4; ++h)
    {
      const float a = 1.f / float(h);
      s += a * std::sin(2.f * float(M_PI) * float(phase) * float(h));
    }
    // Soft attack/release so synth edges are not the clicks we measure.
    float env = 1.f;
    if (t < 0.02f)
      env = t / 0.02f;
    if (t > sec - 0.02f)
      env = (sec - t) / 0.02f;
    if (pauseAt >= 0.f)
    {
      if (t < pauseAt && t > pauseAt - 0.01f)
        env *= (pauseAt - t) / 0.01f;
      if (t >= pauseAt + pauseSec && t < pauseAt + pauseSec + 0.01f)
        env *= (t - (pauseAt + pauseSec)) / 0.01f;
    }
    x[size_t(i)] = 0.22f * s * std::max(0.f, env);
  }
  return x;
}

int nextPow2(int v)
{
  int n = 1;
  while (n < v)
    n <<= 1;
  return n;
}

struct ClickHit
{
  int sample = 0;
  float score = 0.f;
  float wet = 0.f;
  float dry = 0.f;
  float residual = 0.f;
  bool nearSnap = false;
  bool nearGate = false;
  bool nearPeriodJump = false;
  bool isPlop = false;
};

struct OctEvent
{
  float t = 0.f;
  float f0 = 0.f;
  float prev = 0.f;
  bool held = false;
};

struct RunResult
{
  std::vector<float> wet;
  std::vector<float> dry;
  std::vector<float> residual;
  std::vector<ClickHit> hits;     // HF click-like (2nd diff)
  std::vector<ClickHit> plops;    // LF thump / crossfade plop
  std::vector<float> snapTimes;
  std::vector<float> gateTimes;   // wetGate 0↔1 edges
  std::vector<float> periodJumpTimes; // |Δperiod| > 8% while wet
  std::vector<OctEvent> octEvents;
  int snaps = 0;
  int octaveFlags = 0;
  int gateEdges = 0;
  int periodJumps = 0;
  float peakClick = 0.f;
  float peakResidualClick = 0.f;
  float peakPlop = 0.f;
  float gatePlopMean = 0.f;
  float gatePlopP95 = 0.f;
  int gatePlopAudible = 0; // gate edges with plopScore >= soft thresh
};

RunResult processTuner(const float* in, int n, float sr, float fmin, float fmax, float amount,
                       float flexCents = 120.f, float retuneMs = 40.f, uint16_t noteMask = 0x0fff,
                       float octaveProtect = 0.8f)
{
  using namespace calfNXT::Dsp;
  LinkedPsola psola;
  YinDetector yin;
  PitchCorrector corrector;
  psola.reset();
  yin.reset();
  corrector.reset();

  const int hopSize = std::max(64, int(sr * 0.008f));
  const int win = std::clamp(nextPow2(int(sr * 0.06f)), 1024, YinDetector::kMaxWin);
  const int maxPeriod = std::max(64, int(sr / std::clamp(fmin, 25.f, 400.f)));
  const int latency = std::clamp(win / 2 + maxPeriod + 32, 128, LinkedPsola::kSize / 4);

  PitchCorrector::Params cp;
  cp.source = 0;
  cp.retuneMs = retuneMs;
  cp.releaseMs = 120.f;
  cp.amount = amount;
  cp.thresholdCents = 10.f;
  cp.flexCents = flexCents;
  cp.vibratoPreserve = 0.75f;
  cp.settle = 0.f;
  cp.vibOn = false;
  cp.octaveProtect = octaveProtect;
  cp.refHz = 440.f;
  cp.noteMask = noteMask ? noteMask : uint16_t(0x0fff);

  float yinBuf[YinDetector::kMaxWin] {};
  int hopCount = 0;
  float hopRatioFrom = 1.f, hopRatioTo = 1.f;
  float hopPeriodFrom = 200.f, hopPeriodTo = 200.f;
  float lastGoodPeriod = 0.f;
  float lastDetectPeriod = 0.f;
  int duckHops = 0;
  int leapHold = 0;
  int dryHops = 0;
  float prevGate = -1.f;

  RunResult rr;
  rr.wet.resize(size_t(n));
  rr.dry.resize(size_t(n));
  rr.residual.resize(size_t(n));

  for (int i = 0; i < n; ++i)
  {
    const float L = in[i];
    psola.write(L, L);

    if (++hopCount >= hopSize)
    {
      hopCount = 0;
      const int half = win / 2;
      for (int k = 0; k < win; ++k)
      {
        const int delay = latency + half - k;
        yinBuf[k] = psola.peekDetect(delay, 0);
      }
      const auto y = yin.analyze(yinBuf, win, sr, fmin, fmax, 0.5f, 0);
      const float f0 = y.f0Hz;
      const bool rawVoiced = y.periodic && y.confidence >= 0.28f && y.flatness < 0.42f;
      if (y.octaveSuspect || (lastDetectPeriod > 16.f && f0 > 1.f &&
                              (sr / f0) / lastDetectPeriod > 1.7f) ||
          (lastDetectPeriod > 16.f && f0 > 1.f &&
           lastDetectPeriod / (sr / f0) > 1.7f))
      {
        OctEvent e;
        e.t = float(i) / sr;
        e.f0 = f0;
        e.prev = lastDetectPeriod > 16.f ? sr / lastDetectPeriod : 0.f;
        e.held = y.octaveSuspect && std::fabs(f0 - e.prev) < 1.f;
        rr.octEvents.push_back(e);
      }
      if (f0 > 1.f)
        lastDetectPeriod = sr / f0;
      const float hopSec = float(hopSize) / sr;
      corrector.update(f0, y.confidence, y.voiced, y.octaveSuspect, hopSec, cp);

      hopRatioFrom = hopRatioTo;
      hopRatioTo = corrector.last().ratio;
      hopPeriodFrom = hopPeriodTo;
      const auto& corHop = corrector.last();
      float period = hopPeriodTo;
      float gate = 0.f;
      if (rawVoiced && corHop.voiced && f0 > 1.f)
      {
        const float pNew = sr / f0;
        const bool reentry = dryHops >= 2;
        if (corHop.reattack || !(hopPeriodTo > 16.f) || reentry)
        {
          hopPeriodFrom = pNew;
          period = pNew;
          lastGoodPeriod = pNew;
          leapHold = 0;
          duckHops = 4;
          psola.snapPeriod(pNew);
          ++rr.snaps;
          rr.snapTimes.push_back(float(i) / sr);
        }
        else
        {
          const float rel = pNew / std::max(16.f, hopPeriodTo);
          if (rel > 1.7f || rel < (1.f / 1.7f))
          {
            period = lastGoodPeriod > 16.f ? lastGoodPeriod : hopPeriodTo;
            ++leapHold;
            duckHops = std::max(duckHops, 1);
            if (leapHold >= 5)
            {
              hopPeriodFrom = pNew;
              period = pNew;
              lastGoodPeriod = pNew;
              leapHold = 0;
              duckHops = 3;
              psola.snapPeriod(pNew);
              ++rr.snaps;
              rr.snapTimes.push_back(float(i) / sr);
            }
          }
          else
          {
            leapHold = 0;
            if (rel > 0.82f && rel < 1.22f)
            {
              period = pNew;
              lastGoodPeriod = pNew;
            }
            else
            {
              period = hopPeriodTo + (pNew - hopPeriodTo) * 0.35f;
              lastGoodPeriod = period;
            }
            if (std::fabs(rel - 1.f) > 0.08f)
            {
              ++rr.periodJumps;
              rr.periodJumpTimes.push_back(float(i) / sr);
            }
          }
        }
        dryHops = 0;
        if (duckHops > 0)
        {
          --duckHops;
          gate = 0.f;
        }
        else
          gate = 1.f;
      }
      else
      {
        leapHold = 0;
        duckHops = 0;
        ++dryHops;
        gate = 0.f;
      }
      hopPeriodTo = std::max(16.f, period);
      if (prevGate >= 0.f && ((prevGate < 0.5f) != (gate < 0.5f)))
      {
        ++rr.gateEdges;
        rr.gateTimes.push_back(float(i) / sr);
      }
      prevGate = gate;
      psola.setWetGate(gate);
      if (corHop.octaveSuspect)
        ++rr.octaveFlags;
    }

    const auto& cor = corrector.last();
    const float hopT = hopSize > 1 ? float(hopCount) / float(hopSize) : 1.f;
    const float ratio = hopRatioFrom + (hopRatioTo - hopRatioFrom) * hopT;
    const float period = hopPeriodFrom + (hopPeriodTo - hopPeriodFrom) * hopT;
    float wetL = 0.f, wetR = 0.f, dryL = 0.f, dryR = 0.f;
    psola.process(period, ratio, 0.85f, latency, wetL, wetR, dryL, dryR);
    rr.wet[size_t(i)] = wetL * cor.tremolo;
    rr.dry[size_t(i)] = dryL;
    rr.residual[size_t(i)] = rr.wet[size_t(i)] - dryL;
  }

  // Click score on residual only (wet − delayed dry): source transients cancel.
  const int skip = latency + int(sr * 0.05f);
  const int winEnv = int(sr * 0.01f);
  std::vector<float> score(size_t(n), 0.f);
  for (int i = 2; i < n; ++i)
  {
    const float r0 = rr.residual[size_t(i)];
    const float r1 = rr.residual[size_t(i - 1)];
    const float r2 = rr.residual[size_t(i - 2)];
    const float d2 = std::fabs(r0 - 2.f * r1 + r2);
    int a = std::max(0, i - winEnv);
    int b = std::min(n, i + winEnv);
    float e = 0.f;
    for (int k = a; k < b; ++k)
    {
      const float w = rr.wet[size_t(k)];
      e += w * w;
    }
    e = std::sqrt(e / float(std::max(1, b - a))) + 1.0e-4f;
    // Ignore silence-normalized spikes (tiny d2 / tiny RMS → huge score).
    // Require a meaningful absolute discontinuity too.
    if (d2 < 0.025f || std::fabs(r0) + std::fabs(r1) + std::fabs(r2) < 0.04f)
      score[size_t(i)] = 0.f;
    else
      score[size_t(i)] = d2 / e;
    if (i >= skip)
    {
      rr.peakClick = std::max(rr.peakClick, score[size_t(i)]);
      rr.peakResidualClick = rr.peakClick;
    }
  }

  auto tagNear = [&](ClickHit& h) {
    const float t = float(h.sample) / sr;
    for (float st : rr.snapTimes)
    {
      if (std::fabs(st - t) < 0.04f)
      {
        h.nearSnap = true;
        break;
      }
    }
    for (float gt : rr.gateTimes)
    {
      if (std::fabs(gt - t) < 0.05f)
      {
        h.nearGate = true;
        break;
      }
    }
    for (float pt : rr.periodJumpTimes)
    {
      if (std::fabs(pt - t) < 0.04f)
      {
        h.nearPeriodJump = true;
        break;
      }
    }
  };

  // Non-max suppression: keep local peaks above threshold.
  constexpr float kThresh = 0.35f;
  for (int i = skip + 2; i < n - 2; ++i)
  {
    const float s = score[size_t(i)];
    if (s < kThresh)
      continue;
    if (s >= score[size_t(i - 1)] && s >= score[size_t(i + 1)] && s >= score[size_t(i - 2)] &&
        s >= score[size_t(i + 2)])
    {
      ClickHit h;
      h.sample = i;
      h.score = s;
      h.wet = rr.wet[size_t(i)];
      h.dry = rr.dry[size_t(i)];
      h.residual = rr.residual[size_t(i)];
      tagNear(h);
      rr.hits.push_back(h);
      i += int(sr * 0.005f); // 5 ms dead time
    }
  }
  std::sort(rr.hits.begin(), rr.hits.end(),
            [](const ClickHit& a, const ClickHit& b) { return a.score > b.score; });

  // ---- Plop detector: LF thump in residual (crossfade / re-entry), not HF click ----
  // 1) ~120 Hz LP on residual  2) |Δ| of a ~8 ms envelope of that LP.
  {
    const float aLp = 1.f - std::exp(-2.f * float(M_PI) * 120.f / sr);
    const int wPlop = std::max(8, int(sr * 0.008f));
    std::vector<float> lp(size_t(n), 0.f);
    float s = 0.f;
    for (int i = 0; i < n; ++i)
    {
      s += aLp * (rr.residual[size_t(i)] - s);
      lp[size_t(i)] = s;
    }
    std::vector<float> env(size_t(n), 0.f);
    double acc = 0.0;
    for (int i = 0; i < n; ++i)
    {
      const float v = std::fabs(lp[size_t(i)]);
      acc += double(v);
      if (i >= wPlop)
        acc -= double(std::fabs(lp[size_t(i - wPlop)]));
      const int den = i < wPlop ? (i + 1) : wPlop;
      env[size_t(i)] = float(acc / double(den));
    }
    std::vector<float> plopScore(size_t(n), 0.f);
    const int dSamp = std::max(4, int(sr * 0.003f)); // ~3 ms step
    for (int i = skip + dSamp; i < n; ++i)
    {
      const float step = std::fabs(env[size_t(i)] - env[size_t(i - dSamp)]);
      int a = std::max(0, i - winEnv);
      int b = std::min(n, i + winEnv);
      float e = 0.f;
      for (int k = a; k < b; ++k)
      {
        const float w = rr.wet[size_t(k)];
        e += w * w;
      }
      e = std::sqrt(e / float(std::max(1, b - a))) + 1.0e-4f;
      // Absolute LF step must be audible; ignore hush.
      if (step < 0.008f || e < 0.02f)
        plopScore[size_t(i)] = 0.f;
      else
        plopScore[size_t(i)] = step / e;
      rr.peakPlop = std::max(rr.peakPlop, plopScore[size_t(i)]);
    }
    constexpr float kPlopThresh = 0.08f; // softer: audible "plop", not only thumps
    for (int i = skip + dSamp + 2; i < n - 2; ++i)
    {
      const float p = plopScore[size_t(i)];
      if (p < kPlopThresh)
        continue;
      if (p >= plopScore[size_t(i - 1)] && p >= plopScore[size_t(i + 1)] &&
          p >= plopScore[size_t(i - 2)] && p >= plopScore[size_t(i + 2)])
      {
        ClickHit h;
        h.sample = i;
        h.score = p;
        h.wet = rr.wet[size_t(i)];
        h.dry = rr.dry[size_t(i)];
        h.residual = rr.residual[size_t(i)];
        h.isPlop = true;
        tagNear(h);
        rr.plops.push_back(h);
        i += int(sr * 0.025f); // 25 ms dead time — plops are wider
      }
    }
    std::sort(rr.plops.begin(), rr.plops.end(),
              [](const ClickHit& a, const ClickHit& b) { return a.score > b.score; });

    // Per gate-edge plop strength (even when below global peak list).
    std::vector<float> edgeScores;
    edgeScores.reserve(rr.gateTimes.size());
    const int rad = int(sr * 0.04f);
    for (float gt : rr.gateTimes)
    {
      const int c = int(gt * sr);
      float best = 0.f;
      for (int j = std::max(skip, c - rad); j < std::min(n, c + rad); ++j)
        best = std::max(best, plopScore[size_t(j)]);
      edgeScores.push_back(best);
      if (best >= 0.06f)
        ++rr.gatePlopAudible;
    }
    if (!edgeScores.empty())
    {
      double sum = 0.0;
      for (float v : edgeScores)
        sum += double(v);
      rr.gatePlopMean = float(sum / double(edgeScores.size()));
      std::sort(edgeScores.begin(), edgeScores.end());
      const size_t ix = std::min(edgeScores.size() - 1,
                                 size_t(std::floor(0.95 * double(edgeScores.size() - 1))));
      rr.gatePlopP95 = edgeScores[ix];
    }
  }

  return rr;
}

struct CaseMetrics
{
  std::string name;
  int snaps = 0;
  int octaveFlags = 0;
  int hits = 0;
  int nearSnap = 0;
  int plops = 0;
  int plopNearGate = 0;
  int plopNearSnap = 0;
  int plopNearJump = 0;
  int gateEdges = 0;
  int gatePlopAudible = 0;
  int periodJumps = 0;
  float peak = 0.f;
  float peakPlop = 0.f;
  float topSum = 0.f; // sum of top-8 hit scores
  float plopTopSum = 0.f;
  float gatePlopMean = 0.f;
  float gatePlopP95 = 0.f;
};

CaseMetrics metricsOf(const char* name, const RunResult& rr)
{
  CaseMetrics m;
  m.name = name;
  m.snaps = rr.snaps;
  m.octaveFlags = rr.octaveFlags;
  m.hits = int(rr.hits.size());
  m.plops = int(rr.plops.size());
  m.gateEdges = rr.gateEdges;
  m.gatePlopAudible = rr.gatePlopAudible;
  m.periodJumps = rr.periodJumps;
  m.peak = rr.peakResidualClick;
  m.peakPlop = rr.peakPlop;
  m.gatePlopMean = rr.gatePlopMean;
  m.gatePlopP95 = rr.gatePlopP95;
  const size_t n = std::min<size_t>(8, rr.hits.size());
  for (size_t i = 0; i < n; ++i)
  {
    m.topSum += rr.hits[i].score;
    if (rr.hits[i].nearSnap)
      ++m.nearSnap;
  }
  for (size_t i = n; i < rr.hits.size(); ++i)
    if (rr.hits[i].nearSnap)
      ++m.nearSnap;
  const size_t np = std::min<size_t>(8, rr.plops.size());
  for (size_t i = 0; i < np; ++i)
  {
    m.plopTopSum += rr.plops[i].score;
    if (rr.plops[i].nearGate)
      ++m.plopNearGate;
    if (rr.plops[i].nearSnap)
      ++m.plopNearSnap;
    if (rr.plops[i].nearPeriodJump)
      ++m.plopNearJump;
  }
  for (size_t i = np; i < rr.plops.size(); ++i)
  {
    if (rr.plops[i].nearGate)
      ++m.plopNearGate;
    if (rr.plops[i].nearSnap)
      ++m.plopNearSnap;
    if (rr.plops[i].nearPeriodJump)
      ++m.plopNearJump;
  }
  return m;
}

/** Lower is better. Weights stress re-attack / real-take residual clicks + plops. */
float suiteScore(const std::vector<CaseMetrics>& cases)
{
  float s = 0.f;
  for (const auto& c : cases)
  {
    float wHits = 1.f, wSnap = 4.f, wPeak = 15.f, wTop = 2.f;
    float wPlop = 8.f, wPlopPeak = 40.f, wPlopTop = 6.f, wGatePlop = 12.f;
    if (c.name == "reattack_pause" || c.name == "sibilant_gap")
    {
      wHits = 40.f;
      wSnap = 20.f;
      wPeak = 80.f;
      wTop = 25.f;
      wPlop = 60.f;
      wPlopPeak = 120.f;
      wPlopTop = 40.f;
      wGatePlop = 50.f;
    }
    else if (c.name.find("wav_") == 0)
    {
      wHits = 1.f;
      wSnap = 8.f;
      wPeak = 25.f;
      wTop = 3.f;
      wPlop = 6.f;
      wPlopPeak = 35.f;
      wPlopTop = 5.f;
      wGatePlop = 10.f;
    }
    else if (c.name.find("glide_") == 0)
    {
      wHits = 2.f;
      wPeak = 40.f;
      wPlop = 15.f;
      wPlopPeak = 60.f;
    }
    s += float(c.hits) * wHits + float(c.nearSnap) * wSnap + c.peak * wPeak + c.topSum * wTop;
    s += float(c.plops) * wPlop + c.peakPlop * wPlopPeak + c.plopTopSum * wPlopTop +
         float(c.plopNearGate) * wGatePlop;
  }
  return s;
}

void report(const char* name, const RunResult& rr, float sr)
{
  const CaseMetrics m = metricsOf(name, rr);
  std::printf("\n=== %s ===\n", name);
  std::printf(
    "samples=%zu  snaps=%d  gateEdges=%d  periodJumps=%d  octaveHops=%d\n"
    "  click: peak=%.2f  hits=%d (nearSnap=%d)  top8=%.2f\n"
    "  plop:  peak=%.2f  hits=%d (nearGate=%d nearSnap=%d nearJump=%d)  top8=%.2f\n"
    "  gate→plop: audible=%d/%d  mean=%.3f  p95=%.3f\n",
    rr.wet.size(), m.snaps, m.gateEdges, m.periodJumps, m.octaveFlags, m.peak, m.hits,
    m.nearSnap, m.topSum, m.peakPlop, m.plops, m.plopNearGate, m.plopNearSnap, m.plopNearJump,
    m.plopTopSum, m.gatePlopAudible, m.gateEdges, m.gatePlopMean, m.gatePlopP95);
  const size_t show = std::min<size_t>(6, rr.hits.size());
  for (size_t i = 0; i < show; ++i)
  {
    const auto& h = rr.hits[i];
    std::printf("  click#%zu  t=%.3fs  score=%.2f  res=%.3f  %s%s\n", i + 1,
                float(h.sample) / sr, h.score, h.residual, h.nearSnap ? "SNAP " : "",
                h.nearGate ? "GATE" : "");
  }
  const size_t showP = std::min<size_t>(10, rr.plops.size());
  for (size_t i = 0; i < showP; ++i)
  {
    const auto& h = rr.plops[i];
    std::printf("  plop#%zu   t=%.3fs  score=%.2f  res=%.3f  %s%s%s\n", i + 1,
                float(h.sample) / sr, h.score, h.residual, h.nearSnap ? "SNAP " : "",
                h.nearGate ? "GATE " : "", h.nearPeriodJump ? "JUMP" : "");
  }
  if (rr.hits.empty() && rr.plops.empty())
    std::printf("  (no residual click/plop peaks above threshold)\n");
  int shown = 0;
  for (const auto& e : rr.octEvents)
  {
    if (e.t < 24.f || e.t > 32.f)
      continue;
    if (shown == 0)
      std::printf("  octave events 24–32 s:\n");
    std::printf("    t=%.3f  %.1f→%.1f Hz%s\n", e.t, e.prev, e.f0, e.held ? " (held)" : "");
    if (++shown >= 16)
      break;
  }
}

std::string jsonEscape(const std::string& s)
{
  std::string o;
  o.reserve(s.size() + 8);
  for (char c : s)
  {
    if (c == '"' || c == '\\')
      o.push_back('\\');
    o.push_back(c);
  }
  return o;
}

void appendHistory(const char* path, const char* label, const char* suite,
                   const std::vector<CaseMetrics>& cases)
{
  if (!path || !path[0])
    return;
  const float score = suiteScore(cases);
  std::ofstream f(path, std::ios::app);
  if (!f)
  {
    std::fprintf(stderr, "history: cannot write %s\n", path);
    return;
  }
  f << "{\"label\":\"" << jsonEscape(label ? label : "") << "\",\"suite\":\"" << suite
    << "\",\"score\":" << score << ",\"cases\":[";
  for (size_t i = 0; i < cases.size(); ++i)
  {
    const auto& c = cases[i];
    if (i)
      f << ',';
    f << "{\"name\":\"" << jsonEscape(c.name) << "\",\"hits\":" << c.hits
      << ",\"nearSnap\":" << c.nearSnap << ",\"peak\":" << c.peak << ",\"topSum\":" << c.topSum
      << ",\"snaps\":" << c.snaps << ",\"plops\":" << c.plops << ",\"peakPlop\":" << c.peakPlop
      << ",\"plopTopSum\":" << c.plopTopSum << ",\"plopNearGate\":" << c.plopNearGate
      << ",\"gateEdges\":" << c.gateEdges << ",\"gatePlopAudible\":" << c.gatePlopAudible
      << ",\"gatePlopMean\":" << c.gatePlopMean << ",\"gatePlopP95\":" << c.gatePlopP95 << '}';
  }
  f << "]}\n";
  std::printf("\n-- history score=%.1f  label=%s  suite=%s  → %s\n", score,
              label ? label : "(none)", suite, path);
}

struct HistRef
{
  std::string label;
  float score = 0.f;
  bool ok = false;
};

HistRef findPrevAndBest(const char* path, const char* suite, float* bestOut)
{
  HistRef prev;
  float best = 1.0e30f;
  std::string bestLabel;
  if (!path)
    return prev;
  std::ifstream f(path);
  if (!f)
    return prev;
  std::string line;
  while (std::getline(f, line))
  {
    if (line.find(std::string("\"suite\":\"") + suite + "\"") == std::string::npos)
      continue;
    const auto scPos = line.find("\"score\":");
    const auto lbPos = line.find("\"label\":\"");
    if (scPos == std::string::npos || lbPos == std::string::npos)
      continue;
    float sc = float(std::atof(line.c_str() + scPos + 8));
    size_t lb0 = lbPos + 9;
    size_t lb1 = line.find('"', lb0);
    std::string lb = lb1 == std::string::npos ? "" : line.substr(lb0, lb1 - lb0);
    prev.label = lb;
    prev.score = sc;
    prev.ok = true;
    if (sc < best)
    {
      best = sc;
      bestLabel = lb;
    }
  }
  if (bestOut && best < 1.0e29f)
    *bestOut = best;
  if (prev.ok)
    std::printf("-- vs previous [%s]: score=%.1f\n", prev.label.c_str(), prev.score);
  if (best < 1.0e29f)
    std::printf("-- best so far [%s]: score=%.1f\n", bestLabel.c_str(), best);
  return prev;
}

void compareTo(const HistRef& prev, float best, float score)
{
  if (prev.ok)
  {
    const float d = score - prev.score;
    std::printf("-- delta vs previous: %+.1f  (%s)\n", d,
                d < -0.5f ? "BETTER" : (d > 0.5f ? "WORSE" : "similar"));
  }
  if (best < 1.0e29f)
  {
    const float d = score - best;
    std::printf("-- delta vs best: %+.1f  (%s)\n", d,
                d < -0.5f ? "NEW BEST" : (d > 0.5f ? "behind best" : "near best"));
  }
}

} // namespace

int main(int argc, char** argv)
{
  const char* wavPath = nullptr;
  const char* outPath = nullptr;
  const char* label = nullptr;
  const char* historyPath = "tools/tuner_click_history.jsonl";
  bool onlyWav = false;
  bool noHistory = false;
  for (int i = 1; i < argc; ++i)
  {
    if (std::strcmp(argv[i], "--wav") == 0 && i + 1 < argc)
      wavPath = argv[++i];
    else if (std::strcmp(argv[i], "--out") == 0 && i + 1 < argc)
      outPath = argv[++i];
    else if (std::strcmp(argv[i], "--only-wav") == 0)
      onlyWav = true;
    else if (std::strcmp(argv[i], "--label") == 0 && i + 1 < argc)
      label = argv[++i];
    else if (std::strcmp(argv[i], "--history") == 0 && i + 1 < argc)
      historyPath = argv[++i];
    else if (std::strcmp(argv[i], "--no-history") == 0)
      noHistory = true;
  }

  struct Case
  {
    const char* name;
    std::vector<float> x;
    float fmin;
    float fmax;
    float amount;
    float flex = 80.f;
    float retuneMs = 80.f;
    uint16_t mask = 0x0fff;
    float octProtect = 0.8f;
  };
  std::vector<Case> cases;

  // F# major pitch-class mask (Voice preset + F# Major as for the Naddel take).
  constexpr uint16_t kFsMajor =
    (1u << 1) | (1u << 3) | (1u << 5) | (1u << 6) | (1u << 8) | (1u << 10) | (1u << 11);

  if (!onlyWav)
  {
  // Steady A4 — baseline (should be almost click-free).
  cases.push_back({"steady_440", synthGlide(kSr, 1.5f, 440.f, 440.f), 80.f, 900.f, 1.f});
  // Slow octave glide (1 s).
  cases.push_back({"glide_slow_220_440", synthGlide(kSr, 1.2f, 220.f, 440.f), 80.f, 900.f, 0.5f});
  // Fast octave glide (200 ms rising, then hold).
  {
    auto x = synthGlide(kSr, 1.0f, 220.f, 220.f);
    const int n = int(x.size());
    double phase = 0.0;
    for (int i = 0; i < n; ++i)
    {
      const float t = float(i) / kSr;
      float f0 = t < 0.2f ? 220.f + 220.f * (t / 0.2f) : 440.f;
      phase += double(f0) / double(kSr);
      phase -= std::floor(phase);
      float s = 0.f;
      for (int h = 1; h <= 4; ++h)
        s += (1.f / float(h)) * std::sin(2.f * float(M_PI) * float(phase) * float(h));
      float env = 1.f;
      if (t < 0.02f)
        env = t / 0.02f;
      if (t > 0.98f)
        env = (1.f - t) / 0.02f;
      x[size_t(i)] = 0.22f * s * env;
    }
    cases.push_back({"glide_fast_200ms", std::move(x), 80.f, 900.f, 0.5f});
  }
  // Pause then re-attack (new phrase).
  cases.push_back(
    {"reattack_pause", synthGlide(kSr, 1.5f, 330.f, 330.f, 0.6f, 0.25f), 80.f, 900.f, 1.f});
  // Tone → noisy sibilant-like gap → tone (post-/s/ plop class).
  {
    const int n = int(kSr * 1.4f);
    std::vector<float> x(size_t(n), 0.f);
    double phase = 0.0;
    for (int i = 0; i < n; ++i)
    {
      const float t = float(i) / kSr;
      float env = 1.f;
      if (t < 0.02f)
        env = t / 0.02f;
      if (t > 1.38f)
        env = (1.4f - t) / 0.02f;
      if (t >= 0.55f && t < 0.75f)
      {
        // Broadband noise burst (S / breath stand-in).
        const float nse = float(std::rand()) / float(RAND_MAX) * 2.f - 1.f;
        x[size_t(i)] = 0.12f * nse * env;
      }
      else
      {
        const float f0 = t < 0.55f ? 247.f : 277.f;
        phase += double(f0) / double(kSr);
        phase -= std::floor(phase);
        float s = 0.f;
        for (int h = 1; h <= 4; ++h)
          s += (1.f / float(h)) * std::sin(2.f * float(M_PI) * float(phase) * float(h));
        x[size_t(i)] = 0.2f * s * env;
      }
    }
    cases.push_back({"sibilant_gap", std::move(x), 80.f, 700.f, 1.f, 100.f, 80.f});
  }
  // Fast glide with HARD retune (flex off, fast retune) — shifter fights portamento.
  {
    auto x = synthGlide(kSr, 1.0f, 220.f, 220.f);
    const int n = int(x.size());
    double phase = 0.0;
    for (int i = 0; i < n; ++i)
    {
      const float t = float(i) / kSr;
      float f0 = t < 0.25f ? 220.f + 220.f * (t / 0.25f) : 440.f;
      phase += double(f0) / double(kSr);
      phase -= std::floor(phase);
      float s = 0.f;
      for (int h = 1; h <= 4; ++h)
        s += (1.f / float(h)) * std::sin(2.f * float(M_PI) * float(phase) * float(h));
      float env = 1.f;
      if (t < 0.02f)
        env = t / 0.02f;
      if (t > 0.98f)
        env = (1.f - t) / 0.02f;
      x[size_t(i)] = 0.22f * s * env;
    }
    cases.push_back({"glide_vs_hard_retune", std::move(x), 80.f, 900.f, 1.f, 0.f, 8.f});
  }
  // Zigzag glide (direction changes) — worst case for period marks.
  {
    auto x = synthGlide(kSr, 1.5f, 220.f, 220.f);
    const int n = int(x.size());
    double phase = 0.0;
    for (int i = 0; i < n; ++i)
    {
      const float t = float(i) / kSr;
      float f0 = 300.f;
      if (t < 0.4f)
        f0 = 220.f + 280.f * (t / 0.4f);
      else if (t < 0.8f)
        f0 = 500.f - 280.f * ((t - 0.4f) / 0.4f);
      else
        f0 = 220.f + 180.f * ((t - 0.8f) / 0.7f);
      phase += double(f0) / double(kSr);
      phase -= std::floor(phase);
      float s = 0.f;
      for (int h = 1; h <= 5; ++h)
        s += (1.f / float(h)) * std::sin(2.f * float(M_PI) * float(phase) * float(h));
      const float noise = 0.015f * (float(std::rand()) / float(RAND_MAX) * 2.f - 1.f);
      float env = 1.f;
      if (t < 0.02f)
        env = t / 0.02f;
      if (t > 1.48f)
        env = (1.5f - t) / 0.02f;
      x[size_t(i)] = (0.2f * s + noise) * env;
    }
    cases.push_back({"glide_zigzag_noisy", std::move(x), 80.f, 900.f, 0.85f});
  }
  cases.push_back({"hard_retune_offpitch", synthGlide(kSr, 1.2f, 455.f, 455.f), 80.f, 900.f, 1.f, 0.f,
                   8.f});
  }

  if (wavPath)
  {
    Wav w;
    if (!readWavMono(wavPath, w))
    {
      std::fprintf(stderr, "failed to read %s\n", wavPath);
      return 1;
    }
    // Resample naive if needed (drop/hold) — keep simple.
    if (std::abs(w.sr - int(kSr)) > 1)
    {
      std::vector<float> rs(size_t(w.samples.size() * kSr / float(w.sr)));
      for (size_t i = 0; i < rs.size(); ++i)
      {
        const float src = float(i) * float(w.sr) / kSr;
        const size_t j = size_t(src);
        rs[i] = j < w.samples.size() ? w.samples[j] : 0.f;
      }
      w.samples = std::move(rs);
    }
    cases.insert(cases.begin(),
                 Case{"wav_voice_Fs_maj", std::move(w.samples), 80.f, 700.f, 1.f, 100.f, 80.f,
                      kFsMajor, 0.88f});
  }

  RunResult last;
  std::vector<CaseMetrics> allMetrics;
  for (auto& c : cases)
  {
    last = processTuner(c.x.data(), int(c.x.size()), kSr, c.fmin, c.fmax, c.amount, c.flex,
                        c.retuneMs, c.mask, c.octProtect);
    report(c.name, last, kSr);
    allMetrics.push_back(metricsOf(c.name, last));
    if (outPath && (&c == &cases.front() || (wavPath && std::strcmp(c.name, "wav_input") == 0)))
    {
      writeWav16(outPath, last.wet.data(), int(last.wet.size()), int(kSr));
      std::printf("wrote %s\n", outPath);
    }
  }

  const char* suite = onlyWav ? "wav" : (wavPath ? "wav+synth" : "synth");
  const float score = suiteScore(allMetrics);
  if (!noHistory)
  {
    float best = 1.0e30f;
    const HistRef prev = findPrevAndBest(historyPath, suite, &best);
    appendHistory(historyPath, label ? label : "unlabeled", suite, allMetrics);
    compareTo(prev, best, score);
  }
  else
    std::printf("\n-- suite score=%.1f (%s, not recorded)\n", score, suite);

  // Also dump the worst synthetic case wet for listening.
  if (!outPath)
  {
    writeWav16("/tmp/tuner_click_glide_fast.wav", last.wet.data(), int(last.wet.size()),
               int(kSr));
    // Re-run fast glide specifically for out.
    for (auto& c : cases)
    {
      if (std::strcmp(c.name, "glide_fast_200ms") == 0)
      {
        auto r = processTuner(c.x.data(), int(c.x.size()), kSr, c.fmin, c.fmax, c.amount, c.flex,
                              c.retuneMs, c.mask, c.octProtect);
        writeWav16("/tmp/tuner_click_glide_fast.wav", r.wet.data(), int(r.wet.size()),
                   int(kSr));
        writeWav16("/tmp/tuner_click_glide_fast_dry.wav", r.dry.data(), int(r.dry.size()),
                   int(kSr));
        writeWav16("/tmp/tuner_click_glide_fast_res.wav", r.residual.data(),
                   int(r.residual.size()), int(kSr));
        break;
      }
    }
  }

  return 0;
}
