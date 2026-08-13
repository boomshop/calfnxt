#pragma once

// Linkwitz-Riley HP/LP band filter with complementary dry path.
// Wet = HP then LP (same LR Qs as BandSplitter). Dry complement:
//   HP only → LP(fc)
//   LP only → HP(fc)
//   both    → LP(hp) + HP(lp)
//   neither → passthrough
// So dry + wet ≈ allpass (flat magnitude) for a linear wet path — safe to
// mix in parallel without spectral notches at the crossover.

#include "biquad.h"
#include "dsp_math.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Dsp {

/**
 * Mode plains 0…4 (FrequencyRange): 0=off, 1=12, 2=24, 3=36, 4=48 dB/oct.
 * Odd-order LR6 (36 dB) cannot sum LP+HP to an allpass — mapped to LR4.
 */
inline int complementaryModeToStages(float modePlain)
{
  const int m = static_cast<int>(std::lround(std::clamp(modePlain, 0.f, 4.f)));
  switch (m)
  {
    case 0:
      return 0;
    case 1:
      return 1; // LR2
    case 2:
    case 3:
      return 2; // LR4 (36 → 24)
    case 4:
      return 4; // LR8
    default:
      return 0;
  }
}

class ComplementaryBandFilter
{
public:
  static constexpr int kMaxStages = 4;

  void setSampleRate(float sr)
  {
    sampleRate_ = sr > 0.f ? sr : 44100.f;
    lastHpFreq_ = -1.f;
    lastLpFreq_ = -1.f;
  }

  void reset()
  {
    for (int ch = 0; ch < 2; ++ch)
    {
      for (auto& f : wetHp_[ch])
        f.reset();
      for (auto& f : wetLp_[ch])
        f.reset();
      for (auto& f : dryLp_[ch])
        f.reset();
      for (auto& f : dryHp_[ch])
        f.reset();
    }
    lastHpFreq_ = -1.f;
    lastLpFreq_ = -1.f;
    lastHpStages_ = -1;
    lastLpStages_ = -1;
  }

  /** hp/lp stages in 0…4; freqs in Hz. Safe to call every block. */
  void setParams(float hpHz, float lpHz, int hpStages, int lpStages)
  {
    hpStages = std::clamp(hpStages, 0, kMaxStages);
    lpStages = std::clamp(lpStages, 0, kMaxStages);
    // LR8 uses 4 stages; reject odd leftover stage counts from callers.
    if (hpStages == 3)
      hpStages = 2;
    if (lpStages == 3)
      lpStages = 2;
    hpHz = std::clamp(hpHz, 20.f, 20000.f);
    lpHz = std::clamp(lpHz, 20.f, 20000.f);

    if (hpStages != lastHpStages_)
    {
      if (hpStages == 0)
      {
        for (int ch = 0; ch < 2; ++ch)
        {
          for (auto& f : wetHp_[ch])
            f.reset();
          for (auto& f : dryLp_[ch])
            f.reset();
        }
      }
      lastHpStages_ = hpStages;
      lastHpFreq_ = -1.f;
    }
    if (lpStages != lastLpStages_)
    {
      if (lpStages == 0)
      {
        for (int ch = 0; ch < 2; ++ch)
        {
          for (auto& f : wetLp_[ch])
            f.reset();
          for (auto& f : dryHp_[ch])
            f.reset();
        }
      }
      lastLpStages_ = lpStages;
      lastLpFreq_ = -1.f;
    }

    if (hpStages > 0 && hpHz != lastHpFreq_)
    {
      setLrCascade(wetHp_[0], dryLp_[0], true, hpHz, hpStages);
      for (int ch = 1; ch < 2; ++ch)
      {
        for (int s = 0; s < kMaxStages; ++s)
        {
          wetHp_[ch][s].copyCoeffs(wetHp_[0][s]);
          dryLp_[ch][s].copyCoeffs(dryLp_[0][s]);
        }
      }
      lastHpFreq_ = hpHz;
    }
    if (lpStages > 0 && lpHz != lastLpFreq_)
    {
      setLrCascade(wetLp_[0], dryHp_[0], false, lpHz, lpStages);
      for (int ch = 1; ch < 2; ++ch)
      {
        for (int s = 0; s < kMaxStages; ++s)
        {
          wetLp_[ch][s].copyCoeffs(wetLp_[0][s]);
          dryHp_[ch][s].copyCoeffs(dryHp_[0][s]);
        }
      }
      lastLpFreq_ = lpHz;
    }
  }

