#pragma once

// Based on Calf Studio Gear gain_reduction_audio_module (Thor Harald Johansen).
// Ported for calfNXT — detector-only API for Dynamic EQ (no audio multiply).

#include "dsp_math.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Dsp {

/** Soft-knee ratio infinity sentinel (Calf FAKE_INFINITY). */
inline constexpr float kRatioInfinity = 65536.f * 65536.f;

inline bool isRatioInfinity(float ratio)
{
  return std::fabs(ratio - kRatioInfinity) < 1.f;
}

/** Hermite interpolation (Calf primitives.h). */
inline float hermiteInterpolation(float x, float x0, float x1, float p0, float p1,
                                  float m0, float m1)
{
  const float width = x1 - x0;
  float t = (x - x0) / width;
  m0 *= width;
  m1 *= width;
  const float t2 = t * t;
  const float t3 = t2 * t;
  const float ct0 = p0;
  const float ct1 = m0;
  const float ct2 = -3.f * p0 - 2.f * m0 + 3.f * p1 - m1;
  const float ct3 = 2.f * p0 + m0 - 2.f * p1 + m1;
  return ct3 * t3 + ct2 * t2 + ct1 * t + ct0;
}

/** Peak / RMS level; Opto = peak + photocell-like ballistics. */
enum class DetectorMode : int
{
  Peak = 0,
  Rms = 1,
  Opto = 2,
};

/** Max = max(|L|,|R|); Average = 0.5*(|L|+|R|); Mid = |0.5*(L+R)|. */
enum class StereoLink : int
{
  Max = 0,
  Average = 1,
  Mid = 2,
};

/**
 * Feed-forward compressor gain reduction.
 * Soft knee configurable (default ~6 dB AUX width). Makeup is applied by the
 * host plugin (DynEQ applies GR to filter gain instead).
 */
class GainReduction
{
public:
  void setSampleRate(float sr)
  {
    sampleRate_ = sr > 0.f ? sr : 44100.f;
  }

  void reset()
  {
    linSlope_ = 0.f;
    rmsSq_ = 0.f;
    lastGr_ = 1.f;
  }

  /**
   * thresholdDb → linear amplitude; ratio 1…20 (or kRatioInfinity).
   * kneeDb = AUX-style soft-knee width (0 = hard).
   * pdrAmount 0…1 stretches release when GR is deep (0 = classic fixed release).
   */
  void setParams(float attackMs, float releaseMs, float thresholdDb, float ratio,
                 float kneeDb = 6.f, DetectorMode mode = DetectorMode::Peak,
                 StereoLink link = StereoLink::Max, float pdrAmount = 0.f)
  {
    attackMs_ = std::max(0.1f, attackMs);
    releaseMs_ = std::max(0.1f, releaseMs);
    thresholdLin_ = dbToLin(thresholdDb);
    ratio_ = std::max(1.f, ratio);
    knee_ = kneeDb <= 0.01f ? 1.f : std::pow(10.f, kneeDb / 20.f);
    mode_ = mode;
    link_ = link;
    pdrAmount_ = std::clamp(pdrAmount, 0.f, 1.f);
    updateCurve();
  }

  /**
   * Advance envelope from stereo detector samples; return linear GR in (0, 1].
   * Does not modify audio. Samples should already be sidechain-filtered.
   */
  float processDetector(float detL, float detR)
  {
    const float grDepth = 1.f - lastGr_; // 0 = none, ~1 = full squash

    float attackScale = 1.f;
    float releaseScale = 1.f + pdrAmount_ * 4.f * grDepth;

    if (mode_ == DetectorMode::Opto)
    {
      // Photocell-ish: attack slows when already compressing; release grows
      // with GR depth even without extra PDR.
      attackScale *= 1.f + 2.f * grDepth;
      releaseScale *= 1.f + 2.5f * grDepth;
    }

    const float attackCoeff = std::min(
      1.f, 1.f / (attackMs_ * attackScale * sampleRate_ / 4000.f));
    const float releaseCoeff = std::min(
      1.f, 1.f / (releaseMs_ * releaseScale * sampleRate_ / 4000.f));

    float linked = 0.f;
    switch (link_)
    {
      case StereoLink::Average:
        linked = 0.5f * (std::fabs(detL) + std::fabs(detR));
        break;
      case StereoLink::Mid:
        linked = std::fabs(0.5f * (detL + detR));
        break;
      case StereoLink::Max:
      default:
        linked = std::max(std::fabs(detL), std::fabs(detR));
        break;
    }

    float absample = linked;
    if (mode_ == DetectorMode::Rms)
    {
      // Power smoother is the RMS envelope (attack/release on squared level).
      const float sq = linked * linked;
      sanitize(rmsSq_);
      rmsSq_ += (sq - rmsSq_) * (sq > rmsSq_ ? attackCoeff : releaseCoeff);
      absample = std::sqrt(std::max(0.f, rmsSq_));
      linSlope_ = absample;
    }
    else
    {
      sanitize(linSlope_);
      linSlope_ +=
        (absample - linSlope_) * (absample > linSlope_ ? attackCoeff : releaseCoeff);
    }

    float gain = 1.f;
    if (linSlope_ > 0.f)
      gain = outputGain(linSlope_);
    lastGr_ = gain;
    return gain;
  }

  float lastGainReduction() const { return lastGr_; }
  /** Peak detector level (linear) after last processDetector. */
  float lastDetectorLin() const { return linSlope_; }

private:
  void updateCurve()
  {
    const float linThreshold = std::max(1.0e-8f, thresholdLin_);
    const float linKneeSqrt = std::sqrt(knee_);
    linKneeStart_ = linThreshold / linKneeSqrt;
    const float linKneeStop = linThreshold * linKneeSqrt;
    thres_ = std::log(linThreshold);
    kneeStart_ = std::log(linKneeStart_);
    kneeStop_ = std::log(linKneeStop);
    compressedKneeStop_ = (kneeStop_ - thres_) / ratio_ + thres_;
  }

  float outputGain(float linSlope) const
  {
    if (linSlope <= linKneeStart_)
      return 1.f;

    const float slope = std::log(linSlope);
    float gain = 0.f;
    float delta = 0.f;
    if (isRatioInfinity(ratio_))
    {
      gain = thres_;
      delta = 0.f;
    }
    else
    {
      gain = (slope - thres_) / ratio_ + thres_;
      delta = 1.f / ratio_;
    }

    if (knee_ > 1.f && slope < kneeStop_)
    {
      gain = hermiteInterpolation(slope, kneeStart_, kneeStop_, kneeStart_,
                                  compressedKneeStop_, 1.f, delta);
    }

    return std::exp(gain - slope);
  }

  float sampleRate_ = 44100.f;
  float attackMs_ = 20.f;
  float releaseMs_ = 200.f;
  float thresholdLin_ = 0.1f;
  float ratio_ = 4.f;
  float knee_ = 2.f;
  DetectorMode mode_ = DetectorMode::Peak;
  StereoLink link_ = StereoLink::Max;
  float pdrAmount_ = 0.f;
  float linSlope_ = 0.f;
  float rmsSq_ = 0.f;
  float linKneeStart_ = 0.f;
  float thres_ = 0.f;
  float kneeStart_ = 0.f;
  float kneeStop_ = 0.f;
  float compressedKneeStop_ = 0.f;
  float lastGr_ = 1.f;
};

} // namespace Dsp
} // namespace calfNXT
