// Offline Octaver hop diagnostics — same pitch law + PSOLA as the live plugin.
// Writes /tmp/octaver_offline_diag.log (same columns as CALFNXT_OCTAVER_DIAG)
// and FAILS when F0 hops without a matching raw-YIN move (or freezes / dry-leaks).
//
//   ./tools/run_octaver_hop_diag.sh --wav TAKE.wav
//   g++ -O2 -std=c++17 -I common/dsp tools/octaver_hop_diag.cpp -o /tmp/octaver_hop_diag -lm

#include "octaver_pitch_law.h"
#include "psola_shifter.h"
#include "yin_detector.h"

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
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

struct HopRow
{
  float t = 0.f;
  float gate = 0.f;
  float rawF0 = 0.f;
  float f0 = 0.f;
  float lastF0 = 0.f;
  float conf = 0.f;
  float period = 0.f;
  float pSm = 0.f;
  float mix = 0.f;
  int grains = 0;
  int path = 0;
  float m1Db = -120.f;
  float detRms = -120.f;
  float flat = 0.f;
  int octSus = 0;
  int bow = 0;
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
  out.samples.resize(size_t(nSamp));
  std::fseek(f, dataPos, SEEK_SET);
  if (fmt == 3)
    std::fread(out.samples.data(), 4, size_t(nSamp), f);
  else
  {
    std::vector<int16_t> tmp(size_t(nSamp), int16_t(0));
    std::fread(tmp.data(), 2, size_t(nSamp), f);
    for (int i = 0; i < nSamp; ++i)
      out.samples[size_t(i)] = tmp[size_t(i)] / 32768.f;
  }
  std::fclose(f);
  if (ch > 1)
  {
    std::vector<float> mono((nSamp + ch - 1) / ch);
    for (size_t i = 0; i < mono.size(); ++i)
    {
      double s = 0.0;
      for (int c = 0; c < ch; ++c)
        s += out.samples[i * size_t(ch) + size_t(c)];
      mono[i] = float(s / ch);
    }
    out.samples = std::move(mono);
  }
  return true;
}

int nextPow2(int v)
{
  int n = 1;
  while (n < v)
    n <<= 1;
  return n;
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
                calfNXT::Dsp::YinDetector& yin, bool& voiced)
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
  f0 = yin.preferFundamentalOverSubharmonic(f0, sr, fmax, yinSrc);
  return f0;
}

} // namespace

