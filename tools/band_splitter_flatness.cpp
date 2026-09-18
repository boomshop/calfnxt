// Regression: BandSplitter band sum must stay magnitude-flat (cancellation-free).
// Cascaded LR without allpass compensation digs notches at every crossover —
// the classic Calf multiband / deesser failure mode. This tool fails loudly
// if that topology regresses.
//
//   ./tools/run_band_splitter_flatness.sh

#include "band_splitter.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <vector>

using calfNXT::Dsp::BandSplitter;

namespace {

constexpr float kSr = 48000.f;
constexpr float kPi = 3.14159265358979323846f;

float rmsDb(const float* x, int n)
{
  double acc = 0.0;
  for (int i = 0; i < n; ++i)
    acc += double(x[i]) * double(x[i]);
  const double mean = acc / double(std::max(1, n));
  return float(10.0 * std::log10(std::max(mean, 1.0e-30)));
}

/** Drive splitter with a sine; return |sum bands| − |input| in dB after settle. */
float sumErrorDb(BandSplitter& split, float hz, int settle, int measure)
{
  const float w = 2.f * kPi * hz / kSr;
  float bands[BandSplitter::kMaxBands];
  std::vector<float> in(static_cast<size_t>(measure));
  std::vector<float> sum(static_cast<size_t>(measure));

  for (int i = 0; i < settle; ++i)
  {
    const float x = std::sin(w * float(i));
    split.process(x, bands);
    float s = 0.f;
    for (int b = 0; b < split.bands(); ++b)
      s += bands[b];
    (void)s;
  }

  for (int i = 0; i < measure; ++i)
  {
    const float x = std::sin(w * float(settle + i));
    split.process(x, bands);
    float s = 0.f;
    for (int b = 0; b < split.bands(); ++b)
      s += bands[b];
    in[static_cast<size_t>(i)] = x;
    sum[static_cast<size_t>(i)] = s;
  }

  return rmsDb(sum.data(), measure) - rmsDb(in.data(), measure);
}

struct Case
{
  int bands;
  BandSplitter::Slope slope;
  const char* name;
  float freqs[5];
};

bool runCase(const Case& c, float limDb)
{
  BandSplitter split;
  split.setSampleRate(kSr);
  split.setBands(c.bands);
  split.setSlope(c.slope);
  for (int i = 0; i < c.bands - 1; ++i)
    split.setFreq(i, c.freqs[i]);
  split.prepareBlock(); // snap glide targets → coeffs
  split.reset();

  // Probe near each crossover and mid-band centres.
  const float probes[] = {
    40.f, 80.f, 120.f, 200.f, 350.f, 500.f, 800.f, 1200.f, 2000.f, 3500.f,
    5000.f, 8000.f, 12000.f,
  };

  float worst = 0.f;
  float worstHz = 0.f;
  for (float hz : probes)
  {
    if (hz >= kSr * 0.45f)
      continue;
    BandSplitter local;
    local.setSampleRate(kSr);
    local.setBands(c.bands);
    local.setSlope(c.slope);
    for (int i = 0; i < c.bands - 1; ++i)
      local.setFreq(i, c.freqs[i]);
    local.prepareBlock();
    local.reset();
    const float err = sumErrorDb(local, hz, 8192, 4096);
    if (std::fabs(err) > std::fabs(worst))
    {
      worst = err;
      worstHz = hz;
    }
  }

  const bool ok = std::fabs(worst) <= limDb;
  std::printf("  %-28s worst %+6.3f dB @ %.0f Hz  %s\n", c.name, worst, worstHz,
              ok ? "OK" : "FAIL");
  return ok;
}

} // namespace

int main()
{
  // With AP compensation, magnitude error stays well under 0.25 dB on sines.
  // Without it, LR8 / 6-band stacks dig several dB of notches at xovers.
  constexpr float kLimDb = 0.35f;

  const Case cases[] = {
    {2, BandSplitter::Slope::Db24, "2-band LR4", {1000.f}},
    {2, BandSplitter::Slope::Db48, "2-band LR8", {1000.f}},
    {3, BandSplitter::Slope::Db24, "3-band LR4", {250.f, 2500.f}},
    {4, BandSplitter::Slope::Db48, "4-band LR8", {120.f, 800.f, 4000.f}},
    {6, BandSplitter::Slope::Db24, "6-band LR4 (mbcomp)",
     {80.f, 250.f, 800.f, 2500.f, 8000.f}},
    {6, BandSplitter::Slope::Db48, "6-band LR8 (mbcomp)",
     {80.f, 250.f, 800.f, 2500.f, 8000.f}},
    {6, BandSplitter::Slope::Db96, "6-band LR16",
     {80.f, 250.f, 800.f, 2500.f, 8000.f}},
  };

  std::printf("BandSplitter flatness (sum ≈ allpass), limit ±%.2f dB\n", kLimDb);
  bool allOk = true;
  for (const Case& c : cases)
    allOk = runCase(c, kLimDb) && allOk;

  if (!allOk)
  {
    std::fprintf(stderr,
                 "FAIL: band sum is not cancellation-free. Cascaded LR splits "
                 "must apply allpass (LP+HP) compensation on earlier bands.\n");
    return 1;
  }
  std::printf("All cases OK.\n");
  return 0;
}
