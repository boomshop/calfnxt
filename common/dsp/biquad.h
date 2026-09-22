#pragma once

// Based on Calf Studio Gear biquad.h (RBJ cookbook / Krzysztof Foltman).
// Ported for calfNXT — Direct Form I preferred when coefficients change often.

#include "dsp_math.h"

#include <cmath>
#include <complex>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace calfNXT {
namespace Dsp {

/** Two-pole two-zero coefficients (RBJ / Zoelzer helpers). */
class BiquadCoeffs
{
public:
  double a0 = 1.0;
  double a1 = 0.0;
  double a2 = 0.0;
  double b1 = 0.0;
  double b2 = 0.0;

  void setNull()
  {
    a0 = 1.0;
    a1 = a2 = b1 = b2 = 0.0;
  }

  void setLpRbj(float fc, float q, float sr, float gain = 1.0f)
  {
    const double omega = 2.0 * M_PI * fc / sr;
    const double sn = std::sin(omega);
    const double cs = std::cos(omega);
    const double alpha = sn / (2.0 * q);
    const double inv = 1.0 / (1.0 + alpha);
    a2 = a0 = gain * inv * (1.0 - cs) * 0.5;
    a1 = a0 + a0;
    b1 = -2.0 * cs * inv;
    b2 = (1.0 - alpha) * inv;
  }

  void setHpRbj(float fc, float q, float sr, float gain = 1.0f)
  {
    const double omega = 2.0 * M_PI * fc / sr;
    const double sn = std::sin(omega);
    const double cs = std::cos(omega);
    const double alpha = sn / (2.0 * q);
    const double inv = 1.0 / (1.0 + alpha);
    a0 = gain * inv * (1.0 + cs) * 0.5;
    a1 = -2.0 * a0;
    a2 = a0;
    b1 = -2.0 * cs * inv;
    b2 = (1.0 - alpha) * inv;
  }

  /** First-order (6 dB/oct) low-pass — bilinear, unity DC. */
  void setLp1(float fc, float sr)
  {
    const double K = std::tan(M_PI * static_cast<double>(fc) / static_cast<double>(sr));
    const double inv = 1.0 / (1.0 + K);
    a0 = a1 = K * inv;
    a2 = 0.0;
    b1 = (K - 1.0) * inv;
    b2 = 0.0;
  }

  /** First-order (6 dB/oct) high-pass — bilinear, unity Nyquist. */
  void setHp1(float fc, float sr)
  {
    const double K = std::tan(M_PI * static_cast<double>(fc) / static_cast<double>(sr));
    const double inv = 1.0 / (1.0 + K);
    a0 = inv;
    a1 = -inv;
    a2 = 0.0;
    b1 = (K - 1.0) * inv;
    b2 = 0.0;
  }

  /** Magnitude response in dB at `freqHz` (sample rate `sr`). */
  float responseDb(float freqHz, float sr) const
  {
    const double w =
      2.0 * M_PI * static_cast<double>(freqHz) / static_cast<double>(sr);
    const double cw = std::cos(w);
    const double sw = std::sin(w);
    const double c2 = std::cos(2.0 * w);
    const double s2 = std::sin(2.0 * w);
    const double nr = a0 + a1 * cw + a2 * c2;
    const double ni = -(a1 * sw + a2 * s2);
    const double dr = 1.0 + b1 * cw + b2 * c2;
    const double di = -(b1 * sw + b2 * s2);
    const double den = dr * dr + di * di;
    if (!(den > 1.0e-30))
      return -240.f;
    const double mag2 = (nr * nr + ni * ni) / den;
    if (!(mag2 > 1.0e-30))
      return -240.f;
    return static_cast<float>(10.0 * std::log10(mag2));
  }

  void setBpRbj(double fc, double q, double sr, double gain = 1.0)
  {
    const double omega = 2.0 * M_PI * fc / sr;
    const double sn = std::sin(omega);
    const double cs = std::cos(omega);
    const double alpha = sn / (2.0 * q);
    const double inv = 1.0 / (1.0 + alpha);
    a0 = gain * inv * alpha;
    a1 = 0.0;
    a2 = -gain * inv * alpha;
    b1 = -2.0 * cs * inv;
    b2 = (1.0 - alpha) * inv;
  }

  /** RBJ notch / band-reject. */
  void setBrRbj(double fc, double q, double sr, double gain = 1.0)
  {
    const double omega = 2.0 * M_PI * fc / sr;
    const double sn = std::sin(omega);
    const double cs = std::cos(omega);
    const double alpha = sn / (2.0 * q);
    const double inv = 1.0 / (1.0 + alpha);
    a0 = gain * inv;
    a1 = -gain * inv * 2.0 * cs;
    a2 = gain * inv;
    b1 = -2.0 * cs * inv;
    b2 = (1.0 - alpha) * inv;
  }

