#pragma once

// Tom Szilagyi's distortion (Calf heritage, used with permission in Calf).
// Drive / blend waveshaper with optional 2× oversampling via ResampleN.

#include "dsp_math.h"
#include "resample_n.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace calfNXT {
namespace Dsp {

class TapDistortion
{
public:
  void activate()
  {
    isActive_ = true;
    prevMed_ = 0.f;
    prevOut_ = 0.f;
    meter_ = 0.f;
  }

  void deactivate() { isActive_ = false; }

  void setSampleRate(uint32_t sr)
  {
    srate_ = std::max(1u, sr);
    over_ = (srate_ * 2u > 96000u) ? 1 : 2;
    resampler_.setParams(srate_, over_, 2);
    driveOld_ = 1.0e9f;
    blendOld_ = 1.0e9f;
  }

  void setParams(float blend, float drive)
  {
    if (driveOld_ == drive && blendOld_ == blend)
      return;

    const float rdrive = 12.0f / std::max(0.1f, drive);
    const float rbdr = rdrive / (10.5f - blend) * 780.0f / 33.0f;
    const float kpa = D(2.0f * (rdrive * rdrive) - 1.0f) + 1.0f;
    const float kpb = (2.0f - kpa) / 2.0f;
    const float ap = ((rdrive * rdrive) - kpa + 1.0f) / 2.0f;
    const float kc = kpa / D(2.0f * D(2.0f * (rdrive * rdrive) - 1.0f) - 2.0f * rdrive * rdrive);

    const float srct = (0.1f * static_cast<float>(srate_)) /
                       (0.1f * static_cast<float>(srate_) + 1.0f);
    const float sq = kc * kc + 1.0f;
    const float knb = -1.0f * rbdr / D(sq);
    const float kna = 2.0f * kc * rbdr / D(sq);
    const float an = rbdr * rbdr / sq;
    const float imr = 2.0f * knb + D(2.0f * kna + 4.0f * an - 1.0f);
    const float pwrq = 2.0f / (imr + 1.0f);

    rdrive_ = rdrive;
    rbdr_ = rbdr;
    kpa_ = kpa;
    kpb_ = kpb;
    kna_ = kna;
    knb_ = knb;
    ap_ = ap;
    an_ = an;
    imr_ = imr;
    kc_ = kc;
    srct_ = srct;
    sq_ = sq;
    pwrq_ = pwrq;
    driveOld_ = drive;
    blendOld_ = blend;
  }

  float process(float in)
  {
    double* samples = resampler_.upsample(static_cast<double>(in));
    meter_ = 0.f;
    for (int o = 0; o < over_; ++o)
    {
      float proc = static_cast<float>(samples[o]);
      float med = 0.f;
      if (proc >= 0.0f)
        med = (D(ap_ + proc * (kpa_ - proc)) + kpb_) * pwrq_;
      else
        med = (D(an_ - proc * (kna_ + proc)) + knb_) * pwrq_ * -1.0f;
      proc = srct_ * (med - prevMed_ + prevOut_);
      prevMed_ = M(med);
      prevOut_ = M(proc);
      samples[o] = proc;
      meter_ = std::max(meter_, std::fabs(proc));
    }
    return static_cast<float>(resampler_.downsample(samples));
  }

  float distortionLevel() const { return meter_; }

  void sanitize()
  {
    sanitizeDenormal(prevMed_);
    sanitizeDenormal(prevOut_);
    resampler_.sanitize();
  }

  /** Evaluate the static waveshape (no OS / slew) for UI transfer curves. */
  float shapeStatic(float x) const
  {
    float med = 0.f;
    if (x >= 0.0f)
      med = (D(ap_ + x * (kpa_ - x)) + kpb_) * pwrq_;
    else
      med = (D(an_ - x * (kna_ + x)) + knb_) * pwrq_ * -1.0f;
    return med;
  }

private:
  static float M(float x)
  {
    return (std::fabs(x) > 1.0e-8f) ? x : 0.0f;
  }

  static float D(float x)
  {
    x = std::fabs(x);
    return (x > 1.0e-8f) ? std::sqrt(x) : 0.0f;
  }

  ResampleN resampler_;
  uint32_t srate_ = 44100;
  int over_ = 2;
  bool isActive_ = false;

  float driveOld_ = 1.0e9f;
  float blendOld_ = 1.0e9f;
  float meter_ = 0.f;
  float prevMed_ = 0.f;
  float prevOut_ = 0.f;

  float rdrive_ = 1.f;
  float rbdr_ = 1.f;
  float kpa_ = 1.f;
  float kpb_ = 0.f;
  float kna_ = 0.f;
  float knb_ = 0.f;
  float ap_ = 0.f;
  float an_ = 0.f;
  float imr_ = 1.f;
  float kc_ = 1.f;
  float srct_ = 1.f;
  float sq_ = 1.f;
  float pwrq_ = 1.f;
};

} // namespace Dsp
} // namespace calfNXT
