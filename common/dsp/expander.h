#pragma once

// Feed-forward expander / gate (Calf Gate heritage, Damien/Thor detection).
// Soft knee + soft range floor; open/release threshold hysteresis + hold.

#include "compressor.h" // DetectorMode, StereoLink, hermiteInterpolation
#include "dsp_math.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Dsp {

/**
 * Downward expander: unity above threshold, ratio expansion below, floored by
 * range (max gain reduction). Detection matches GainReduction (Peak/RMS/Opto).
 */
class GainExpansion
{
public:
  void setSampleRate(float sr)
  {
    sampleRate_ = sr > 0.f ? sr : 44100.f;
    recomputeCoeffs();
  }

  void reset()
  {
    linSlope_ = 0.f;
    rmsSq_ = 0.f;
    lastGr_ = 1.f;
    open_ = true;
    holdSamplesLeft_ = 0;
  }

  /**
   * thresholdDb = open threshold; releaseThresholdDb ≤ threshold (hysteresis).
   * rangeDb = max GR floor (≤ 0), e.g. −90…0.
   * kneeDb = soft width for open knee and range soft-landing.
   * holdMs = stay open after falling below release thresh before closing.
   */
  void setParams(float attackMs, float releaseMs, float holdMs,
                 float thresholdDb, float releaseThresholdDb, float ratio,
                 float kneeDb, float rangeDb,
                 DetectorMode mode = DetectorMode::Peak,
                 StereoLink link = StereoLink::Max)
  {
    attackMs_ = std::max(0.1f, attackMs);
    releaseMs_ = std::max(0.1f, releaseMs);
    holdMs_ = std::max(0.f, holdMs);
    holdSamplesTotal_ =
      static_cast<int>(holdMs_ * sampleRate_ * 0.001f + 0.5f);
    thresholdDb_ = thresholdDb;
    releaseThresholdDb_ =
      std::min(releaseThresholdDb, thresholdDb);
    thresholdLin_ = dbToLin(thresholdDb_);
    releaseThresholdLin_ = dbToLin(releaseThresholdDb_);
    ratio_ = std::max(1.f, ratio);
    kneeDb_ = std::max(0.f, kneeDb);
    rangeDb_ = std::min(0.f, rangeDb);
    rangeLin_ = dbToLin(rangeDb_);
    mode_ = mode;
    link_ = link;
    // Ratio≈1 and no floor → always unity (skip transfer math).
    passthrough_ = (ratio_ <= 1.001f && rangeDb_ >= -0.01f);
    recomputeCoeffs();
    // Keep hysteresis state: do not force the open-threshold curve while closed.
    updateCurve(open_ ? thresholdDb_ : releaseThresholdDb_);
  }

  float processDetector(float detL, float detR)
  {
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
    sanitize(linked);

    float attackCoeff = attackCoeffBase_;
    float releaseCoeff = releaseCoeffBase_;
    if (mode_ == DetectorMode::Opto)
    {
      const float depth = 1.f - lastGr_;
      attackCoeff = std::min(1.f, attackCoeffBase_ / (1.f + 2.f * depth));
      releaseCoeff =
        std::min(1.f, releaseCoeffBase_ / (1.f + 2.5f * depth));
    }

    if (mode_ == DetectorMode::Rms)
    {
      const float sq = linked * linked;
      sanitize(rmsSq_);
      rmsSq_ += (sq - rmsSq_) * (sq > rmsSq_ ? attackCoeff : releaseCoeff);
      sanitize(rmsSq_);
      linSlope_ = std::sqrt(std::max(0.f, rmsSq_));
    }
    else
    {
      sanitize(linSlope_);
      linSlope_ +=
        (linked - linSlope_) * (linked > linSlope_ ? attackCoeff : releaseCoeff);
      sanitize(linSlope_);
    }

    if (passthrough_)
    {
      open_ = true;
      holdSamplesLeft_ = 0;
      lastGr_ = 1.f;
      return 1.f;
    }

    // Hysteresis + hold: stay open for holdMs after falling below release thresh.
    if (linSlope_ > thresholdLin_)
    {
      open_ = true;
      holdSamplesLeft_ = 0;
    }
    else if (open_)
    {
      if (linSlope_ < releaseThresholdLin_)
      {
        if (holdSamplesTotal_ <= 0)
        {
          open_ = false;
          holdSamplesLeft_ = 0;
        }
        else if (holdSamplesLeft_ <= 0)
        {
          holdSamplesLeft_ = holdSamplesTotal_;
        }
        else if (--holdSamplesLeft_ <= 0)
        {
          open_ = false;
          holdSamplesLeft_ = 0;
        }
      }
      else
      {
        holdSamplesLeft_ = 0;
      }
    }

    const float curveThreshDb = open_ ? thresholdDb_ : releaseThresholdDb_;
    if (std::fabs(curveThreshDb - curveThreshDb_) > 1.0e-6f)
      updateCurve(curveThreshDb);

    // Above the active curve threshold → unity (skip log/hermite path).
    if (linSlope_ >= thresholdLinCurve_)
    {
      lastGr_ = 1.f;
      return 1.f;
    }

    float gain = 1.f;
    if (linSlope_ > 0.f)
      gain = outputGain(linSlope_);
    sanitize(gain);
    lastGr_ = gain;
    return gain;
  }

