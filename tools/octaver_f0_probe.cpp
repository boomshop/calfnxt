// Offline YIN F0 probe for Octaver/Tuner debugging.
//   g++ -O2 -std=c++17 -I common/dsp tools/octaver_f0_probe.cpp -o /tmp/octaver_f0_probe -lm
//   /tmp/octaver_f0_probe --wav TAKE.wav --start 30 --sec 20

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

int nextPow2(int v)
{
  int n = 1;
  while (n < v)
    n <<= 1;
  return n;
}

} // namespace

int main(int argc, char** argv)
{
  const char* wavPath = nullptr;
  float startSec = 0.f, durSec = 20.f;
  float quality = 0.75f, unvoiced = 0.55f;
  float fmin = 31.f, fmax = 400.f;
  int source = 1, detect = 0;

  for (int i = 1; i < argc; ++i)
  {
    if (!std::strcmp(argv[i], "--wav") && i + 1 < argc)
      wavPath = argv[++i];
    else if (!std::strcmp(argv[i], "--start") && i + 1 < argc)
      startSec = std::atof(argv[++i]);
    else if (!std::strcmp(argv[i], "--sec") && i + 1 < argc)
      durSec = std::atof(argv[++i]);
    else if (!std::strcmp(argv[i], "--quality") && i + 1 < argc)
      quality = std::atof(argv[++i]);
    else if (!std::strcmp(argv[i], "--unvoiced") && i + 1 < argc)
      unvoiced = std::atof(argv[++i]);
    else if (!std::strcmp(argv[i], "--fmin") && i + 1 < argc)
      fmin = std::atof(argv[++i]);
    else if (!std::strcmp(argv[i], "--fmax") && i + 1 < argc)
      fmax = std::atof(argv[++i]);
    else if (!std::strcmp(argv[i], "--source") && i + 1 < argc)
      source = std::atoi(argv[++i]);
    else if (!std::strcmp(argv[i], "--detect") && i + 1 < argc)
      detect = std::atoi(argv[++i]);
  }
  if (!wavPath)
  {
    std::fprintf(stderr, "usage: %s --wav FILE [--start S] [--sec S] ...\n", argv[0]);
    return 1;
  }

  Wav wav;
  if (!readWavMono(wavPath, wav))
  {
    std::fprintf(stderr, "failed to read %s\n", wavPath);
    return 1;
  }

  const int i0 = std::clamp(int(startSec * wav.sr), 0, int(wav.samples.size()) - 1);
  const int i1 = std::clamp(i0 + int(durSec * wav.sr), i0 + 1, int(wav.samples.size()));
  const float* in = wav.samples.data() + i0;
  const int n = i1 - i0;
  const float sr = float(wav.sr);

  using namespace calfNXT::Dsp;
  LinkedPsola psola;
  YinDetector yin;
  psola.reset();
  yin.reset();

  const float winSec = 0.024f + 0.068f * std::clamp(quality, 0.f, 1.f);
  const int win = std::clamp(nextPow2(std::max(256, int(sr * winSec))), 1024, YinDetector::kMaxWin);
  const int maxPeriod = std::max(64, int(sr / std::clamp(fmin, 25.f, 400.f)));
  const int latency = std::clamp(win / 2 + maxPeriod + 32, 128, LinkedPsola::kSize / 4);
  const int hopSize = std::max(64, int(sr * 0.008f));

  float yinBuf[YinDetector::kMaxWin] {};
  int hopCount = 0;
  float hopPeriodTo = 200.f;
  float lastGoodPeriod = 0.f;
  float anchorF0 = 0.f;
  bool bowHoldActive = false;
  float lastF0 = 0.f;
  int dryHops = 0;

  std::printf("# sr=%d win=%d hop=%d fmin=%.0f fmax=%.0f quality=%.2f unvoiced=%.2f src=%d\n", wav.sr,
              win, hopSize, fmin, fmax, quality, unvoiced, source);
  std::printf("# t_s  f0_hz  conf  voiced  gate  note\n");

  for (int i = 0; i < n; ++i)
  {
    psola.write(in[i], in[i]);
    if (++hopCount < hopSize)
      continue;
    hopCount = 0;

    const int half = win / 2;
    for (int k = 0; k < win; ++k)
      yinBuf[k] = psola.peekDetect(latency + half - k, detect);

    const bool reentry = dryHops >= 2;
    const auto y = yin.analyze(yinBuf, win, sr, fmin, fmax, unvoiced, source, 0.55f);
    const float rawF0 = y.f0Hz;
    const bool rawSpike =
      !reentry && y.voiced && anchorF0 > 1.f && rawF0 > anchorF0 * 1.25f && y.confidence < 0.82f;
    if (rawSpike)
      bowHoldActive = true;
    if (bowHoldActive && anchorF0 > 1.f)
    {
      const float rel = rawF0 / anchorF0;
      if (rel > 0.92f && rel < 1.10f && y.confidence > 0.78f)
        bowHoldActive = false;
    }
    const bool bowOvershoot = bowHoldActive && anchorF0 > 1.f && rawF0 > anchorF0 * 1.10f;
    float f0 = rawF0;
    const bool skipDouble =
      bowOvershoot || (y.voiced && anchorF0 > 1.f && rawF0 > anchorF0 * 1.40f && y.confidence < 0.85f);
    if (y.voiced && f0 > 1.f && !skipDouble)
      f0 = yin.preferFundamentalOverSubharmonic(f0, sr, fmax, source);
    if (bowOvershoot)
      f0 = anchorF0;

    float rms = 0.f;
    for (int k = 0; k < win; ++k)
      rms += yinBuf[k] * yinBuf[k];
    rms = std::sqrt(rms / float(std::max(1, win)));
    const bool levelOk = rms > 1.0e-5f;
    const bool rawVoiced = levelOk && y.periodic && y.confidence >= 0.28f && y.flatness < 0.42f;

    float period = hopPeriodTo;
    float gate = 0.f;

    if (bowOvershoot)
    {
      period = anchorF0 > 1.f ? sr / anchorF0 : hopPeriodTo;
      gate = 1.f;
      dryHops = 0;
    }
    else if (rawVoiced && f0 > 1.f)
    {
      period = sr / f0;
      lastGoodPeriod = period;
      dryHops = 0;
      lastF0 = f0;
      gate = 1.f;
      if (y.confidence > 0.78f)
        anchorF0 += (f0 - anchorF0) * 0.10f;
      else if (anchorF0 < 1.f)
        anchorF0 = f0;
    }
    else if (levelOk && lastF0 > 20.f && dryHops < 2 && y.voiced)
    {
      period = lastGoodPeriod > 16.f ? lastGoodPeriod : hopPeriodTo;
      gate = 1.f;
      dryHops = 0;
    }
    else
    {
      ++dryHops;
      bowHoldActive = false;
      if (!rawVoiced)
        lastF0 *= 0.995f;
    }
    hopPeriodTo = std::max(16.f, period);

    const char* note = bowOvershoot ? " BOW" : (rawSpike ? " SPIKE" : "");
    std::printf("%6.2f %7.1f %5.2f %d %3.0f%s\n", startSec + float(i) / sr, f0, y.confidence,
                rawVoiced ? 1 : 0, gate, note);
  }
  return 0;
}
