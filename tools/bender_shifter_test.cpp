// Phase-vocoder checks for the Bender pitch shifter.
// Build: g++ -std=c++17 -O2 -Icommon/dsp -o /tmp/bender_shifter_test tools/bender_shifter_test.cpp

#include "bender_shifter.h"

#include <cmath>
#include <cstdio>
#include <memory>
#include <vector>

namespace {

int fails = 0;

void expect(bool ok, const char* msg)
{
  if (ok)
    return;
  std::fprintf(stderr, "FAIL %s\n", msg);
  ++fails;
}

void expectNear(float got, float want, float tol, const char* msg)
{
  if (std::fabs(got - want) <= tol)
    return;
  std::fprintf(stderr, "FAIL %s (got %.6f want %.6f)\n", msg, got, want);
  ++fails;
}

struct Runner
{
  std::unique_ptr<calfNXT::Dsp::BenderShifter> s = std::make_unique<calfNXT::Dsp::BenderShifter>();

  explicit Runner(int grain, int overlap = 8)
  {
    s->setGrain(grain, overlap);
    s->reset();
    s->setTone(1.f, 48000.f);
  }

  float step(float in, float ratio, float pitchAbs, bool bypass = false)
  {
    float oL = 0.f;
    float oR = 0.f;
    s->process(in, in, ratio, pitchAbs, 1.f, bypass, oL, oR);
    return oL;
  }
};

float rms(const std::vector<float>& x, int from, int to)
{
  double e = 0.0;
  int n = 0;
  for (int i = from; i < to; ++i)
  {
    e += double(x[i]) * double(x[i]);
    ++n;
  }
  return n > 0 ? float(std::sqrt(e / n)) : 0.f;
}

float goertzelPow(const std::vector<float>& x, int from, int n, float freq, float sr)
{
  const float coeff = 2.f * std::cos(2.f * float(M_PI) * freq / sr);
  float s1 = 0.f;
  float s2 = 0.f;
  for (int i = 0; i < n; ++i)
  {
    const float s0 = x[size_t(from + i)] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

std::vector<float> render(int grain, float freq, float ratio, float pitchAbs, int n, int overlap = 8)
{
  Runner r(grain, overlap);
  std::vector<float> y(static_cast<size_t>(n), 0.f);
  for (int i = 0; i < n; ++i)
  {
    const float x = std::sin(2.0 * M_PI * double(freq) * i / 48000.0);
    y[size_t(i)] = r.step(x, ratio, pitchAbs);
  }
  return y;
}

void expectFlat(const std::vector<float>& y, int from, int to, const char* msg)
{
  constexpr int kBlock = 128;
  float minR = 1.0e9f;
  float maxR = 0.f;
  for (int i = from; i + kBlock <= to; i += kBlock)
  {
    double e = 0.0;
    for (int j = 0; j < kBlock; ++j)
      e += double(y[size_t(i + j)]) * double(y[size_t(i + j)]);
    const float block = float(std::sqrt(e / kBlock));
    minR = std::min(minR, block);
    maxR = std::max(maxR, block);
  }
  // A dual-head crossfade nulls the block rms. A couple of dB of vocoder
  // ripple is the residual.
  const bool ok = maxR > 0.35f && minR > maxR * 0.75f;
  expect(ok, msg);
  if (!ok)
    std::fprintf(stderr, "  block rms min %.4f max %.4f\n", minR, maxR);
}

} // namespace

int main()
{
  constexpr int kSr = 48000;
  constexpr int kGrain = 8928; // Smooth/Studio window → FFT 8192
  constexpr int kN = kSr;

  {
    Runner r(768);
    expect(r.s->latency() >= 4096, "a 16 ms request is refused");
  }

  {
    Runner r(kGrain, 16);
    const int lat = r.s->latency();
    expect(lat == 8192, "smooth window is 8192 samples");
    int peakAt = -1;
    float peak = 0.f;
    for (int i = 0; i < lat + 64; ++i)
    {
      const float y = r.step(i == 0 ? 1.f : 0.f, 1.f, 0.f, true);
      if (std::fabs(y) > peak)
      {
        peak = std::fabs(y);
        peakAt = i;
      }
    }
    expectNear(float(peakAt), float(lat), 0.f, "bypass impulse delay");
    expectNear(peak, 1.f, 1.0e-5f, "bypass impulse gain");
  }

  // Steady tones must not tremolo, and the pitch must actually move.
  struct Case
  {
    float ratio;
    float st;
    float freq;
    const char* name;
  };
  const Case cases[] = {
    {std::pow(2.f, 4.f / 12.f), 4.f, 220.f, "+4 st"},
    {0.5f, 12.f, 440.f, "-12 st"},
    {2.f, 12.f, 300.f, "+12 st"},
    {4.f, 24.f, 220.f, "+24 st"},
  };
  for (const Case& c : cases)
  {
    const int grain = c.freq == 300.f ? 768 : kGrain;
    const auto y = render(grain, c.freq, c.ratio, c.st, kN);
    char buf[80];
    std::snprintf(buf, sizeof buf, "%s level stays put", c.name);
    expectFlat(y, kN / 2, kN, buf);

    const float wantHz = c.freq * c.ratio;
    const float at = goertzelPow(y, kN / 2, kN / 4, wantHz, float(kSr));
    const float leaked = goertzelPow(y, kN / 2, kN / 4, c.freq, float(kSr));
    std::snprintf(buf, sizeof buf, "%s energy sits on the shifted tone", c.name);
    expect(at > leaked * 20.f && at > 1.f, buf);
    if (!(at > leaked * 20.f && at > 1.f))
      std::fprintf(stderr, "  power shifted %.3g original %.3g\n", at, leaked);
  }

  // High partial pitched two octaves up must not fold back into the band.
  {
    const auto y = render(kGrain, 8000.f, 4.f, 24.f, kN);
    const float alias = rms(y, kN / 2, kN);
    const auto ref = render(kGrain, 200.f, 4.f, 24.f, kN);
    const float refR = rms(ref, kN / 2, kN);
    expect(refR > 0.25f, "low tone survives +24 st");
    expect(alias < refR * 0.1f, "+24 st drops 8 kHz instead of folding it");
    if (!(alias < refR * 0.1f) || !(refR > 0.25f))
      std::fprintf(stderr, "  ref %.4f alias %.4f\n", refR, alias);
  }

  if (fails)
  {
    std::fprintf(stderr, "%d failed\n", fails);
    return 1;
  }
  std::printf("bender shifter ok\n");
  return 0;
}
