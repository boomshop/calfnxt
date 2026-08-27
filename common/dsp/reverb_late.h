#pragma once

// Improved Calf-style allpass-loop late reverb: ms-based, SR-aware, continuous size.

#include "delay_line.h"
#include "dsp_math.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace calfNXT {
namespace Dsp {

class OnePoleLp
{
public:
  void reset() { z_ = 0.f; }

  void setLp(float fc, float sr)
  {
    fc = std::clamp(fc, 20.f, sr * 0.49f);
    const float x = std::exp(-2.f * float(M_PI) * fc / sr);
    a_ = x;
    b_ = 1.f - x;
  }

  float process(float in)
  {
    z_ = b_ * in + a_ * z_;
    return z_;
  }

private:
  float z_ = 0.f;
  float a_ = 0.f;
  float b_ = 1.f;
};

class OnePoleHp
{
public:
  void reset()
  {
    x1_ = 0.f;
    y1_ = 0.f;
  }

  void setHp(float fc, float sr)
  {
    fc = std::clamp(fc, 20.f, sr * 0.49f);
    const float x = std::exp(-2.f * float(M_PI) * fc / sr);
    a_ = x;
  }

  float process(float in)
  {
    // y = a*(y1 + x - x1)
    const float y = a_ * (y1_ + in - x1_);
    x1_ = in;
    y1_ = y;
    return y;
  }

private:
  float x1_ = 0.f;
  float y1_ = 0.f;
  float a_ = 0.f;
};

/**
 * Classic modulated allpass-loop reverb (Calf heritage).
 * Delay times stored as ms @ reference, scaled by sample rate and room size.
 * Decay maps to RT60 via loop-delay–aware feedback (not the old Calf fb curve).
 */
class ReverbLate
{
public:
  static constexpr int kApSize = 16384;
  static constexpr float kRefSr = 44100.f;
  static constexpr float kRefRoomM = 12.f;

  void setup(float sr)
  {
    sr_ = sr > 1.f ? sr : 44100.f;
    phase_ = 0.f;
    updateDelays();
    setCutoff(cutoff_);
    setLfDamp(lfDamp_);
    setMod(modRate_, modDepth_);
  }

  void reset()
  {
    for (int i = 0; i < 6; ++i)
    {
      apL_[i].reset();
      apR_[i].reset();
    }
    lpL_.reset();
    lpR_.reset();
    hpL_.reset();
    hpR_.reset();
    oldL_ = oldR_ = 0.f;
    phase_ = 0.f;
  }

  void setRoomSizeM(float meters)
  {
    meters = std::clamp(meters, 2.f, 40.f);
    if (std::fabs(meters - roomM_) < 1.0e-4f)
      return;
    roomM_ = meters;
    updateDelays();
  }

  void setDistance(float d)
  {
    d = std::clamp(d, 0.f, 1.f);
    if (std::fabs(d - distance_) < 1.0e-4f)
      return;
    distance_ = d;
    updateDelays();
  }

  /** Target late RT60 in seconds (≈ time to −60 dB of recirculating energy). */
  void setTime(float seconds)
  {
    seconds = std::max(0.05f, seconds);
    if (std::fabs(seconds - time_) < 1.0e-5f)
      return;
    time_ = seconds;
    updateFeedback();
  }

  void setDiffusion(float diffusion)
  {
    diffusion = std::clamp(diffusion, 0.f, 1.f);
    if (std::fabs(diffusion - diffusion_) < 1.0e-5f)
      return;
    diffusion_ = diffusion;
    updateDecays();
  }

  void setCutoff(float hz)
  {
    if (std::fabs(hz - cutoff_) < 0.5f)
      return;
    cutoff_ = hz;
    lpL_.setLp(cutoff_, sr_);
    lpR_.setLp(cutoff_, sr_);
  }

