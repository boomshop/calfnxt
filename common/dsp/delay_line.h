#pragma once

// Power-of-two ring delay with integer and fractional (lerp) reads.

#include "dsp_math.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace calfNXT {
namespace Dsp {

template <int N>
class DelayLine
{
  static_assert((N & (N - 1)) == 0, "DelayLine size must be power of two");

public:
  static constexpr int kSize = N;
  static constexpr int kMask = N - 1;

  void reset()
  {
    for (int i = 0; i < N; ++i)
      buf_[i] = 0.f;
    w_ = 0;
  }

  void write(float x)
  {
    buf_[w_] = x;
    w_ = (w_ + 1) & kMask;
  }

  /** Read sample delayed by `delay` samples (1 … N-1). */
  float read(int delay) const
  {
    delay = std::clamp(delay, 1, N - 1);
    return buf_[(w_ - delay) & kMask];
  }

  /** Fractional delay in samples (lerp). */
  float readLerp(float delay) const
  {
    delay = std::clamp(delay, 1.f, float(N - 2));
    const int i0 = static_cast<int>(delay);
    const float frac = delay - float(i0);
    const float a = read(i0);
    const float b = read(i0 + 1);
    return a + (b - a) * frac;
  }

  /**
   * Comb allpass: write feedback comb, return allpass output.
   * `delayFix16` = delay_samples << 16 (fractional in low 16 bits).
   */
  float processAllpassCombFix16(float in, uint32_t delayFix16, float fb)
  {
    const int di = int(delayFix16 >> 16);
    const float frac = float(delayFix16 & 0xffffu) * (1.f / 65536.f);
    const int d0 = std::clamp(di, 1, N - 2);
    const float old = read(d0) + (read(d0 + 1) - read(d0)) * frac;
    float cur = in + fb * old;
    sanitizeDenormal(cur);
    write(cur);
    float out = old - fb * cur;
    sanitizeDenormal(out);
    return out;
  }

private:
  float buf_[N] {};
  int w_ = 0;
};

/** Stereo integer predelay (shared write index). */
template <int N>
class StereoPredelay
{
  static_assert((N & (N - 1)) == 0, "StereoPredelay size must be power of two");

public:
  void reset()
  {
    for (int i = 0; i < N; ++i)
    {
      l_[i] = 0.f;
      r_[i] = 0.f;
    }
    w_ = 0;
  }

  void process(float inL, float inR, int delaySamples, float& outL, float& outR)
  {
    delaySamples = std::clamp(delaySamples, 1, N - 1);
    l_[w_] = inL;
    r_[w_] = inR;
    const int ridx = (w_ - delaySamples) & (N - 1);
    outL = l_[ridx];
    outR = r_[ridx];
    w_ = (w_ + 1) & (N - 1);
  }

private:
  float l_[N] {};
  float r_[N] {};
  int w_ = 0;
};

} // namespace Dsp
} // namespace calfNXT
