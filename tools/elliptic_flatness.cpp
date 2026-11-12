// Regression: Elliptic crossover mono sum stays magnitude-flat, and Amount 0
// leaves each channel at the input magnitude (allpass only).
//
//   ./tools/run_elliptic_flatness.sh

#include "elliptic_crossover.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <vector>

using calfNXT::Dsp::EllipticCrossover;

namespace {

constexpr float kSr = 48000.f;
constexpr float kPi = 3.14159265358979323846f;

float rms(const std::vector<float>& x)
{
  double acc = 0.0;
  for (float v : x)
    acc += double(v) * double(v);
  return std::sqrt(acc / double(std::max<size_t>(1, x.size())));
}

float dbErr(float a, float b)
{
  return 20.f * std::log10(std::max(a, 1.0e-12f) / std::max(b, 1.0e-12f));
}

struct Probe
{
  float hz;
  float amount;
  float slope;
  float gainR;
  float phaseR;
};

bool runProbe(const Probe& p, float limDb, const char* name)
{
  EllipticCrossover xover;
  xover.setSampleRate(kSr);
  xover.setParams(80.f, p.slope);

  // Integer periods so a phase-shifted allpass is not punished by window edges.
  const int period = std::max(8, static_cast<int>(std::lround(kSr / p.hz)));
  const int kSettle = period * 16;
  const int kN = period * 8;
  std::vector<float> inL(static_cast<size_t>(kN)), inR(static_cast<size_t>(kN));
  std::vector<float> outL(static_cast<size_t>(kN)), outR(static_cast<size_t>(kN));
  std::vector<float> monoIn(static_cast<size_t>(kN)), monoOut(static_cast<size_t>(kN));
  const float w = 2.f * kPi * p.hz / kSr;

  for (int i = 0; i < kSettle + kN; ++i)
  {
    const float l = std::sin(w * float(i));
    const float r = p.gainR * std::sin(w * float(i) + p.phaseR);
    float oL = 0.f, oR = 0.f, low = 0.f;
    xover.process(l, r, p.amount, oL, oR, low);
    if (i < kSettle)
      continue;
    const int n = i - kSettle;
    inL[static_cast<size_t>(n)] = l;
    inR[static_cast<size_t>(n)] = r;
    outL[static_cast<size_t>(n)] = oL;
    outR[static_cast<size_t>(n)] = oR;
    monoIn[static_cast<size_t>(n)] = l + r;
    monoOut[static_cast<size_t>(n)] = oL + oR;
  }

  const float mono = dbErr(rms(monoOut), rms(monoIn));
  const float left = dbErr(rms(outL), rms(inL));
  const float right = dbErr(rms(outR), rms(inR));
  const float worst = std::max(std::fabs(mono), std::max(std::fabs(left), std::fabs(right)));
  const bool checkChannels = p.amount < 0.001f;
  const float reported = checkChannels ? worst : std::fabs(mono);
  const bool ok = reported <= limDb;
  std::printf("  %-22s %5.0f Hz  mono %+6.3f  L %+6.3f  R %+6.3f  %s\n", name, p.hz, mono,
              left, right, ok ? "OK" : "FAIL");
  return ok;
}

/** Pure side (R = −L) at Amount 1. Below fc the output must drop; above it must pass. */
bool runSide(float hz, float slope, float expectBelowDb, bool wantDrop)
{
  EllipticCrossover xover;
  xover.setSampleRate(kSr);
  xover.setParams(80.f, slope);
  constexpr int kSettle = 8192;
  constexpr int kN = 4096;
  double inAcc = 0.0;
  double outAcc = 0.0;
  const float w = 2.f * kPi * hz / kSr;
  for (int i = 0; i < kSettle + kN; ++i)
  {
    const float l = std::sin(w * float(i));
    float oL = 0.f, oR = 0.f, low = 0.f;
    xover.process(l, -l, 1.f, oL, oR, low);
    if (i < kSettle)
      continue;
    inAcc += double(l) * double(l);
    outAcc += double(oL) * double(oL);
  }
  const float err = 20.f * std::log10(std::sqrt(outAcc / inAcc));
  const bool ok = wantDrop ? err < expectBelowDb : err > expectBelowDb;
  std::printf("  side %-4.0f Hz  slope %4.0f  %+6.2f dB  %s\n", hz, slope, err, ok ? "OK" : "FAIL");
  return ok;
}

} // namespace

int main()
{
  constexpr float kLim = 0.05f;
  bool ok = true;
  const float slopes[] = {12.f, 24.f};
  const float amounts[] = {0.f, 0.35f, 1.f};
  const float tones[] = {40.f, 80.f, 120.f, 400.f, 2000.f};
  for (float slope : slopes)
  {
    for (float amount : amounts)
    {
      for (float hz : tones)
      {
        char name[64];
        std::snprintf(name, sizeof name, "a=%.2f slope %.0f", amount, slope);
        Probe p {hz, amount, slope, 0.6f, 0.7f};
        ok = runProbe(p, kLim, name) && ok;
      }
    }
  }

  ok = runSide(40.f, 12.f, -8.f, true) && ok;
  ok = runSide(40.f, 24.f, -18.f, true) && ok;
  ok = runSide(2000.f, 12.f, -0.5f, false) && ok;
  ok = runSide(2000.f, 24.f, -0.5f, false) && ok;

  if (!ok)
  {
    std::fprintf(stderr, "FAIL: elliptic recombination is not flat.\n");
    return 1;
  }
  std::printf("All cases OK.\n");
  return 0;
}
