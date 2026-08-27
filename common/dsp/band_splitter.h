#pragma once

// Linkwitz-Riley band splitter (max 8 bands).
// Cascaded LR splits: summing all bands ≈ allpass(input) — flat magnitude,
// no cancellation notches at the crossover frequencies (unlike one-pole x−lp).
// Residual phase warp is expected for zero-latency IIR.
// Crossover frequencies glide in log space (same as EQ) to avoid zipper noise.

#include "biquad.h"
#include "dsp_math.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Dsp {

class BandSplitter
{
public:
  static constexpr int kMaxBands = 8;
  static constexpr int kMaxSplits = kMaxBands - 1;
  static constexpr int kMaxStages = 8; // LR16 = 8 biquads per LP/HP

  /**
   * Approximate slope in dB/oct (Linkwitz-Riley).
   * Only even orders: LR = Butterworth². No LR6 (36 dB) — odd order cannot
   * sum LP+HP to a flat allpass (phase-coherent complementary split).
   * LR2 (12 dB) is kept for Deesser / API; multiband UI offers 24 / 48 / 96.
   */
  enum class Slope : int
  {
    Db12 = 0, // LR2 — 1 biquad, Q=0.5
    Db24 = 1, // LR4 — 2 biquads, Q=√2/2
    Db48 = 2, // LR8 — 4 biquads, Butterworth-4 Qs doubled
    Db96 = 3, // LR16 — 8 biquads, Butterworth-8 Qs doubled (~2× LR8 CPU)
  };

  void reset()
  {
    for (int i = 0; i < kMaxSplits; ++i)
    {
      for (int s = 0; s < kMaxStages; ++s)
      {
        lp_[i][s].reset();
        hp_[i][s].reset();
      }
    }
  }

  void setSampleRate(float sr)
  {
    const float s = sr > 0.f ? sr : 44100.f;
    if (s == sr_)
      return;
    sr_ = s;
    enforceFreqOrder(freqTgt_);
    snapFreqs();
    dirty_ = true;
    updateFilters();
  }

  /** Number of bands 1…8 (1 = passthrough). */
  void setBands(int n)
  {
    const int b = std::clamp(n, 1, kMaxBands);
    if (b == bands_)
      return;
    bands_ = b;
    enforceFreqOrder(freqTgt_);
    snapFreqs();
    dirty_ = true;
    updateFilters();
  }

  void setSlope(Slope s)
  {
    if (s == slope_)
      return;
    slope_ = s;
    // Topology change — snap immediately (cannot glide stage count).
    dirty_ = true;
    updateFilters();
  }

  /** Snap continuous UI values (e.g. 12 / 24 / 48 / 96) to Slope. */
  void setSlopeDb(float db)
  {
    Slope s = Slope::Db24;
    if (db < 18.f)
      s = Slope::Db12;
    else if (db < 36.f)
      s = Slope::Db24;
    else if (db < 72.f)
      s = Slope::Db48;
    else
      s = Slope::Db96;
    setSlope(s);
  }

  /**
   * Crossover i separates band i and band i+1.
   * Sets the glide target; call prepareBlock() once per audio block.
   */
  void setFreq(int i, float hz)
  {
    if (i < 0 || i >= kMaxSplits)
      return;
    freqTgt_[i] = hz;
    enforceFreqOrder(freqTgt_);
  }

  void setFreqs(const float* hz, int count)
  {
    const int n = std::clamp(count, 0, kMaxSplits);
    for (int i = 0; i < n; ++i)
      freqTgt_[i] = hz[i];
    enforceFreqOrder(freqTgt_);
  }

  /**
   * Advance frequency glides and refresh biquad coeffs if needed.
   * Call once per process block (before sample loop).
   */
  void prepareBlock()
  {
    bool gliding = false;
    bool changed = false;
    const int nSplit = splits();
    for (int i = 0; i < nSplit; ++i)
    {
      const float prev = freqCur_[i];
      freqCur_[i] = glideTowardLog(freqCur_[i], freqTgt_[i], gliding);
      if (freqCur_[i] != prev)
        changed = true;
    }
    if (changed)
      enforceFreqOrder(freqCur_);
    if (changed || dirty_)
      updateFilters();
  }

  int bands() const { return bands_; }
  int splits() const { return std::max(0, bands_ - 1); }
  Slope slope() const { return slope_; }
  /** Current (possibly gliding) crossover frequency. */
  float freq(int i) const
  {
    return (i >= 0 && i < kMaxSplits) ? freqCur_[i] : 0.f;
  }
  float freqTarget(int i) const
  {
    return (i >= 0 && i < kMaxSplits) ? freqTgt_[i] : 0.f;
  }

