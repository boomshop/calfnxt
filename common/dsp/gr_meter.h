#pragma once

// Gain-reduction meter ballistics shared by dynamics plugins.
// Instant attack (most reduction), linear fall toward 0 dB at ~20 dB/s
// (same idea as AUX LevelMeter falling=20 / 1000 ms).

#include "gain_util.h"

#include <algorithm>
#include <atomic>
#include <cmath>

namespace calfNXT {
namespace Dsp {

class GrMeter
{
public:
  void reset(float sampleRate)
  {
    const float sr = sampleRate > 0.f ? sampleRate : 44100.f;
    fallDbPerSample_ = 20.f / sr;
    meterDb_ = 0.f;
    pub_.store(0.f, std::memory_order_relaxed);
  }

  /** Feed linear GR (1 = none, →0 = more reduction). Audio thread only. */
  void process(float grLin)
  {
    float grAmt = -linToDbSafe(grLin);
    if (!(grAmt > 0.f) || !std::isfinite(grAmt))
      grAmt = 0.f;
    else if (grAmt > 60.f)
      grAmt = 60.f;

    if (grAmt > meterDb_)
      meterDb_ = grAmt;
    else
      meterDb_ = std::max(0.f, meterDb_ - fallDbPerSample_);

    pub_.store(meterDb_, std::memory_order_relaxed);
  }

  /** ≤0 dB for viz (no reset on poll). */
  float takeDb() const
  {
    return -pub_.load(std::memory_order_acquire);
  }

private:
  static float linToDbSafe(float lin)
  {
    if (!(lin > 1.0e-12f))
      return -96.f;
    return 20.f * std::log10(lin);
  }

  float meterDb_ = 0.f;
  float fallDbPerSample_ = 0.f;
  std::atomic<float> pub_ {0.f};
};

} // namespace Dsp
} // namespace calfNXT