int main(int argc, char** argv)
{
  using namespace calfNXT::Dsp;

  const char* wavPath = nullptr;
  const char* logPath = "/tmp/octaver_offline_diag.log";
  float startSec = 30.f;
  float durSec = 60.f;

  for (int i = 1; i < argc; ++i)
  {
    if (!std::strcmp(argv[i], "--wav") && i + 1 < argc)
      wavPath = argv[++i];
    else if (!std::strcmp(argv[i], "--log") && i + 1 < argc)
      logPath = argv[++i];
    else if (!std::strcmp(argv[i], "--start") && i + 1 < argc)
      startSec = float(std::atof(argv[++i]));
    else if (!std::strcmp(argv[i], "--sec") && i + 1 < argc)
      durSec = float(std::atof(argv[++i]));
  }
  if (!wavPath)
    wavPath = std::getenv("CALFNXT_OCTAVER_TEST_WAV");
  if (!wavPath)
  {
    std::fprintf(stderr, "usage: %s --wav FILE [--start S] [--sec S] [--log FILE]\n", argv[0]);
    return 1;
  }

  Wav wav;
  if (!readWavMono(wavPath, wav))
  {
    std::fprintf(stderr, "failed to read %s\n", wavPath);
    return 1;
  }

  // Cello UI defaults (must match live test setup).
  const float quality = 0.8f;
  const float octaveProtect = 0.88f;
  const float unvoiced = 0.45f;
  const float fmin = 55.f;
  const float fmax = 700.f;
  const float gateDb = -48.f;
  const float attackMs = 8.f;
  const float glideMs = 40.f;
  const float m1Formant = 0.9f;
  const float m1Tone = 0.45f;
  const int detect = 0;
  const int yinSource = 1;

  const int i0 = std::clamp(int(startSec * wav.sr), 0, int(wav.samples.size()) - 1);
  const int i1 = std::clamp(i0 + int(durSec * wav.sr), i0 + 1, int(wav.samples.size()));
  const int n = i1 - i0;
  const float* in = wav.samples.data() + i0;
  const float sr = float(wav.sr);

  int dec = 1;
  while (wav.sr / double(dec) > 48000.01)
    dec <<= 1;
  const float detectSr = sr / float(dec);
  const float winSec = 0.024f + 0.068f * quality;
  int win = nextPow2(std::max(256, int(detectSr * winSec)));
  win = std::clamp(win, 1024, YinDetector::kMaxWin);
  const int maxPeriod = std::max(64, int(sr / fmin));
  const int latency = std::clamp((win * dec) / 2 + maxPeriod + 32, 128, LinkedPsola::kSize / 4);
  const int hopSize = std::max(64, int(sr * 0.008f));

  LinkedPsola psola;
  YinDetector yin;
  ToneLp tone;
  OctaverPitchState pitch;
  psola.reset();
  yin.reset();
  pitch.reset();

  OctaverPitchParams pp;
  pp.octaveProtect = octaveProtect;
  pp.gateDb = gateDb;
  pp.glideCoeff = 1.f - std::exp(-1.f / std::max(1.f, glideMs * 0.001f * sr));
  pp.fmin = fmin;
  pp.fmax = fmax;
  pp.yinSource = yinSource;

  const float attackSec = std::max(3.f, attackMs) * 0.001f;
  psola.setMixSlew(attackSec, std::max(0.006f, attackSec * 0.35f), sr);
  const float attackCoeff = 1.f - std::exp(-1.f / std::max(1.f, attackSec * sr));

  float yinBuf[YinDetector::kMaxWin] {};
  int hopCount = 0;
  float wetGateSm = 0.f;
  std::vector<float> rendered(size_t(n), 0.f);
  std::vector<HopRow> hops;
  hops.reserve(size_t(n / hopSize) + 8);

  FILE* log = std::fopen(logPath, "w");
  if (log)
  {
    std::fprintf(log,
                 "# calfnxt octaver offline diag  sr=%.1f cello defaults\n"
                 "# t gate rawF0 f0 lastF0 conf period pSm mix grains path "
                 "m1Db detRms flat octSus bow\n"
                 "# path: 0=off 1=bow 2=cold 3=leapAccept 4=leapHold 5=glide 6=scrape 7=bowHold\n",
                 sr);
  }

  double m1Acc = 0.0;
  int m1N = 0;

  for (int i = 0; i < n; ++i)
  {
    const float L = in[i];
    psola.write(L, L);

    if (++hopCount >= hopSize)
    {
      hopCount = 0;
      copyYinWindow(psola, yinBuf, win, dec, latency, detect);
      float rms = 0.f;
      for (int k = 0; k < win; ++k)
        rms += yinBuf[k] * yinBuf[k];
      rms = std::sqrt(rms / float(std::max(1, win)));
      const float detectRmsDb = linToDb(std::max(rms, 1.0e-9f));

      const auto yinRes =
        yin.analyze(yinBuf, win, detectSr, fmin, fmax, unvoiced, yinSource, 0.55f);
      const auto hop = octaverPitchHop(pitch, yin, pp, sr, detectSr, yinRes.f0Hz, yinRes.confidence,
                                       yinRes.flatness, yinRes.voiced, yinRes.periodic,
                                       yinRes.octaveSuspect, detectRmsDb);
      if (hop.applySnap)
      {
        if (hop.hardSnap)
          psola.relockPeriod(hop.period, 0.5f);
        else
          psola.nudgePeriod(hop.period);
      }
      if (hop.gate > 0.5f && (hop.periodHopSnap || hop.prevWetGate <= 0.5f))
      {
        wetGateSm = 1.f;
        psola.bootstrapMix();
      }

      const float m1Rms =
        m1N > 0 ? linToDb(float(std::sqrt(m1Acc / double(m1N)))) : -120.f;
      m1Acc = 0.0;
      m1N = 0;

      HopRow row;
      row.t = startSec + float(i) / sr;
      row.gate = hop.gate;
      row.rawF0 = hop.rawF0;
      row.f0 = hop.f0;
      row.lastF0 = pitch.lastF0;
      row.conf = hop.confidence;
      row.period = pitch.lastGoodPeriod > 16.f ? pitch.lastGoodPeriod : hop.period;
      row.pSm = psola.trackedPeriod();
      row.mix = psola.wetMix();
      row.grains = psola.grainCount();
      row.path = hop.pathCode;
      row.m1Db = m1Rms;
      row.detRms = pitch.detectRmsDb;
      row.flat = hop.flatness;
      row.octSus = hop.octaveSuspect ? 1 : 0;
      row.bow = hop.bowHoldActive ? 1 : 0;
      hops.push_back(row);

      if (log)
      {
        std::fprintf(log,
                     "%.3f %.0f %.1f %.1f %.1f %.2f %.1f %.1f %.2f %d %d %.1f %.1f %.2f %d %d\n",
                     row.t, row.gate, row.rawF0, row.f0, row.lastF0, row.conf, row.period, row.pSm,
                     row.mix, row.grains, row.path, row.m1Db, row.detRms, row.flat, row.octSus,
                     row.bow);
      }
    }

    const float hopT = hopSize > 1 ? float(hopCount) / float(hopSize) : 1.f;
    const float period = octaverPsolaPeriod(pitch, hopT);
    if (pitch.wetGate > 0.5f)
      wetGateSm = 1.f;
    else
      wetGateSm += (pitch.wetGate - wetGateSm) * attackCoeff;
    psola.setWetGate(wetGateSm);

    float wL = 0.f, wR = 0.f, dL = 0.f, dR = 0.f;
    psola.process(period, 0.5f, m1Formant, latency, wL, wR, dL, dR);
    const float diff = wL - dL;
    m1Acc += double(diff) * double(diff);
    ++m1N;
    rendered[size_t(i)] = tone.process(diff, m1Tone, sr);
  }
  if (log)
    std::fclose(log);

  // --- scoring ---
  int unexplainedJumps = 0;
  int freezes = 0;
  int mismatch = 0;
  int dryLeak = 0;
  int voicedWindows = 0;
  int pitchFail = 0;

  for (size_t i = 1; i < hops.size(); ++i)
  {
    const auto& a = hops[i - 1];
    const auto& b = hops[i];
    if (b.gate > 0.5f && b.pSm > 24.f)
    {
      const float rel = std::fabs(b.period - b.pSm) / b.pSm;
      if (rel > 0.10f)
        ++mismatch;
    }
    if (a.lastF0 < 20.f || b.lastF0 < 20.f)
      continue;
    const float lastRel = b.lastF0 / a.lastF0;
    if (lastRel > 1.20f || lastRel < 1.f / 1.20f)
    {
      // Unexplained = accepted path moved lastF0 a lot while raw YIN barely moved.
      float rawRel = 1.f;
      if (a.rawF0 > 20.f && b.rawF0 > 20.f)
        rawRel = b.rawF0 / a.rawF0;
      const bool rawStable = rawRel < 1.08f && rawRel > 1.f / 1.08f;
      const bool acceptedPath = b.path == 3 || b.path == 5 || b.path == 2;
      if (rawStable && acceptedPath)
        ++unexplainedJumps;
    }
  }

  // Freeze: lastF0 flat > 1s while rawF0 moves > 15%.
  const int freezeHops = std::max(1, int(1.0f / 0.008f));
  for (size_t i = 0; i + size_t(freezeHops) < hops.size(); ++i)
  {
    if (hops[i].lastF0 < 20.f)
      continue;
    bool flatLast = true;
    float rawMin = hops[i].rawF0, rawMax = hops[i].rawF0;
    for (int k = 0; k < freezeHops; ++k)
    {
      const auto& h = hops[i + size_t(k)];
      if (std::fabs(h.lastF0 - hops[i].lastF0) > 0.5f)
      {
        flatLast = false;
        break;
      }
      if (h.rawF0 > 20.f)
      {
        rawMin = std::min(rawMin, h.rawF0);
        rawMax = std::max(rawMax, h.rawF0);
      }
    }
    if (flatLast && rawMin > 20.f && rawMax / rawMin > 1.15f)
      ++freezes;
  }

  // Output pitch verify every 100 ms (m1 only).
  YinDetector yinMeasure;
  const int winSamples = std::max(4096, int(sr * 0.1f));
  for (int pos = winSamples; pos < n; pos += winSamples)
  {
    const float inDb = [&] {
      double acc = 0.0;
      for (int k = 0; k < winSamples; ++k)
        acc += double(in[pos - winSamples + k]) * double(in[pos - winSamples + k]);
      return linToDb(float(std::sqrt(acc / double(winSamples))));
    }();
    const float outDb = [&] {
      double acc = 0.0;
      for (int k = 0; k < winSamples; ++k)
      {
        const float x = rendered[size_t(pos - winSamples + k)];
        acc += double(x) * double(x);
      }
      return linToDb(float(std::sqrt(acc / double(winSamples))));
    }();
    if (inDb < gateDb || outDb < gateDb + 6.f)
      continue;
    bool inV = false, outV = false;
    const float fIn =
      measureF0(in + pos - winSamples, winSamples, sr, fmin, fmax, yinSource, yinMeasure, inV);
    const float fOut = measureF0(rendered.data() + pos - winSamples, winSamples, sr, fmin * 0.5f,
                                 std::max(40.f, fIn * 0.72f), yinSource, yinMeasure, outV);
    if (!inV || !outV || fIn < 20.f || fOut < 20.f)
      continue;
    float outF = fOut;
    const float target = fIn * 0.5f;
    if (std::fabs(outF * 0.5f - target) < std::fabs(outF - target) * 0.85f)
      outF *= 0.5f;
    ++voicedWindows;
    const float ratio = outF / fIn;
    if (ratio > 0.82f)
      ++dryLeak;
    if (std::fabs(ratio - 0.5f) / 0.5f > 0.18f)
      ++pitchFail;
  }

  // Problem windows (user-reported).
  auto countUnexplainedIn = [&](float a, float b) {
    int c = 0;
    for (size_t i = 1; i < hops.size(); ++i)
    {
      if (hops[i].t < a || hops[i].t > b)
        continue;
      const auto& x = hops[i - 1];
      const auto& y = hops[i];
      if (x.lastF0 < 20.f || y.lastF0 < 20.f)
        continue;
      const float lastRel = y.lastF0 / x.lastF0;
      if (!(lastRel > 1.20f || lastRel < 1.f / 1.20f))
        continue;
      float rawRel = 1.f;
      if (x.rawF0 > 20.f && y.rawF0 > 20.f)
        rawRel = y.rawF0 / x.rawF0;
      if (rawRel < 1.08f && rawRel > 1.f / 1.08f && (y.path == 3 || y.path == 5 || y.path == 2))
        ++c;
    }
    return c;
  };
  const int jump4143 = countUnexplainedIn(41.f, 43.f);
  const int jump5761 = countUnexplainedIn(57.f, 61.f);

  std::printf("hop_diag: hops=%zu unexplained_jumps=%d freezes=%d period_mismatch=%d\n",
              hops.size(), unexplainedJumps, freezes, mismatch);
  std::printf("hop_diag: windows jump41-43=%d jump57-61=%d\n", jump4143, jump5761);
  std::printf("hop_diag: pitch voiced=%d fail=%d dry_leak=%d\n", voicedWindows, pitchFail, dryLeak);
  std::printf("hop_diag: log → %s\n", logPath);

  // Gate: any dry leak, any freeze streak, unexplained jumps in known windows,
  // or >2% of hops with unexplained jumps, or period mismatch storms.
  const bool pass = dryLeak == 0 && freezes == 0 && jump4143 == 0 && jump5761 == 0 &&
                    unexplainedJumps * 50 <= int(hops.size()) && mismatch * 20 <= int(hops.size()) &&
                    voicedWindows > 10 && pitchFail * 3 <= voicedWindows * 2;
  std::printf("hop_diag: %s\n", pass ? "PASS" : "FAIL");
  return pass ? 0 : 2;
}