  int hpStages() const { return lastHpStages_ < 0 ? 0 : lastHpStages_; }
  int lpStages() const { return lastLpStages_ < 0 ? 0 : lastLpStages_; }
  bool active() const { return hpStages() > 0 || lpStages() > 0; }

  /** Wet band: HP → LP. */
  float processWet(int ch, float s)
  {
    ch = ch < 0 ? 0 : (ch > 1 ? 1 : ch);
    const int hpN = hpStages();
    const int lpN = lpStages();
    for (int i = 0; i < hpN; ++i)
    {
      s = static_cast<float>(wetHp_[ch][i].process(s));
      wetHp_[ch][i].sanitize();
    }
    for (int i = 0; i < lpN; ++i)
    {
      s = static_cast<float>(wetLp_[ch][i].process(s));
      wetLp_[ch][i].sanitize();
    }
    return s;
  }

  /**
   * Complementary dry path for parallel mix with processWet (linear case).
   * Independent filter state from the wet path.
   */
  float processDry(int ch, float s)
  {
    ch = ch < 0 ? 0 : (ch > 1 ? 1 : ch);
    const int hpN = hpStages();
    const int lpN = lpStages();
    if (hpN <= 0 && lpN <= 0)
      return s;

    float lo = 0.f;
    float hi = 0.f;
    if (hpN > 0)
    {
      float x = s;
      for (int i = 0; i < hpN; ++i)
      {
        x = static_cast<float>(dryLp_[ch][i].process(x));
        dryLp_[ch][i].sanitize();
      }
      lo = x;
    }
    if (lpN > 0)
    {
      float x = s;
      for (int i = 0; i < lpN; ++i)
      {
        x = static_cast<float>(dryHp_[ch][i].process(x));
        dryHp_[ch][i].sanitize();
      }
      hi = x;
    }

    if (hpN > 0 && lpN > 0)
      return lo + hi;
    if (hpN > 0)
      return lo;
    return hi;
  }

private:
  static void fillLrQs(int stages, double* q)
  {
    for (int i = 0; i < kMaxStages; ++i)
      q[i] = 0.7071067811865476;
    if (stages <= 1)
    {
      q[0] = 0.5;
      return;
    }
    if (stages == 2)
    {
      q[0] = q[1] = 0.7071067811865476;
      return;
    }
    // LR8
    q[0] = q[2] = 0.541196100146197;
    q[1] = q[3] = 1.306562964876376;
  }

  void setLrCascade(BiquadD1* wet, BiquadD1* dryComp, bool wetIsHp, float hz,
                    int stages)
  {
    double q[kMaxStages];
    fillLrQs(stages, q);
    for (int s = 0; s < stages; ++s)
    {
      const float qs = static_cast<float>(q[s]);
      if (wetIsHp)
      {
        wet[s].setHpRbj(hz, qs, sampleRate_);
        dryComp[s].setLpRbj(hz, qs, sampleRate_);
      }
      else
      {
        wet[s].setLpRbj(hz, qs, sampleRate_);
        dryComp[s].setHpRbj(hz, qs, sampleRate_);
      }
    }
    for (int s = stages; s < kMaxStages; ++s)
    {
      wet[s].setNull();
      wet[s].reset();
      dryComp[s].setNull();
      dryComp[s].reset();
    }
  }

  float sampleRate_ = 44100.f;
  BiquadD1 wetHp_[2][kMaxStages];
  BiquadD1 wetLp_[2][kMaxStages];
  BiquadD1 dryLp_[2][kMaxStages]; // complement of wet HP
  BiquadD1 dryHp_[2][kMaxStages]; // complement of wet LP
  float lastHpFreq_ = -1.f;
  float lastLpFreq_ = -1.f;
  int lastHpStages_ = -1;
  int lastLpStages_ = -1;
};

} // namespace Dsp
} // namespace calfNXT
