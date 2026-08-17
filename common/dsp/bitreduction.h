#pragma once

// Port of Calf Studio Gear `dsp::bitreduction` (Christian Holschuh / Markus Schmidt).
// Quantization with optional soft step transitions ("anti-aliasing"), DC asymmetry,
// linear / logarithmic modes, and dry/wet morph (internally inverted vs GUI Mix).

#include "dsp_math.h"

#include <cmath>
#include <cstdint>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif
#ifndef M_PI_2
#define M_PI_2 1.57079632679489661923
#endif

namespace calfNXT {
namespace Dsp {

class BitReduction
{
public:
  void setSampleRate(uint32_t /*sr*/) {}

  /** @param bits continuous bit depth 1…16
   *  @param morphGui Mix 0…1 (internally stored as 1−morph)
   *  @param mode 0 = linear, 1 = logarithmic
   *  @param dc linear gain asymmetry (1 = symmetric)
   *  @param aa soft-step amount 0…1 (not a lowpass) */
  void setParams(float bits, float morphGui, int mode, float dc, float aa)
  {
    morph_ = 1.f - morphGui;
    dc_ = dc;
    aa_ = aa;
    mode_ = mode;
    coeff_ = std::pow(2.f, bits) - 1.f;
    sqr_ = std::sqrt(coeff_ * 0.5f);
    aa1_ = (1.f - aa_) * 0.5f;
  }

  float process(float in) const { return waveshape(in); }

  float waveshape(float in) const
  {
    in = addDc(in, dc_);

    double y = 0.0;
    double k = 0.0;

    switch (mode_)
    {
      case 1: // logarithmic
        y = static_cast<double>(sqr_) * std::log(std::fabs(static_cast<double>(in)))
            + static_cast<double>(sqr_) * static_cast<double>(sqr_);
        k = std::round(y);
        if (in == 0.f)
        {
          k = 0.0;
        }
        else if (k - aa1_ <= y && y <= k + aa1_)
        {
          k = (in / std::fabs(in))
              * std::exp(k / static_cast<double>(sqr_) - static_cast<double>(sqr_));
        }
        else if (y > k + aa1_)
        {
          const double a = std::exp(k / sqr_ - sqr_);
          const double b = std::exp((k + 1.0) / sqr_ - sqr_);
          k = (in / std::fabs(in))
              * (a
                 + (b - a) * 0.5
                     * (std::sin((std::fabs(y - k) - aa1_) / aa_ * M_PI - M_PI_2) + 1.0));
        }
        else
        {
          const double a = std::exp(k / sqr_ - sqr_);
          const double b = std::exp((k - 1.0) / sqr_ - sqr_);
          k = (in / std::fabs(in))
              * (a
                 - (a - b) * 0.5
                     * (std::sin((std::fabs(y - k) - aa1_) / aa_ * M_PI - M_PI_2) + 1.0));
        }
        break;

      default: // linear
        y = static_cast<double>(in) * static_cast<double>(coeff_);
        k = std::round(y);
        if (k - aa1_ <= y && y <= k + aa1_)
        {
          k /= static_cast<double>(coeff_);
        }
        else if (y > k + aa1_)
        {
          k = k / coeff_
              + ((k + 1.0) / coeff_ - k / coeff_) * 0.5
                    * (std::sin(M_PI * (std::fabs(y - k) - aa1_) / aa_ - M_PI_2) + 1.0);
        }
        else
        {
          k = k / coeff_
              - (k / coeff_ - (k - 1.0) / coeff_) * 0.5
                    * (std::sin(M_PI * (std::fabs(y - k) - aa1_) / aa_ - M_PI_2) + 1.0);
        }
        break;
    }

    k += (static_cast<double>(in) - k) * static_cast<double>(morph_);
    return removeDc(static_cast<float>(k), dc_);
  }

private:
  static float addDc(float s, float dc)
  {
    return s > 0.f ? s * dc : s / dc;
  }

  static float removeDc(float s, float dc)
  {
    return s > 0.f ? s / dc : s * dc;
  }

  float morph_ = 0.f;
  float coeff_ = 1.f;
  float dc_ = 1.f;
  float sqr_ = 0.f;
  float aa_ = 0.f;
  float aa1_ = 0.5f;
  int mode_ = 0;
};

} // namespace Dsp
} // namespace calfNXT
