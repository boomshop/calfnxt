#pragma once

// Wet stereo widening: Mid/Side, Haas, Allpass decorrelation.

#include "allpass.h"
#include "delay_line.h"
#include "dsp_math.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Dsp {

class ReverbWidth
{
public:
  enum Mode : int
  {
    ModeDry = 0, // no widening (wet stereo as produced)
    ModeMidSide = 1,
    ModeHaas = 2,
    ModeDecorrelate = 3,
  };

  void setup(float sr)
  {
    sr_ = sr > 1.f ? sr : 44100.f;
    chainL_.setStages(4);
    chainR_.setStages(4);
    decorSpread_ = -1.f;
    updateHaasDelay();
    updateDecorSpread();
  }

  void reset()
  {
    haasL_.reset();
    haasR_.reset();
    chainL_.reset();
    chainR_.reset();
  }

  void setMode(Mode m) { mode_ = m; }

  /** width: 0 = mono/narrow, 1 = neutral, 2 = extra wide. */
  void setWidth(float w)
  {
    w = std::clamp(w, 0.f, 2.f);
    if (std::fabs(w - width_) < 1.0e-5f)
      return;
    width_ = w;
    updateHaasDelay();
    updateDecorSpread();
  }

  void process(float& l, float& r)
  {
    switch (mode_)
    {
    case ModeDry:
      break;
    case ModeHaas:
      processHaas(l, r);
      break;
    case ModeDecorrelate:
      processDecorrelate(l, r);
      break;
    case ModeMidSide:
    default:
      processMs(l, r);
      break;
    }
  }

private:
  void updateHaasDelay()
  {
    const float t = width_ - 1.f;
    const float ms = std::abs(t) * 5.f;
    haasDelay_ = std::max(1, int(ms * 0.001f * sr_ + 0.5f));
    haasRightLate_ = t >= 0.f;
  }

  void updateDecorSpread()
  {
    const float spread = std::clamp(std::abs(width_ - 1.f), 0.f, 1.f);
    if (std::fabs(spread - decorSpread_) < 1.0e-5f)
      return;
    decorSpread_ = spread;
    // No floor: width≈1 must be a true bypass (old 0.35+ mix always
    // dry/wet-combed the mid and sounded duller than M/S or Haas).
    decorMix_ = spread;
    chainL_.setSpread(spread, false);
    chainR_.setSpread(spread, true);
  }

  void processMs(float& l, float& r)
  {
    float mid = 0.5f * (l + r);
    float side = 0.5f * (l - r);
    // Keep some bass in mid for mono compatibility
    side *= width_;
    l = mid + side;
    r = mid - side;
  }

  void processHaas(float& l, float& r)
  {
    // width 1 → 0 ms; width 2 → +5 ms on R; width 0 → +5 ms on L (narrow toward one side)
    haasL_.write(l);
    haasR_.write(r);
    float oL = l;
    float oR = r;
    if (haasRightLate_)
    {
      oL = haasL_.read(1);
      oR = haasR_.read(haasDelay_);
    }
    else
    {
      oL = haasL_.read(haasDelay_);
      oR = haasR_.read(1);
    }
    // Slight M/S push with width
    float mid = 0.5f * (oL + oR);
    float side = 0.5f * (oL - oR) * (0.85f + 0.35f * width_);
    l = mid + side;
    r = mid - side;
  }

  void processDecorrelate(float& l, float& r)
  {
    // Keep dry mid (avoids dry/wet allpass comb dulling). Decorrelate into
    // the side only; width scales the resulting image.
    const float mid = 0.5f * (l + r);
    const float sideIn = 0.5f * (l - r);
    const float yl = chainL_.process(l);
    const float yr = chainR_.process(r);
    const float sideDec = 0.5f * (yl - yr);
    const float side =
      (sideIn + (sideDec - sideIn) * decorMix_) * width_;
    l = mid + side;
    r = mid - side;
  }

  Mode mode_ = ModeDry;
  float width_ = 1.f;
  float sr_ = 44100.f;
  int haasDelay_ = 1;
  bool haasRightLate_ = true;
  float decorSpread_ = -1.f;
  float decorMix_ = 0.35f;
  DelayLine<1024> haasL_, haasR_;
  AllpassChain chainL_, chainR_;
};

} // namespace Dsp
} // namespace calfNXT
