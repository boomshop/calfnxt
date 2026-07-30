#pragma once

// Mono/stereo sidechain HP→LP cascade (12/24/36 dB via 1–3 RBJ biquads).
// Shared by Transients detector and Compressor sidechain.

#include "biquad.h"
#include "dsp_math.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Dsp {

/** Mode 0 = off, 1/2/3 = 12/24/36 dB/oct. */
inline int filterModeToStages(float modePlain)
{
  return static_cast<int>(std::lround(std::clamp(modePlain, 0.f, 3.f)));
}

/**
 * Detector / sidechain band-limit: optional HP then LP, up to 3 stages each.
 * Stereo channels keep independent filter state (shared coeffs).
 */
class SidechainFilter
{
public:
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
      for (auto& f : hp_[ch])
        f.reset();
      for (auto& f : lp_[ch])
        f.reset();
    }
    lastHpFreq_ = -1.f;
    lastLpFreq_ = -1.f;
    lastHpStages_ = -1;
    lastLpStages_ = -1;
  }

  /** hp/lp stages in 0…3; freqs in Hz. Safe to call every block. */
  void setParams(float hpHz, float lpHz, int hpStages, int lpStages)
  {
    hpStages = std::clamp(hpStages, 0, 3);
    lpStages = std::clamp(lpStages, 0, 3);
    hpHz = std::clamp(hpHz, 20.f, 20000.f);
    lpHz = std::clamp(lpHz, 20.f, 20000.f);

    if (hpStages != lastHpStages_)
    {
      if (hpStages == 0)
      {
        for (int ch = 0; ch < 2; ++ch)
          for (auto& f : hp_[ch])
            f.reset();
      }
      lastHpStages_ = hpStages;
      lastHpFreq_ = -1.f;
    }
    if (lpStages != lastLpStages_)
    {
      if (lpStages == 0)
      {
        for (int ch = 0; ch < 2; ++ch)
          for (auto& f : lp_[ch])
            f.reset();
      }
      lastLpStages_ = lpStages;
      lastLpFreq_ = -1.f;
    }

    if (hpStages > 0 && hpHz != lastHpFreq_)
    {
      hp_[0][0].setHpRbj(hpHz, 0.707f, sampleRate_, 1.f);
      for (int ch = 0; ch < 2; ++ch)
      {
        if (ch > 0)
          hp_[ch][0].copyCoeffs(hp_[0][0]);
        hp_[ch][1].copyCoeffs(hp_[ch][0]);
        hp_[ch][2].copyCoeffs(hp_[ch][0]);
      }
      lastHpFreq_ = hpHz;
    }
    if (lpStages > 0 && lpHz != lastLpFreq_)
    {
      lp_[0][0].setLpRbj(lpHz, 0.707f, sampleRate_, 1.f);
      for (int ch = 0; ch < 2; ++ch)
      {
        if (ch > 0)
          lp_[ch][0].copyCoeffs(lp_[0][0]);
        lp_[ch][1].copyCoeffs(lp_[ch][0]);
        lp_[ch][2].copyCoeffs(lp_[ch][0]);
      }
      lastLpFreq_ = lpHz;
    }
  }

  int hpStages() const { return lastHpStages_ < 0 ? 0 : lastHpStages_; }
  int lpStages() const { return lastLpStages_ < 0 ? 0 : lastLpStages_; }

  /** Filter one channel (0 or 1). */
  float processChannel(int ch, float s)
  {
    ch = ch < 0 ? 0 : (ch > 1 ? 1 : ch);
    const int hpN = hpStages();
    const int lpN = lpStages();
    for (int i = 0; i < hpN; ++i)
    {
      s = static_cast<float>(hp_[ch][i].process(s));
      hp_[ch][i].sanitize();
    }
    for (int i = 0; i < lpN; ++i)
    {
      s = static_cast<float>(lp_[ch][i].process(s));
      lp_[ch][i].sanitize();
    }
    return s;
  }

  /** Mono path (uses channel 0 state) — Transients Mid detector. */
  float processMono(float s) { return processChannel(0, s); }

private:
  float sampleRate_ = 44100.f;
  BiquadD1 hp_[2][3];
  BiquadD1 lp_[2][3];
  float lastHpFreq_ = -1.f;
  float lastLpFreq_ = -1.f;
  int lastHpStages_ = -1;
  int lastLpStages_ = -1;
};

} // namespace Dsp
} // namespace calfNXT