  /** 0 = full bass in feedback, 1 = strong LF attenuation. */
  void setLfDamp(float amount)
  {
    amount = std::clamp(amount, 0.f, 1.f);
    if (std::fabs(amount - lfDamp_) < 1.0e-5f)
      return;
    lfDamp_ = amount;
    const float fc = 40.f + lfDamp_ * 360.f;
    hpL_.setHp(fc, sr_);
    hpR_.setHp(fc, sr_);
  }

  void setMod(float rateHz, float depth)
  {
    rateHz = std::clamp(rateHz, 0.05f, 8.f);
    depth = std::clamp(depth, 0.f, 1.f);
    if (std::fabs(rateHz - modRate_) < 1.0e-5f && std::fabs(depth - modDepth_) < 1.0e-5f)
      return;
    modRate_ = rateHz;
    modDepth_ = depth;
    dphase_ = modRate_ / sr_;
  }

  void setFreeze(bool on) { freeze_ = on; }

  /**
   * How many allpass stages per channel (4 = Lo quality, 6 = Mid/Hi).
   * Newly activated lines are cleared so Lo→Mid/Hi does not dump stale buffer.
   */
  void setActiveStages(int stages)
  {
    stages = (stages <= 4) ? 4 : 6;
    if (stages == stages_)
      return;
    if (stages > stages_)
    {
      for (int i = stages_; i < stages; ++i)
      {
        apL_[i].reset();
        apR_[i].reset();
      }
    }
    stages_ = stages;
    updateFeedback();
  }

  int activeStages() const { return stages_; }

  float feedback() const { return freeze_ ? 0.995f : fb_; }

  /** Peak of recirculating tank state (for idle / silence fast-path). */
  float residualEnergy() const
  {
    return std::max(std::fabs(oldL_), std::fabs(oldR_));
  }

  void process(float& left, float& right)
  {
    // Per-stage LFO polarity (same as the historic 6-stage unroll).
    static constexpr float kMod[6] = { -45.f, +47.f, +54.f, -69.f, +69.f, -46.f };

    // Keep fractional base delays even with mod off (Fix16 + 0 mod) — integer
    // rounding would shift the tank vs the previous behaviour.
    float lfo = 0.f;
    float depthSamp = 0.f;
    if (modDepth_ > 1.0e-4f)
    {
      phase_ += dphase_;
      if (phase_ >= 1.f)
        phase_ -= 1.f;
      lfo = sineTurns(phase_);
      depthSamp = modDepth_ * (sr_ / kRefSr) * 12.f;
    }

    const float fb = feedback();
    const int n = stages_;

    left += oldR_;
    left = apL_[0].processAllpassCombFix16(
      left, delayFix(tl_[0], kMod[0] * lfo * depthSamp), ldec_[0]);
    left = apL_[1].processAllpassCombFix16(
      left, delayFix(tl_[1], kMod[1] * lfo * depthSamp), ldec_[1]);
    // Historic Calf tap: listen after the first two APs; remaining stages feed only.
    const float outL = left;
    for (int i = 2; i < n; ++i)
      left = apL_[i].processAllpassCombFix16(
        left, delayFix(tl_[i], kMod[i] * lfo * depthSamp), ldec_[i]);
    float fbL = left * fb;
    if (lfDamp_ > 1.0e-4f)
    {
      const float hp = hpL_.process(fbL);
      fbL = fbL + (hp - fbL) * lfDamp_;
    }
    oldL_ = lpL_.process(fbL);
    sanitizeDenormal(oldL_);

    right += oldL_;
    right = apR_[0].processAllpassCombFix16(
      right, delayFix(tr_[0], kMod[0] * lfo * depthSamp), rdec_[0]);
    right = apR_[1].processAllpassCombFix16(
      right, delayFix(tr_[1], kMod[1] * lfo * depthSamp), rdec_[1]);
    const float outR = right;
    for (int i = 2; i < n; ++i)
      right = apR_[i].processAllpassCombFix16(
        right, delayFix(tr_[i], kMod[i] * lfo * depthSamp), rdec_[i]);
    float fbR = right * fb;
    if (lfDamp_ > 1.0e-4f)
    {
      const float hp = hpR_.process(fbR);
      fbR = fbR + (hp - fbR) * lfDamp_;
    }
    oldR_ = lpR_.process(fbR);
    sanitizeDenormal(oldR_);

    left = outL;
    right = outR;
  }

private:
  static uint32_t delayFix(float baseSamples, float modSamples)
  {
    float d = baseSamples + modSamples;
    d = std::clamp(d, 2.f, float(kApSize - 4));
    return uint32_t(d * 65536.f);
  }

