#pragma once

#include "biquad.h"
#include "compressor.h"
#include "dsp_math.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Dsp {

/** Matches UI / codegen type indices. */
enum class EqType : int
{
  Parametric = 0,
  LowShelf = 1,
  HighShelf = 2,
  LowPass = 3,
  HighPass = 4,
  BandPass = 5,
};

inline constexpr int kEqMaxStages = 4;

/** Stages for LP/HP slope (12 / 24 / 36 / 48 dB/oct → 1 / 2 / 3 / 4 biquads).
 *  Each stage uses the band Q (AUX-style resonance at fc); Q≈0.707 ≈ flat. */
inline int slopeToStages(float slopeDb)
{
  if (slopeDb >= 42.f)
    return 4;
  if (slopeDb >= 30.f)
    return 3;
  if (slopeDb >= 18.f)
    return 2;
  return 1;
}

inline bool typeUsesGain(int type)
{
  switch (static_cast<EqType>(type))
  {
    case EqType::Parametric:
    case EqType::LowShelf:
    case EqType::HighShelf:
    case EqType::BandPass:
      return true;
    default:
      return false;
  }
}

/**
 * One EQ band: cascaded stereo biquads, param glide, optional Dynamic EQ
 * (band-local detector → GainReduction → peaking/shelf gain).
 */
class EqBandProcessor
{
public:
  void setSampleRate(double sr)
  {
    sampleRate_ = sr > 0.0 ? sr : 44100.0;
    gr_.setSampleRate(static_cast<float>(sampleRate_));
    needsCoeffs_ = true;
    needsDetCoeffs_ = true;
  }

  void reset()
  {
    for (int s = 0; s < kEqMaxStages; ++s)
    {
      L_[s].reset();
      R_[s].reset();
    }
    detL_.reset();
    detR_.reset();
    gr_.reset();
    lastAppliedGainDb_ = 1.0e9f;
  }

  void setTargets(bool active, int type, float slopeDb, float freq, float gainDb, float q)
  {
    const bool typeChanged = type != type_ || slopeToStages(slopeDb) != stages_;
    active_ = active;
    type_ = type;
    slopeDb_ = slopeDb;
    stages_ = isPass(type) ? slopeToStages(slopeDb) : 1;
    freqTgt_ = freq;
    gainTgt_ = gainDb;
    qTgt_ = std::max(0.05f, q);
    if (typeChanged)
    {
      reset();
      freqCur_ = freqTgt_;
      gainCur_ = gainTgt_;
      qCur_ = qTgt_;
      needsCoeffs_ = true;
      needsDetCoeffs_ = true;
    }
    // Inactive bands skip prepareBlock — keep display/cur in sync with targets.
    if (!active_)
    {
      freqCur_ = freqTgt_;
      gainCur_ = gainTgt_;
      qCur_ = qTgt_;
      lastAppliedGainDb_ = typeUsesGain(type_) ? gainTgt_ : 0.f;
    }
  }

  void setDynParams(bool enabled, float attackMs, float releaseMs, float thresholdDb,
                    float ratio)
  {
    if (dynEnabled_ && !enabled)
      needsCoeffs_ = true; // restore static gain coeffs
    dynEnabled_ = enabled;
    gr_.setParams(attackMs, releaseMs, thresholdDb, ratio);
  }

  void setListen(bool listen)
  {
    if (listen && !listen_)
      needsDetCoeffs_ = true;
    listen_ = listen;
  }

  bool isListening() const { return listen_; }

  /** Advance freq/Q glide + snap gain; refresh coeffs / detector. Once per block. */
  void prepareBlock()
  {
    const bool needAudio = active_;
    const bool needDet =
      listen_ || (active_ && dynEnabled_ && typeUsesGain(type_));
    if (!needAudio && !needDet)
    {
      // Keep cur/display aligned while skipped (inactive, no listen).
      freqCur_ = freqTgt_;
      gainCur_ = gainTgt_;
      qCur_ = qTgt_;
      lastAppliedGainDb_ = typeUsesGain(type_) ? gainTgt_ : 0.f;
      return;
    }

    bool gliding = false;
    const float prevFreq = freqCur_;
    const float prevQ = qCur_;
    const float prevGain = gainCur_;
    freqCur_ = glideTowardLog(freqCur_, freqTgt_, gliding);
    // Gain is in dB — snap per block (Hz-style glide was far too slow).
    gainCur_ = gainTgt_;
    qCur_ = glideTowardLog(qCur_, qTgt_, gliding);
    if (freqCur_ != prevFreq || qCur_ != prevQ)
      needsDetCoeffs_ = true;
    const bool gainChanged = gainCur_ != prevGain;

    if (needAudio)
    {
      // When dyn is on, do not stomp display/applied gain to the static target —
      // process() owns lastAppliedGainDb_ via GR.
      if (dynEnabled_ && typeUsesGain(type_))
      {
        if (gliding || gainChanged || needsCoeffs_)
        {
          const float gainForCoeffs =
            lastAppliedGainDb_ < 1.0e8f ? lastAppliedGainDb_ : gainCur_;
          updateAudioCoeffs(gainForCoeffs);
        }
      }
      else if (gliding || gainChanged || needsCoeffs_)
      {
        updateAudioCoeffs(gainCur_);
        lastAppliedGainDb_ = gainCur_;
      }
    }

    if (needDet && (needsDetCoeffs_ || gliding || gainChanged))
      updateDetectorCoeffs();
  }