  /** Write bands() outputs into bandsOut[0..bands()-1]. */
  void process(float x, float* bandsOut)
  {
    if (!bandsOut)
      return;
    if (dirty_)
      updateFilters();

    if (bands_ <= 1)
    {
      bandsOut[0] = x;
      return;
    }

    float remaining = x;
    const int stages = stageCount();
    for (int i = 0; i < bands_ - 1; ++i)
    {
      double lo = remaining;
      double hi = remaining;
      for (int s = 0; s < stages; ++s)
      {
        lo = lp_[i][s].process(lo);
        hi = hp_[i][s].process(hi);
      }
      bandsOut[i] = static_cast<float>(lo);
      remaining = static_cast<float>(hi);
    }
    bandsOut[bands_ - 1] = remaining;
  }

  /** Call once per audio block (not per sample). */
  void sanitize()
  {
    const int stages = stageCount();
    const int nSplit = splits();
    for (int i = 0; i < nSplit; ++i)
    {
      for (int s = 0; s < stages; ++s)
      {
        lp_[i][s].sanitize();
        hp_[i][s].sanitize();
      }
    }
  }

  void process2(float x, float& low, float& high)
  {
    float out[kMaxBands];
    process(x, out);
    if (bands_ <= 1)
    {
      low = out[0];
      high = 0.f;
      return;
    }
    low = out[0];
    high = 0.f;
    for (int i = 1; i < bands_; ++i)
      high += out[i];
  }

private:
  int stageCount() const
  {
    switch (slope_)
    {
      case Slope::Db12:
        return 1;
      case Slope::Db24:
        return 2;
      case Slope::Db48:
        return 4;
      case Slope::Db96:
        return 8;
    }
    return 2;
  }

  void snapFreqs()
  {
    for (int i = 0; i < kMaxSplits; ++i)
      freqCur_[i] = freqTgt_[i];
  }

  void enforceFreqOrder(float* freqs)
  {
    const float ny = sr_ * 0.45f;
    const int nSplit = splits();
    float prev = 20.f;
    for (int i = 0; i < nSplit; ++i)
    {
      float f = std::clamp(freqs[i], 20.f, ny);
      f = std::max(f, prev * 1.06f);
      f = std::min(f, ny);
      freqs[i] = f;
      prev = f;
    }
  }

  void updateFilters()
  {
    if (sr_ <= 0.f)
      return;

    const int stages = stageCount();
    const int nSplit = splits();

    double q[kMaxStages] {};
    switch (slope_)
    {
      case Slope::Db12:
        q[0] = 0.5;
        break;
      case Slope::Db24:
        q[0] = q[1] = 0.7071067811865476;
        break;
      case Slope::Db48:
        // LR8 = two cascaded Butterworth-4 (Qs repeated).
        q[0] = q[2] = 0.541196100146197;
        q[1] = q[3] = 1.306562964876376;
        break;
      case Slope::Db96:
        // LR16 = two cascaded Butterworth-8 (Qs repeated).
        q[0] = q[4] = 0.509795579;
        q[1] = q[5] = 0.601344886;
        q[2] = q[6] = 0.899976223;
        q[3] = q[7] = 2.562915447;
        break;
    }

    for (int i = 0; i < nSplit; ++i)
    {
      const float fc = freqCur_[i];
      for (int s = 0; s < stages; ++s)
      {
        lp_[i][s].setLpRbj(fc, static_cast<float>(q[s]), sr_);
        hp_[i][s].setHpRbj(fc, static_cast<float>(q[s]), sr_);
      }
      for (int s = stages; s < kMaxStages; ++s)
      {
        lp_[i][s].setNull();
        hp_[i][s].setNull();
        lp_[i][s].reset();
        hp_[i][s].reset();
      }
    }
    dirty_ = false;
  }

  BiquadD1 lp_[kMaxSplits][kMaxStages];
  BiquadD1 hp_[kMaxSplits][kMaxStages];
  float freqTgt_[kMaxSplits] = { 200.f, 500.f, 1000.f, 2000.f, 4000.f, 8000.f, 12000.f };
  float freqCur_[kMaxSplits] = { 200.f, 500.f, 1000.f, 2000.f, 4000.f, 8000.f, 12000.f };
  float sr_ = 44100.f;
  int bands_ = 2;
  Slope slope_ = Slope::Db24;
  bool dirty_ = true;
};

} // namespace Dsp
} // namespace calfNXT