  void updateDelays()
  {
    // Calf "Large" table in ms @ 44.1 kHz.
    static constexpr float kBaseLMs[6] = {
      697.f / 44.1f, 957.f / 44.1f, 649.f / 44.1f,
      1249.f / 44.1f, 1573.f / 44.1f, 1877.f / 44.1f,
    };
    static constexpr float kBaseRMs[6] = {
      783.f / 44.1f, 929.f / 44.1f, 531.f / 44.1f,
      1377.f / 44.1f, 1671.f / 44.1f, 1781.f / 44.1f,
    };

    // Linear room scale matches halls; pure linear crushes booth/small rooms into
    // a few-ms allpass range (metallic tank). Blend toward √room below kRefRoomM
    // so ERs can stay "small" while late delays stay dense enough.
    const float linear = roomM_ / kRefRoomM;
    const float lifted = std::sqrt(std::max(1.0e-3f, linear));
    const float t = std::clamp((roomM_ - 2.f) / (kRefRoomM - 2.f), 0.f, 1.f);
    const float roomScale = lifted + (linear - lifted) * t;
    const float distScale = 0.62f + 0.78f * distance_;
    const float sizeScale = std::max(0.38f, roomScale * distScale);
    const float msToSamp = sr_ * 0.001f;
    for (int i = 0; i < 6; ++i)
    {
      tl_[i] = std::clamp(kBaseLMs[i] * sizeScale * msToSamp, 4.f, float(kApSize - 8));
      tr_[i] = std::clamp(kBaseRMs[i] * sizeScale * msToSamp, 4.f, float(kApSize - 8));
    }
    updateDecays();
    updateFeedback();
  }

  void updateDecays()
  {
    const float fDec = 1000.f + 2400.f * diffusion_;
    for (int i = 0; i < 6; ++i)
    {
      ldec_[i] = std::exp(-tl_[i] / fDec);
      rdec_[i] = std::exp(-tr_[i] / fDec);
    }
  }

  /**
   * Map Decay (RT60) → tank feedback.
   * One outer `fb` multiply happens after a channel has traversed its active
   * allpass delays; loop time ≈ mean of L/R delay sums. Schroeder allpasses
   * are treated as energy-neutral; HF/LF damp still shorten the perceived tail.
   */
  void updateFeedback()
  {
    float sumL = 0.f;
    float sumR = 0.f;
    for (int i = 0; i < stages_; ++i)
    {
      sumL += tl_[i];
      sumR += tr_[i];
    }
    const float loopSamp = 0.5f * (sumL + sumR);
    if (!(loopSamp > 1.f) || !(sr_ > 1.f))
    {
      fb_ = 0.f;
      return;
    }

    const float loopSec = loopSamp / sr_;
    const float rt60 = std::max(0.05f, time_);
    // amplitude^(rt60 / loopSec) = 10^(-3)  →  fb = 10^(-3 * loopSec / rt60)
    float fb = std::exp(std::log(0.001f) * (loopSec / rt60));
    fb_ = std::clamp(fb, 0.f, 0.98f);
  }