  /** Stereo process (required for linked dyn detector). */
  void process(float& left, float& right)
  {
    if (!active_)
      return;

    if (dynEnabled_ && typeUsesGain(type_))
    {
      const float dL = static_cast<float>(detL_.process(left));
      const float dR = static_cast<float>(detR_.process(right));
      const float gr = gr_.processDetector(dL, dR);
      const float effectiveDb = gainCur_ + linToDb(gr);
      if (std::fabs(effectiveDb - lastAppliedGainDb_) > 0.01f)
      {
        updateAudioCoeffs(effectiveDb);
        lastAppliedGainDb_ = effectiveDb;
      }
    }

    double yL = left;
    double yR = right;
    for (int s = 0; s < stages_; ++s)
    {
      yL = L_[s].process(yL);
      yR = R_[s].process(yR);
    }
    left = static_cast<float>(yL);
    right = static_cast<float>(yR);
  }

  /** Solo detector / sidechain signal (EQ bands bypassed by caller). */
  void processListen(float& left, float& right)
  {
    left = static_cast<float>(detL_.process(left));
    right = static_cast<float>(detR_.process(right));
  }

  void sanitize()
  {
    for (int s = 0; s < kEqMaxStages; ++s)
    {
      L_[s].sanitize();
      R_[s].sanitize();
    }
    detL_.sanitize();
    detR_.sanitize();
  }

  /** Gain currently applied in DSP (static or dyn-compressed), for UI curves. */
  float displayGainDb() const
  {
    if (!typeUsesGain(type_))
      return 0.f;
    // Curves follow the static target unless this band is actively compressing.
    if (!active_ || !dynEnabled_ || lastAppliedGainDb_ >= 1.0e8f)
      return gainTgt_;
    return lastAppliedGainDb_;
  }

private:
  static bool isPass(int type)
  {
    return type == static_cast<int>(EqType::LowPass) ||
           type == static_cast<int>(EqType::HighPass);
  }

  void updateAudioCoeffs(float gainDb)
  {
    needsCoeffs_ = false;
    const float sr = static_cast<float>(sampleRate_);
    const float ny = sr * 0.49f;
    const float fc = std::clamp(freqCur_, 20.f, ny);
    const float peak = dbToLin(gainDb);

    for (int s = 0; s < stages_; ++s)
    {
      // Pass filters: same Q on every cascade stage (matches AUX lowpassN/highpassN
      // resonance at fc). Non-pass: single stage with band Q.
      const float useQ = qCur_;

      switch (static_cast<EqType>(type_))
      {
        case EqType::Parametric:
          L_[s].setPeakeqRbj(fc, useQ, peak, sr);
          break;
        case EqType::LowShelf:
          L_[s].setLowshelfRbj(fc, useQ, peak, sr);
          break;
        case EqType::HighShelf:
          L_[s].setHighshelfRbj(fc, useQ, peak, sr);
          break;
        case EqType::LowPass:
          L_[s].setLpRbj(fc, useQ, sr, 1.f);
          break;
        case EqType::HighPass:
          L_[s].setHpRbj(fc, useQ, sr, 1.f);
          break;
        case EqType::BandPass:
          L_[s].setBpRbj(fc, useQ, sr, peak);
          break;
        default:
          L_[s].setNull();
          break;
      }
      R_[s].copyCoeffs(L_[s]);
    }
  }

  void updateDetectorCoeffs()
  {
    needsDetCoeffs_ = false;
    const float sr = static_cast<float>(sampleRate_);
    const float ny = sr * 0.49f;
    const float fc = std::clamp(freqCur_, 20.f, ny);
    const float q = std::max(0.05f, qCur_);

    switch (static_cast<EqType>(type_))
    {
      case EqType::Parametric:
      case EqType::BandPass:
        detL_.setBpRbj(fc, q, sr, 1.0);
        break;
      case EqType::LowPass:
        detL_.setLpRbj(fc, q, sr, 1.f);
        break;
      case EqType::HighPass:
        detL_.setHpRbj(fc, q, sr, 1.f);
        break;
      case EqType::LowShelf:
        detL_.setLpRbj(fc, 0.70710678f, sr, 1.f);
        break;
      case EqType::HighShelf:
        detL_.setHpRbj(fc, 0.70710678f, sr, 1.f);
        break;
      default:
        detL_.setNull();
        break;
    }
    detR_.copyCoeffs(detL_);
  }

  BiquadD1 L_[kEqMaxStages];
  BiquadD1 R_[kEqMaxStages];
  BiquadD1 detL_;
  BiquadD1 detR_;
  GainReduction gr_;
  double sampleRate_ = 44100.0;
  bool active_ = false;
  bool dynEnabled_ = false;
  bool listen_ = false;
  int type_ = 0;
  float slopeDb_ = 12.f;
  int stages_ = 1;
  float freqCur_ = 1000.f;
  float freqTgt_ = 1000.f;
  float gainCur_ = 0.f;
  float gainTgt_ = 0.f;
  float qCur_ = 0.707f;
  float qTgt_ = 0.707f;
  float lastAppliedGainDb_ = 1.0e9f;
  bool needsCoeffs_ = true;
  bool needsDetCoeffs_ = true;
};

} // namespace Dsp
} // namespace calfNXT
