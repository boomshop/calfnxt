#pragma once

// One-pole gain smoother (~10 ms default), Calf gain_smoothing style.

#include "dsp_math.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Dsp {

class SmoothGain
{
public:
  void setSampleRate(float sr)
  {
    sampleRate_ = sr > 0.f ? sr : 44100.f;
    recalc();
  }

  void setInertiaMs(float ms)
  {
    inertiaMs_ = std::max(0.1f, ms);
    recalc();
  }

  void set(float target) { target_ = target; }

  void reset(float value = 0.f)
  {
    target_ = value;
    current_ = value;
  }

  float get()
  {
    current_ += (target_ - current_) * coeff_;
    sanitizeDenormal(current_);
    return current_;
  }

  void step() { (void)get(); }

  float current() const { return current_; }
  float target() const { return target_; }

  /** True when the smoother has reached its target (param ramps finished). */
  bool isSettled(float eps = 1.0e-6f) const
  {
    return std::fabs(target_ - current_) < eps;
  }

private:
  void recalc()
  {
    // ~63% approach over inertiaMs_
    const float n = sampleRate_ * inertiaMs_ * 0.001f;
    coeff_ = n > 1.f ? 1.f - std::exp(-1.f / n) : 1.f;
  }

  float sampleRate_ = 44100.f;
  float inertiaMs_ = 10.f;
  float coeff_ = 1.f;
  float target_ = 0.f;
  float current_ = 0.f;
};

} // namespace Dsp
} // namespace calfNXT