  DelayLine<kApSize> apL_[6];
  DelayLine<kApSize> apR_[6];
  OnePoleLp lpL_, lpR_;
  OnePoleHp hpL_, hpR_;
  float oldL_ = 0.f;
  float oldR_ = 0.f;
  float tl_[6] {};
  float tr_[6] {};
  float ldec_[6] {};
  float rdec_[6] {};
  float sr_ = 44100.f;
  float roomM_ = 12.f;
  float distance_ = 0.45f;
  float time_ = 1.5f;
  float fb_ = 0.8f;
  float diffusion_ = 0.5f;
  float cutoff_ = 5000.f;
  float lfDamp_ = 0.2f;
  float modRate_ = 0.5f;
  float modDepth_ = 0.35f;
  float phase_ = 0.f;
  float dphase_ = 0.f;
  int stages_ = 6;
  bool freeze_ = false;
};

/** Short delay-allpass diffusion before the late tank (soft late onset). */
class ReverbDiffuse
{
public:
  static constexpr int kSize = 16384; // enough for ~50–80 ms smear @ 96 kHz
  static constexpr int kMaxStages = 6;

  void setup(float sr)
  {
    sr_ = sr > 1.f ? sr : 44100.f;
    // Base taps in ms (first four = Mid; 5–6 = Hi denser smear).
    static constexpr float kBaseLMs[kMaxStages] = {
      1.19f, 1.73f, 2.31f, 3.11f, 3.73f, 4.41f,
    };
    static constexpr float kBaseRMs[kMaxStages] = {
      1.31f, 1.61f, 2.47f, 2.93f, 3.53f, 4.19f,
    };
    for (int i = 0; i < kMaxStages; ++i)
    {
      dL_[i] = msToSamp(kBaseLMs[i]);
      dR_[i] = msToSamp(kBaseRMs[i]);
    }
  }

  void reset()
  {
    for (int i = 0; i < kMaxStages; ++i)
    {
      apL_[i].reset();
      apR_[i].reset();
    }
  }

  /** 0 = bypass (Lo), 4 = Mid, 6 = Hi. */
  void setStages(int stages)
  {
    stages = std::clamp(stages, 0, kMaxStages);
    if (stages == stages_)
      return;
    if (stages > stages_)
    {
      for (int i = stages_; i < stages; ++i)
      {
        apL_[i].reset();
        apR_[i].reset();
      }
    }
    stages_ = stages;
  }

  void process(float& l, float& r, float amount)
  {
    amount = std::clamp(amount, 0.f, 1.f);
    if (amount < 1.0e-4f || stages_ <= 0)
      return;

    // Cache scaled Fix16 delays when amount is stable (same fractional taps as before).
    if (std::fabs(amount - cachedAmt_) > 1.0e-4f)
    {
      cachedAmt_ = amount;
      const float scale = 1.f + amount * 15.f;
      cachedFb_ = 0.45f + 0.4f * amount;
      for (int i = 0; i < kMaxStages; ++i)
      {
        const float dL = std::min(float(kSize - 4), float(dL_[i]) * scale);
        const float dR = std::min(float(kSize - 4), float(dR_[i]) * scale);
        dLFix_[i] = uint32_t(dL * 65536.f);
        dRFix_[i] = uint32_t(dR * 65536.f);
      }
    }

    float xl = l;
    float xr = r;
    for (int i = 0; i < stages_; ++i)
    {
      xl = apL_[i].processAllpassCombFix16(xl, dLFix_[i], cachedFb_);
      xr = apR_[i].processAllpassCombFix16(xr, dRFix_[i], cachedFb_);
    }
    l = l + (xl - l) * amount;
    r = r + (xr - r) * amount;
  }

private:
  int msToSamp(float ms) const
  {
    return std::clamp(int(ms * 0.001f * sr_ + 0.5f), 2, kSize - 4);
  }

  DelayLine<kSize> apL_[kMaxStages];
  DelayLine<kSize> apR_[kMaxStages];
  int dL_[kMaxStages] {};
  int dR_[kMaxStages] {};
  uint32_t dLFix_[kMaxStages] {};
  uint32_t dRFix_[kMaxStages] {};
  int stages_ = 4;
  float cachedAmt_ = -1.f;
  float cachedFb_ = 0.45f;
  float sr_ = 44100.f;
};

} // namespace Dsp
} // namespace calfNXT
