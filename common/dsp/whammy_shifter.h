#pragma once

// Dual-head delay-line pitch shifter (classic pitch-pedal topology).
// No pitch tracker: the whole waveform is resampled at a fixed ratio.
// Two overlapping reads with a raised-cosine crossfade hide splice clicks.
// Linked stereo (shared delay) so the image does not smear.

#include "dsp_math.h"

#include <algorithm>
#include <cmath>
#include <cstring>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace calfNXT {
namespace Dsp {

class WhammyShifter
{
public:
  static constexpr int kSize = 65536;
  static constexpr int kMinDelay = 4;

  void reset()
  {
    std::memset(l_, 0, sizeof l_);
    std::memset(r_, 0, sizeof r_);
    w_ = 0;
    delay_ = float(lat_);
    toneL_ = toneR_ = 0.f;
    parked_ = true;
  }

  /** Process Left only and copy to Right (halves Hermite reads). */
  void setMono(bool m) { mono_ = m; }

  /** Grain length in samples (Fast/Normal/Smooth/Studio). Parks the read at centre. */
  void setGrain(int samples)
  {
    grain_ = std::clamp(samples, 128, kSize / 2 - 16);
    int ring = 256;
    const int need = grain_ + 32;
    while (ring < need)
      ring <<= 1;
    if (ring > kSize)
      ring = kSize;
    mask_ = ring - 1;
    lat_ = kMinDelay + grain_ / 2;
    span_ = float(grain_);
    dMin_ = float(kMinDelay);
    dMax_ = dMin_ + span_;
    invSpan_ = 1.f / span_;
    delay_ = float(lat_);
    parked_ = true;
    w_ = 0;
  }

  int grain() const { return grain_; }

  /** PDC delay: centre of the grain (unity = a pure delay of this many samples). */
  int latency() const { return lat_; }

  /** One-pole Tone coeff — call once per block, not per sample. */
  void setTone(float tone, float sr)
  {
    tone = std::clamp(tone, 0.f, 1.f);
    sr = std::max(sr, 1.f);
    if (tone == tone_ && sr == sr_)
      return;
    tone_ = tone;
    sr_ = sr;
    const float fc = 900.f * std::pow(18000.f / 900.f, tone);
    toneA_ = 1.f - std::exp(-2.f * float(M_PI) * fc / sr);
  }

  /**
   * `ratio` = 2^(semitones/12). `pitchAbs` = |smoothed pitch| in st (park zone).
   * `mix` 0…1 dry→wet; dry is the latency-matched tap (no extra comb from PDC).
   * Bypass outputs that same delayed dry so host latency does not jump.
   */
  void process(float inL, float inR, float ratio, float pitchAbs, float mix, bool bypass,
               float& outL, float& outR)
  {
    l_[w_] = inL;
    r_[w_] = mono_ ? inL : inR;

    const float dryL = l_[(w_ - lat_) & mask_];
    const float dryR = mono_ ? dryL : r_[(w_ - lat_) & mask_];

    // Park at a single tap around unison so Mix / return-to-zero is not a comb.
    const float shifterAmt =
      pitchAbs <= 0.02f ? 0.f : std::min(1.f, (pitchAbs - 0.02f) / 0.15f);

    const bool wantWet = !bypass && mix > 0.f;
    float wetL = dryL;
    float wetR = dryR;
    if (shifterAmt > 0.f)
    {
      parked_ = false;
      ratio = std::clamp(ratio, 0.24f, 4.1f);
      delay_ += 1.f - ratio;
      if (delay_ >= dMax_)
        delay_ -= span_;
      if (delay_ < dMin_)
        delay_ += span_;

      if (wantWet)
      {
        float d1 = delay_ + span_ * 0.5f;
        if (d1 >= dMax_)
          d1 -= span_;

        float aL = 0.f, aR = 0.f, bL = 0.f, bR = 0.f;
        if (mono_)
        {
          readHermiteL(delay_, aL);
          readHermiteL(d1, bL);
          aR = aL;
          bR = bL;
        }
        else
        {
          readHermite(delay_, aL, aR);
          readHermite(d1, bL, bR);
        }

        const float c = sineTurns((delay_ - dMin_) * invSpan_ + 0.25f);
        const float w0 = 0.5f * (1.f - c);
        const float w1 = 0.5f * (1.f + c);
        wetL = aL * w0 + bL * w1;
        wetR = mono_ ? wetL : (aR * w0 + bR * w1);

        if (shifterAmt < 1.f)
        {
          wetL = dryL + (wetL - dryL) * shifterAmt;
          wetR = mono_ ? wetL : (dryR + (wetR - dryR) * shifterAmt);
        }
      }
    }
    else if (!parked_)
    {
      delay_ = float(lat_);
      parked_ = true;
    }

    w_ = (w_ + 1) & mask_;

    if (bypass || mix <= 0.f)
    {
      outL = dryL;
      outR = dryR;
      return;
    }

    wetL = toneLp(wetL, toneL_);
    if (mono_)
    {
      toneR_ = toneL_;
      wetR = wetL;
    }
    else
      wetR = toneLp(wetR, toneR_);

    if (mix >= 1.f)
    {
      outL = wetL;
      outR = wetR;
      return;
    }
    const float dryAmt = 1.f - mix;
    outL = wetL * mix + dryL * dryAmt;
    outR = mono_ ? outL : (wetR * mix + dryR * dryAmt);
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
    const int i = static_cast<int>(delay);
    const float frac = delay - float(i);
    const int i0 = (w_ - (i + 1)) & mask_;
    const int i1 = (w_ - i) & mask_;
    const int i2 = (w_ - (i - 1)) & mask_;
    const int i3 = (w_ - (i - 2)) & mask_;
    oL = hermite4(l_[i0], l_[i1], l_[i2], l_[i3], frac);
    oR = hermite4(r_[i0], r_[i1], r_[i2], r_[i3], frac);
  }

  void readHermiteL(float delay, float& oL) const
  {
    const int i = static_cast<int>(delay);
    const float frac = delay - float(i);
    const int i0 = (w_ - (i + 1)) & mask_;
    const int i1 = (w_ - i) & mask_;
    const int i2 = (w_ - (i - 1)) & mask_;
    const int i3 = (w_ - (i - 2)) & mask_;
    oL = hermite4(l_[i0], l_[i1], l_[i2], l_[i3], frac);
  }

  float toneLp(float x, float& y) const
  {
    y += toneA_ * (x - y);
    sanitizeDenormal(y);
    return y;
  }

  float l_[kSize] {};
  float r_[kSize] {};
  int w_ = 0;
  int mask_ = 1023;
  int grain_ = 512;
  int lat_ = kMinDelay + 256;
  float span_ = 512.f;
  float dMin_ = float(kMinDelay);
  float dMax_ = float(kMinDelay + 512);
  float invSpan_ = 1.f / 512.f;
  float delay_ = float(kMinDelay + 256);
  float tone_ = -1.f;
  float sr_ = 0.f;
  float toneA_ = 1.f;
  float toneL_ = 0.f;
  float toneR_ = 0.f;
  bool parked_ = true;
  bool mono_ = false;
};

} // namespace Dsp
} // namespace calfNXT
