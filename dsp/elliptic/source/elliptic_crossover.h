#pragma once

// Elliptic bass-mono crossover.
// Side is split with an even-order Linkwitz–Riley pair whose branches share
// one phase. Mid runs the same pair (its own state) and keeps LP+HP, which is
// an allpass. Recombining mid ± side therefore has a flat mono sum and no
// extra phase step between mid and side at the cutoff.
//
// 12 dB is one RBJ section at Q=0.5. Those LP and HP outputs are 180° apart
// and cancel if added raw, so the HP branch is inverted. 24 dB is two
// Butterworth sections at Q=√2/2; LP and HP are already in phase.
// 6 dB is not offered: a one-pole HP is 90° from its complement at the cutoff,
// so the side cannot be phase-matched to a full-band mid.

#include "biquad.h"
#include "dsp_math.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Dsp {

class EllipticCrossover
{
public:
  void setSampleRate(float sr)
  {
    const float s = sr > 0.f ? sr : 44100.f;
    if (s == sr_)
      return;
    sr_ = s;
    reset();
    design();
  }

  void reset()
  {
    mid_.reset();
    side_.reset();
  }

  void sanitize()
  {
    mid_.sanitize();
    side_.sanitize();
  }

  /** True while the allpass / split state is still carrying energy. */
  bool hot() const { return mid_.hot() || side_.hot(); }

  /**
   * slopeDb snaps to 12 below 18, otherwise 24.
   * A slope change clears state (the section count changes).
   */
  void setParams(float freqHz, float slopeDb)
  {
    const bool twelve = slopeDb < 18.f;
    const int stages = twelve ? 1 : 2;
    const bool flip = twelve;
    const float ny = (sr_ > 0.f ? sr_ : 44100.f) * 0.45f;
    const float freq = std::clamp(freqHz, 20.f, ny);
    const bool topology = stages != stages_ || flip != flipHp_;
    if (topology)
    {
      stages_ = stages;
      flipHp_ = flip;
      reset();
    }
    if (!topology && freq == freq_)
      return;
    freq_ = freq;
    design();
  }

  /**
   * One sample. amount is 0…1 (0 = full side, 1 = side bass removed).
   * lowSide is the side low band before Amount, for the listen solo.
   * bassL/bassR are the output below the cutoff (mid low ± remaining side low),
   * for the goniometer.
   */
  void process(float inL, float inR, float amount, float& outL, float& outR, float& lowSide)
  {
    float bassL = 0.f;
    float bassR = 0.f;
    process(inL, inR, amount, outL, outR, lowSide, bassL, bassR);
  }

  void process(float inL, float inR, float amount, float& outL, float& outR, float& lowSide,
               float& bassL, float& bassR)
  {
    const float mid = 0.5f * (inL + inR);
    const float side = 0.5f * (inL - inR);
    float mLow = 0.f;
    float mHigh = 0.f;
    float sLow = 0.f;
    float sHigh = 0.f;
    mid_.split(mid, stages_, flipHp_, mLow, mHigh);
    side_.split(side, stages_, flipHp_, sLow, sHigh);
    const float mAp = mLow + mHigh;
    const float a = std::clamp(amount, 0.f, 1.f);
    const float sBass = (1.f - a) * sLow;
    const float sOut = sHigh + sBass;
    outL = mAp + sOut;
    outR = mAp - sOut;
    lowSide = sLow;
    bassL = mLow + sBass;
    bassR = mLow - sBass;
  }

private:
  struct Arm
  {
    BiquadD1 lp[2];
    BiquadD1 hp[2];

    void reset()
    {
      for (int s = 0; s < 2; ++s)
      {
        lp[s].reset();
        hp[s].reset();
      }
    }

    void sanitize()
    {
      for (int s = 0; s < 2; ++s)
      {
        lp[s].sanitize();
        hp[s].sanitize();
      }
    }

    bool hot() const
    {
      auto energy = [](const BiquadD1& b) {
        return std::fabs(b.x1) + std::fabs(b.x2) + std::fabs(b.y1) + std::fabs(b.y2);
      };
      float e = 0.f;
      for (int s = 0; s < 2; ++s)
        e += static_cast<float>(energy(lp[s]) + energy(hp[s]));
      return e > 1.0e-5f;
    }

    void split(float x, int stages, bool flipHp, float& low, float& high)
    {
      double lo = x;
      double hi = x;
      for (int s = 0; s < stages; ++s)
      {
        lo = lp[s].process(lo);
        hi = hp[s].process(hi);
      }
      low = static_cast<float>(lo);
      high = static_cast<float>(flipHp ? -hi : hi);
    }
  };

  void design()
  {
    if (sr_ <= 0.f || freq_ <= 0.f)
      return;
    if (stages_ == 1)
    {
      mid_.lp[0].setLpRbj(freq_, 0.5f, sr_);
      mid_.hp[0].setHpRbj(freq_, 0.5f, sr_);
      side_.lp[0].copyCoeffs(mid_.lp[0]);
      side_.hp[0].copyCoeffs(mid_.hp[0]);
      mid_.lp[1].setNull();
      mid_.hp[1].setNull();
      side_.lp[1].setNull();
      side_.hp[1].setNull();
      return;
    }
    const float q = 0.7071067811865476f;
    for (int s = 0; s < 2; ++s)
    {
      mid_.lp[s].setLpRbj(freq_, q, sr_);
      mid_.hp[s].setHpRbj(freq_, q, sr_);
      side_.lp[s].copyCoeffs(mid_.lp[s]);
      side_.hp[s].copyCoeffs(mid_.hp[s]);
    }
  }

  Arm mid_;
  Arm side_;
  float sr_ = 0.f;
  float freq_ = -1.f;
  int stages_ = 1;
  bool flipHp_ = true;
};

} // namespace Dsp
} // namespace calfNXT