  float lastGainReduction() const { return lastGr_; }
  float lastDetectorLin() const { return linSlope_; }
  bool isOpen() const { return open_; }

  /** Static transfer: input linear → gain linear (for charts / tests). */
  static float staticGain(float linIn, float thresholdDb, float ratio,
                          float kneeDb, float rangeDb)
  {
    if (!(linIn > 0.f))
      return dbToLin(std::min(0.f, rangeDb));
    const float inDb = linToDb(linIn);
    const float outDb =
      staticOutDb(inDb, thresholdDb, ratio, kneeDb, rangeDb);
    const float g = dbToLin(outDb - inDb);
    const float floorG = dbToLin(std::min(0.f, rangeDb));
    return std::clamp(g, floorG, 1.f);
  }

  /** Static transfer: input dB → output dB. */
  static float staticOutDb(float inDb, float thresholdDb, float ratio,
                           float kneeDb, float rangeDb)
  {
    const float r = std::max(1.f, ratio);
    const float floorDb = std::min(0.f, rangeDb);
    const float knee = std::max(0.f, kneeDb);
    const auto expand = [&](float x) {
      return thresholdDb + (x - thresholdDb) * r;
    };

    float outDb;
    if (knee <= 0.01f)
    {
      outDb = inDb < thresholdDb ? expand(inDb) : inDb;
    }
    else
    {
      // Full knee width below threshold → (th, th) with unity slope.
      const float lo = thresholdDb - knee;
      if (inDb >= thresholdDb)
        outDb = inDb;
      else if (inDb <= lo)
        outDb = expand(inDb);
      else
        outDb = hermiteInterpolation(inDb, lo, thresholdDb, expand(lo),
                                     thresholdDb, r, 1.f);
    }

    // Downward expander must never boost.
    outDb = std::min(outDb, inDb);

    // Range floor with rounded corner.
    const float floorOut = inDb + floorDb;
    const float soft = knee * 0.5f;
    if (soft <= 0.01f)
      outDb = std::max(outDb, floorOut);
    else
    {
      const float d = std::fabs(outDb - floorOut);
      outDb = 0.5f * (outDb + floorOut + std::sqrt(d * d + soft * soft));
    }

    return std::max(floorOut, std::min(inDb, outDb));
  }

private:
  void recomputeCoeffs()
  {
    attackCoeffBase_ =
      std::min(1.f, 1.f / (attackMs_ * sampleRate_ / 4000.f));
    releaseCoeffBase_ =
      std::min(1.f, 1.f / (releaseMs_ * sampleRate_ / 4000.f));
  }

  void updateCurve(float thresholdDb)
  {
    curveThreshDb_ = thresholdDb;
    thresholdLinCurve_ = std::max(1.0e-8f, dbToLin(thresholdDb));
  }

  float outputGain(float linSlope) const
  {
    if (!(linSlope > 0.f))
      return rangeLin_;
    const float inDb = linToDb(linSlope);
    const float outDb =
      staticOutDb(inDb, curveThreshDb_, ratio_, kneeDb_, rangeDb_);
    const float g = dbToLin(outDb - inDb);
    return std::clamp(g, rangeLin_, 1.f);
  }

  float sampleRate_ = 44100.f;
  float attackMs_ = 20.f;
  float releaseMs_ = 200.f;
  float holdMs_ = 0.f;
  float attackCoeffBase_ = 1.f;
  float releaseCoeffBase_ = 1.f;
  int holdSamplesTotal_ = 0;
  int holdSamplesLeft_ = 0;
  float thresholdDb_ = -20.f;
  float releaseThresholdDb_ = -20.f;
  float thresholdLin_ = 0.1f;
  float releaseThresholdLin_ = 0.1f;
  float ratio_ = 4.f;
  float kneeDb_ = 6.f;
  float rangeDb_ = -60.f;
  float rangeLin_ = 0.001f;
  bool passthrough_ = false;
  DetectorMode mode_ = DetectorMode::Peak;
  StereoLink link_ = StereoLink::Max;

  float linSlope_ = 0.f;
  float rmsSq_ = 0.f;
  float lastGr_ = 1.f;
  bool open_ = true;

  float curveThreshDb_ = -20.f;
  float thresholdLinCurve_ = 0.1f;
};

} // namespace Dsp
} // namespace calfNXT
