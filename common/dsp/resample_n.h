#pragma once

// Integer-factor oversampler (zero-stuff + LP / LP + decimate).
// Fixed vs classic Calf resampleN:
// - cascade filters on the running sample (not the raw input each stage)
// - zero-stuff interpolated slots (process 0, not the source sample again)
// - initialize *all* downsampler stages including [0]
// - clear filter state on factor/rate change (avoids crackles)
// - ×factor gain on the non-zero upsample tap (zero-stuff energy)

#include "biquad.h"
#include "dsp_math.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace calfNXT {
namespace Dsp {

class ResampleN
{
public:
  static constexpr int kMaxFactor = 16;
  static constexpr int kMaxFilters = 4;

  void setParams(uint32_t sr, int factor, int filters = 2)
  {
    srate_ = std::max(2u, sr);
    factor_ = std::clamp(factor, 1, kMaxFactor);
    filters_ = std::clamp(filters, 1, kMaxFilters);

    // Cut near host Nyquist, designed at oversampled rate.
    const double osRate = static_cast<double>(srate_) * static_cast<double>(factor_);
    const double fc = std::max(25000.0, static_cast<double>(srate_) * 0.5);
    up_[0].setLpRbj(static_cast<float>(fc), 0.8f, static_cast<float>(osRate));
    down_[0].copyCoeffs(up_[0]);
    for (int i = 1; i < filters_; ++i)
    {
      up_[i].copyCoeffs(up_[0]);
      down_[i].copyCoeffs(up_[0]);
    }
    reset();
  }

  void reset()
  {
    for (int i = 0; i < kMaxFilters; ++i)
    {
      up_[i].reset();
      down_[i].reset();
    }
    for (int i = 0; i < kMaxFactor; ++i)
      tmp_[i] = 0.0;
  }

  /** Produce `factor()` oversampled samples from one host sample. */
  double* upsample(double sample)
  {
    if (factor_ <= 1)
    {
      tmp_[0] = sample;
      return tmp_;
    }

    const double gain = static_cast<double>(factor_);
    for (int i = 0; i < factor_; ++i)
    {
      double x = (i == 0) ? sample * gain : 0.0;
      for (int f = 0; f < filters_; ++f)
        x = up_[f].process(x);
      tmp_[i] = x;
    }
    return tmp_;
  }

  /** Filter oversampled block and return the decimated (first) sample. */
  double downsample(double* samples)
  {
    if (factor_ <= 1)
      return samples[0];

    for (int i = 0; i < factor_; ++i)
    {
      double x = samples[i];
      for (int f = 0; f < filters_; ++f)
        x = down_[f].process(x);
      samples[i] = x;
    }
    return samples[0];
  }

  int factor() const { return factor_; }

  void sanitize()
  {
    for (int i = 0; i < filters_; ++i)
    {
      up_[i].sanitize();
      down_[i].sanitize();
    }
  }

private:
  uint32_t srate_ = 44100;
  int factor_ = 1;
  int filters_ = 2;
  double tmp_[kMaxFactor] {};
  BiquadD1 up_[kMaxFilters];
  BiquadD1 down_[kMaxFilters];
};

} // namespace Dsp
} // namespace calfNXT
