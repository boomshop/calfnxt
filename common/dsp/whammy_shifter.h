#pragma once

// Dual-head delay-line pitch shifter (classic pitch-pedal topology).
// No pitch tracker: the whole waveform is resampled at a fixed ratio.
// Two overlapping reads with a raised-cosine crossfade hide splice clicks.
// Linked stereo (shared delay) so the image does not smear.

#include "dsp_math.h"

#include <algorithm>
#include <cmath>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace calfNXT {
namespace Dsp {

class WhammyShifter
{
public:
  static constexpr int kSize = 65536;
  static constexpr int kMask = kSize - 1;
  static constexpr int kMinDelay = 4;

  void reset()
  {
    for (int i = 0; i < kSize; ++i)
    {
      l_[i] = 0.f;
      r_[i] = 0.f;
    }
    w_ = 0;
    delay_ = float(kMinDelay + grain_ / 2);
    toneL_ = toneR_ = 0.f;
    parked_ = true;
  }

  /** Grain length in samples (Fast/Normal/Smooth/Studio). Parks the read at centre. */
  void setGrain(int samples)
  {
    grain_ = std::clamp(samples, 128, kSize / 2 - 16);
    delay_ = float(kMinDelay + grain_ / 2);
    parked_ = true;
  }

  int grain() const { return grain_; }

  /** PDC delay: centre of the grain (unity = a pure delay of this many samples). */
  int latency() const { return kMinDelay + grain_ / 2; }

  /**
   * `ratio` = 2^(semitones/12). `tone` 0…1 (dark…bright) on the wet path only.
   * `mix` 0…1 dry→wet; dry is the latency-matched tap (no extra comb from PDC).
   * Bypass outputs that same delayed dry so host latency does not jump.
   */
  void process(float inL, float inR, float ratio, float tone, float mix, bool bypass,
               float sr, float& outL, float& outR)
  {
    l_[w_] = inL;
    r_[w_] = inR;

    const int lat = latency();
    const float dryL = l_[(w_ - lat) & kMask];
    const float dryR = r_[(w_ - lat) & kMask];

    ratio = std::clamp(ratio, 0.24f, 4.1f);
    const float absSt = std::fabs(12.f * std::log2(ratio));
    // Park at a single tap around unison so Mix / return-to-zero is not a comb.
    const float shifterAmt =
      absSt <= 0.02f ? 0.f : std::min(1.f, (absSt - 0.02f) / 0.15f);

    float wetL = dryL;
    float wetR = dryR;
    if (shifterAmt > 0.f)
    {
      parked_ = false;
      delay_ += 1.f - ratio;
      const float span = float(grain_);
      const float dMin = float(kMinDelay);
      const float dMax = dMin + span;
      while (delay_ >= dMax)
        delay_ -= span;
      while (delay_ < dMin)
        delay_ += span;

      float d1 = delay_ + span * 0.5f;
      if (d1 >= dMax)
        d1 -= span;

      float aL = 0.f, aR = 0.f, bL = 0.f, bR = 0.f;
      readHermite(delay_, aL, aR);
      readHermite(d1, bL, bR);

      const float t = (delay_ - dMin) / span;
      const float c = std::cos(2.f * float(M_PI) * t);
      const float w0 = 0.5f * (1.f - c);
      const float w1 = 0.5f * (1.f + c);
      wetL = aL * w0 + bL * w1;
      wetR = aR * w0 + bR * w1;

      if (shifterAmt < 1.f)
      {
        wetL = dryL + (wetL - dryL) * shifterAmt;
        wetR = dryR + (wetR - dryR) * shifterAmt;
      }
    }
    else if (!parked_)
    {
      delay_ = float(lat);
      parked_ = true;
    }

    wetL = toneLp(wetL, toneL_, tone, sr);
    wetR = toneLp(wetR, toneR_, tone, sr);

    w_ = (w_ + 1) & kMask;

    if (bypass)
    {
      outL = dryL;
      outR = dryR;
      return;
    }

    mix = std::clamp(mix, 0.f, 1.f);
    outL = wetL * mix + dryL * (1.f - mix);
    outR = wetR * mix + dryR * (1.f - mix);
  }

private:
  static float hermite4(float y0, float y1, float y2, float y3, float frac)
  {
    const float c1 = 0.5f * (y2 - y0);
    const float c2 = y0 - 2.5f * y1 + 2.f * y2 - 0.5f * y3;
    const float c3 = 0.5f * (y3 - y0) + 1.5f * (y1 - y2);
    return ((c3 * frac + c2) * frac + c1) * frac + y1;
  }

  void readHermite(float delay, float& oL, float& oR) const
  {
    delay = std::clamp(delay, 2.f, float(kSize - 4));
    const int i = static_cast<int>(delay);
    const float frac = delay - float(i);
    const int i0 = (w_ - (i + 1)) & kMask;
    const int i1 = (w_ - i) & kMask;
    const int i2 = (w_ - (i - 1)) & kMask;
    const int i3 = (w_ - (i - 2)) & kMask;
    oL = hermite4(l_[i0], l_[i1], l_[i2], l_[i3], frac);
    oR = hermite4(r_[i0], r_[i1], r_[i2], r_[i3], frac);
  }

  static float toneLp(float x, float& y, float tone, float sr)
  {
    tone = std::clamp(tone, 0.f, 1.f);
    const float fc = 900.f * std::pow(18000.f / 900.f, tone);
    const float a = 1.f - std::exp(-2.f * float(M_PI) * fc / std::max(sr, 1.f));
    y += a * (x - y);
    sanitizeDenormal(y);
    return y;
  }

  float l_[kSize] {};
  float r_[kSize] {};
  int w_ = 0;
  int grain_ = 512;
  float delay_ = float(kMinDelay + 256);
  float toneL_ = 0.f;
  float toneR_ = 0.f;
  bool parked_ = true;
};

} // namespace Dsp
} // namespace calfNXT