  /** Calf-style allpass (bilinear). poleR typically 1. */
  void setAllpass(float freq, float poleR, float sr)
  {
    float f = freq;
    if (f > sr * 0.49f)
      f = static_cast<float>(sr * 0.49);
    const double a = std::tan(M_PI * f / sr);
    const double q = poleR;
    const double aa0 = a * a + q * q;
    const double aa1 = -2.0 * a;
    const double aa2 = 1.0;
    const double ab0 = aa0;
    const double ab1 = 2.0 * a;
    const double ab2 = 1.0;
    const double inv = 1.0 / (ab0 + ab1 + ab2);
    a0 = (aa0 + aa1 + aa2) * inv;
    a1 = 2.0 * (aa0 - aa2) * inv;
    a2 = (aa0 - aa1 + aa2) * inv;
    b1 = 2.0 * (ab0 - ab2) * inv;
    b2 = (ab0 - ab1 + ab2) * inv;
  }

  /** peak: linear gain (1 = unity). */
  void setPeakeqRbj(double freq, double q, double peak, double sr)
  {
    const double A = std::sqrt(peak);
    const double w0 = freq * 2.0 * M_PI / sr;
    const double alpha = std::sin(w0) / (2.0 * q);
    const double ib0 = 1.0 / (1.0 + alpha / A);
    a1 = b1 = -2.0 * std::cos(w0) * ib0;
    a0 = ib0 * (1.0 + alpha * A);
    a2 = ib0 * (1.0 - alpha * A);
    b2 = ib0 * (1.0 - alpha / A);
  }

  void setLowshelfRbj(float freq, float q, float peak, float sr)
  {
    const double A = std::sqrt(peak);
    const double w0 = freq * 2.0 * M_PI / sr;
    const double alpha = std::sin(w0) / (2.0 * q);
    const double cw0 = std::cos(w0);
    const double tmp = 2.0 * std::sqrt(A) * alpha;
    a0 = A * ((A + 1.0) - (A - 1.0) * cw0 + tmp);
    a1 = 2.0 * A * ((A - 1.0) - (A + 1.0) * cw0);
    a2 = A * ((A + 1.0) - (A - 1.0) * cw0 - tmp);
    double b0 = (A + 1.0) + (A - 1.0) * cw0 + tmp;
    b1 = -2.0 * ((A - 1.0) + (A + 1.0) * cw0);
    b2 = (A + 1.0) + (A - 1.0) * cw0 - tmp;
    const double ib0 = 1.0 / b0;
    b1 *= ib0;
    b2 *= ib0;
    a0 *= ib0;
    a1 *= ib0;
    a2 *= ib0;
  }

  void setHighshelfRbj(float freq, float q, float peak, float sr)
  {
    const double A = std::sqrt(peak);
    const double w0 = freq * 2.0 * M_PI / sr;
    const double alpha = std::sin(w0) / (2.0 * q);
    const double cw0 = std::cos(w0);
    const double tmp = 2.0 * std::sqrt(A) * alpha;
    a0 = A * ((A + 1.0) + (A - 1.0) * cw0 + tmp);
    a1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * cw0);
    a2 = A * ((A + 1.0) + (A - 1.0) * cw0 - tmp);
    double b0 = (A + 1.0) - (A - 1.0) * cw0 + tmp;
    b1 = 2.0 * ((A - 1.0) - (A + 1.0) * cw0);
    b2 = (A + 1.0) - (A - 1.0) * cw0 - tmp;
    const double ib0 = 1.0 / b0;
    b1 *= ib0;
    b2 *= ib0;
    a0 *= ib0;
    a1 *= ib0;
    a2 *= ib0;
  }

  void copyCoeffs(const BiquadCoeffs& src)
  {
    a0 = src.a0;
    a1 = src.a1;
    a2 = src.a2;
    b1 = src.b1;
    b2 = src.b2;
  }
};

/** Direct Form I — preferred when coefficients change mid-stream. */
struct BiquadD1 : public BiquadCoeffs
{
  double x1 = 0.0;
  double x2 = 0.0;
  double y1 = 0.0;
  double y2 = 0.0;

  double process(double in)
  {
    const double out = in * a0 + x1 * a1 + x2 * a2 - y1 * b1 - y2 * b2;
    x2 = x1;
    y2 = y1;
    x1 = in;
    y1 = out;
    return out;
  }

  void sanitize()
  {
    Dsp::sanitize(x1);
    Dsp::sanitize(y1);
    Dsp::sanitize(x2);
    Dsp::sanitize(y2);
  }

  void reset()
  {
    zero(x1);
    zero(y1);
    zero(x2);
    zero(y2);
  }
};

} // namespace Dsp
} // namespace calfNXT
