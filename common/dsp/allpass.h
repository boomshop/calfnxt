#pragma once

// First-order allpass building blocks for stereo decorrelation.

#include <algorithm>
#include <cmath>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace calfNXT {
namespace Dsp {

/** y[n] = a*(x[n] - y[n-1]) + x[n-1] */
class Allpass1
{
public:
  void reset()
  {
    x1_ = 0.0;
    y1_ = 0.0;
  }

  void setCoef(double a)
  {
    a_ = std::clamp(a, -0.999, 0.999);
  }

  float process(float x)
  {
    const double xd = static_cast<double>(x);
    const double y = a_ * (xd - y1_) + x1_;
    x1_ = xd;
    y1_ = y;
    return static_cast<float>(y);
  }

private:
  double a_ = 0.0;
  double x1_ = 0.0;
  double y1_ = 0.0;
};

/** Cascade of first-order allpasses (max 8). */
class AllpassChain
{
public:
  static constexpr int kMaxStages = 8;

  void reset()
  {
    for (auto& s : stages_)
      s.reset();
  }

  void setStages(int n)
  {
    stagesN_ = std::clamp(n, 1, kMaxStages);
  }

  /** Spread 0…1: 0 = identical chains (phase-only), 1 = L/R use complementary coeffs. */
  void setSpread(float spread, bool invert)
  {
    static constexpr double kA[kMaxStages] = {
      0.32, -0.48, 0.61, -0.27, 0.73, -0.55, 0.18, -0.67,
    };
    static constexpr double kB[kMaxStages] = {
      -0.38, 0.52, -0.58, 0.41, -0.69, 0.29, -0.47, 0.63,
    };
    const double t = static_cast<double>(std::clamp(spread, 0.f, 1.f));
    for (int i = 0; i < kMaxStages; ++i)
    {
      // Shared baseline kA; invert chain morphs toward kB with spread.
      const double shared = kA[i];
      const double target = invert ? kB[i] : kA[i];
      stages_[i].setCoef(shared * (1.0 - t) + target * t);
    }
  }

  float process(float x)
  {
    float y = x;
    for (int i = 0; i < stagesN_; ++i)
      y = stages_[i].process(y);
    return y;
  }

private:
  Allpass1 stages_[kMaxStages];
  int stagesN_ = 4;
};

} // namespace Dsp
} // namespace calfNXT
