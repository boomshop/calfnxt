#pragma once

// Multimode stereo biquad cascade + optional complementary dry (LP/HP).
// Mode indices follow Calf (0…12) but LP/HP top slope is 48 dB (4 stages)
// instead of Calf’s 36 — odd-order LP+HP cannot sum flat; 48 can.

#include "biquad.h"
#include "compressor.h"
#include "dsp_math.h"
#include "inertia.h"

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Dsp {

enum class MultimodeKind : int
{
  Lowpass = 0,
  Highpass = 1,
  Bandpass = 2,
  Bandreject = 3,
  Allpass = 4,
};

/**
 * Mode plains 0…12:
 *   0–2  LP 12 / 24 / 48
 *   3–5  HP 12 / 24 / 48
 *   6–8  BP 6 / 12 / 18
 *   9–11 BR 6 / 12 / 18
 *   12   Allpass
 * @p order is cascade stage count (biquads); LP/HP 48 → 4.
 */
inline void multimodeFromPlain(int mode, MultimodeKind& kind, int& order)
{
  mode = std::clamp(mode, 0, 12);
  if (mode <= 2)
  {
    kind = MultimodeKind::Lowpass;
    order = (mode == 2) ? 4 : (mode + 1);
  }
  else if (mode <= 5)
  {
    kind = MultimodeKind::Highpass;
    const int idx = mode - 3;
    order = (idx == 2) ? 4 : (idx + 1);
  }
  else if (mode <= 8)
  {
    kind = MultimodeKind::Bandpass;
    order = mode - 6 + 1;
  }
  else if (mode <= 11)
  {
    kind = MultimodeKind::Bandreject;
    order = mode - 9 + 1;
  }
  else
  {
    kind = MultimodeKind::Allpass;
    order = 3;
  }
}

inline bool multimodeIsComplementaryCapable(MultimodeKind kind)
{
  return kind == MultimodeKind::Lowpass || kind == MultimodeKind::Highpass;
}

/**
 * Envelope-filter style follower with Peak / RMS / Opto detector character.
 * Output is 0…1 after Activation scaling and AR ballistics.
 */
class LevelEnvelope
{
public:
  void setSampleRate(float sr)
  {
    sampleRate_ = sr > 0.f ? sr : 44100.f;
    coeffsDirty_ = true;
  }

  void reset()
  {
    linSlope_ = 0.f;
    rmsSq_ = 0.f;
    envelope_ = 0.f;
  }

  /** Call once per block when attack/release may have changed. */
  void prepare(float attackMs, float releaseMs)
  {
    attackMs = std::max(0.1f, attackMs);
    releaseMs = std::max(0.1f, releaseMs);
    if (!coeffsDirty_ && attackMs == attackMs_ && releaseMs == releaseMs_)
      return;
    attackMs_ = attackMs;
    releaseMs_ = releaseMs;
    coeffsDirty_ = false;
    attackCoeff_ = std::min(1.f, 1.f / (attackMs_ * sampleRate_ / 4000.f));
    releaseCoeff_ = std::min(1.f, 1.f / (releaseMs_ * sampleRate_ / 4000.f));
    constexpr float kRmsWindowMs = 5.f;
    rmsCoeff_ = std::min(1.f, 1.f / (kRmsWindowMs * sampleRate_ / 4000.f));
  }

  float process(float detL, float detR, float activationLin, float attackMs,
                float releaseMs, DetectorMode mode)
  {
    prepare(attackMs, releaseMs);

    const float linked =
      std::max(std::fabs(detL), std::fabs(detR)) * std::max(0.f, activationLin);

    if (mode == DetectorMode::Rms)
    {
      const float sq = linked * linked;
      sanitize(rmsSq_);
      rmsSq_ += (sq - rmsSq_) * rmsCoeff_;
      linSlope_ = std::sqrt(std::max(0.f, rmsSq_));
    }
    else if (mode == DetectorMode::Peak)
    {
      sanitize(linSlope_);
      if (linked >= linSlope_)
        linSlope_ = linked;
      else
        linSlope_ += (linked - linSlope_) * releaseCoeff_;
    }
    else
    {
      sanitize(linSlope_);
      linSlope_ +=
        (linked - linSlope_) * (linked > linSlope_ ? attackCoeff_ : releaseCoeff_);
    }

    const float D = std::min(1.f, linSlope_);
    const float coeff = (D > envelope_) ? attackCoeff_ : releaseCoeff_;
    envelope_ = std::min(1.f, coeff * (envelope_ - D) + D);
    sanitize(envelope_);
    return envelope_;
  }

  float lastEnvelope() const { return envelope_; }

private:
  float sampleRate_ = 44100.f;
  float attackMs_ = -1.f;
  float releaseMs_ = -1.f;
  float attackCoeff_ = 1.f;
  float releaseCoeff_ = 1.f;
  float rmsCoeff_ = 1.f;
  bool coeffsDirty_ = true;
  float linSlope_ = 0.f;
  float rmsSq_ = 0.f;
  float envelope_ = 0.f;
};

/** Log-interpolate cutoff between floorHz and ceilingHz by env 0…1. */
inline float envelopeCutoffHz(float floorHz, float ceilingHz, float env)
{
  floorHz = std::clamp(floorHz, 10.f, 20000.f);
  ceilingHz = std::clamp(ceilingHz, 10.f, 20000.f);
  env = std::clamp(env, 0.f, 1.f);
  const float lo = std::log10(std::max(10.f, floorHz));
  const float hi = std::log10(std::max(10.f, ceilingHz));
  const float freq = std::pow(10.f, (hi - lo) * env + lo);
  if (ceilingHz < floorHz)
    return std::max(ceilingHz, std::min(floorHz, freq));
  return std::min(ceilingHz, std::max(floorHz, freq));
}

/**
 * Soft clip for resonant wet peaks. amount 0…1 (0 = bypass).
 * Small-signal gain ≈ 1; harder amount rounds hot resonance instead of screaming.
 */
inline float softClipSample(float x, float amount)
{
  if (amount <= 1.0e-6f)
    return x;
  const float drive = 1.f + amount * amount * 24.f;
  return static_cast<float>(std::tanh(static_cast<double>(x) * drive) / drive);
}

/**
 * Stereo multimode filter with inertia on cutoff/Q and optional complementary dry.
 */
class MultimodeFilter
{
public:
  static constexpr int kMaxOrder = 4;

  void setSampleRate(float sr)
  {
    sampleRate_ = sr > 0.f ? sr : 44100.f;
    samplesPerMs_ = std::max(1, static_cast<int>(std::lround(sampleRate_ / 1000.0)));
    msLeft_ = samplesPerMs_;
    dirty_ = true;
  }

  void reset()
  {
    for (int ch = 0; ch < 2; ++ch)
    {
      for (int i = 0; i < kMaxOrder; ++i)
      {
        wet_[ch][i].reset();
        dry_[ch][i].reset();
      }
    }
    cutoff_.setNow(1000.f);
    resonance_.setNow(0.707f);
    dirty_ = true;
  }

  void setInertiaMs(float ms)
  {
    const int len = std::clamp(static_cast<int>(std::lround(ms)), 1, 200);
    if (len != cutoff_.ramp.length())
    {
      cutoff_.ramp.setLength(len);
      resonance_.ramp.setLength(len);
    }
  }

  void setMode(int mode)
  {
    const int m = std::clamp(mode, 0, 12);
    if (m != mode_)
    {
      mode_ = m;
      dirty_ = true;
    }
  }

  void setResonanceInertia(float resonance)
  {
    resonance_.setInertia(std::clamp(resonance, 0.1f, 32.f));
  }

  void setCutoffInertia(float freqHz)
  {
    cutoff_.setInertia(std::clamp(freqHz, 10.f, 20000.f));
  }

  /** Immediate cutoff (envelope follower); skips cutoff inertia. */
  void setCutoffNow(float freqHz)
  {
    const float f = std::clamp(freqHz, 10.f, 20000.f);
    const float cur = cutoff_.getLast();
    // Skip sub-cent updates — avoids RBJ rebuild storms from envelope noise.
    if (std::fabs(f - cur) <= 1.0e-4f * std::max(cur, 10.f))
      return;
    cutoff_.setNow(f);
    dirty_ = true;
  }

  float lastCutoffHz() const { return cutoff_.getLast(); }
  float lastResonance() const { return resonance_.getLast(); }
  int mode() const { return mode_; }

  void processStereo(float& L, float& R, float mix, float softClip = 0.f)
  {
    advanceTimer();
    if (dirty_ || cutoff_.active() || resonance_.active())
      recalculate();

    mix = std::clamp(mix, 0.f, 1.f);
    softClip = std::clamp(softClip, 0.f, 1.f);
    const float inL = L;
    const float inR = R;
    const bool clip = softClip > 1.0e-6f;

    // Default Mix=100%: skip complementary dry (full wet).
    if (mix >= 1.f)
    {
      L = processChain(wet_[0], inL);
      R = processChain(wet_[1], inR);
      if (clip)
      {
        L = softClipSample(L, softClip);
        R = softClipSample(R, softClip);
      }
      sanitizeChain(wet_[0]);
      sanitizeChain(wet_[1]);
      return;
    }

    // Mix=0: dry only (complementary when LP/HP, else true bypass).
    if (mix <= 0.f)
    {
      if (complementary_)
      {
        const float compL = processChain(dry_[0], inL);
        const float compR = processChain(dry_[1], inR);
        L = inL + (compL - inL) * complementAmt_;
        R = inR + (compR - inR) * complementAmt_;
        sanitizeChain(dry_[0]);
        sanitizeChain(dry_[1]);
      }
      // else L/R already dry — soft clip is wet-only
      return;
    }

    float wetL = processChain(wet_[0], inL);
    float wetR = processChain(wet_[1], inR);
    if (clip)
    {
      wetL = softClipSample(wetL, softClip);
      wetR = softClipSample(wetR, softClip);
    }

    float dryL = inL;
    float dryR = inR;
    if (complementary_)
    {
      const float compL = processChain(dry_[0], inL);
      const float compR = processChain(dry_[1], inR);
      dryL = inL + (compL - inL) * complementAmt_;
      dryR = inR + (compR - inR) * complementAmt_;
      sanitizeChain(dry_[0]);
      sanitizeChain(dry_[1]);
    }

    L = mix * wetL + (1.f - mix) * dryL;
    R = mix * wetR + (1.f - mix) * dryR;
    sanitizeChain(wet_[0]);
    sanitizeChain(wet_[1]);
  }

private:
  void advanceTimer()
  {
    if (--msLeft_ > 0)
      return;
    msLeft_ = samplesPerMs_;
    const bool moving = cutoff_.active() || resonance_.active();
    cutoff_.step();
    resonance_.step();
    // Only force coeff rebuild while inertia is actually ramping.
    if (moving || cutoff_.active() || resonance_.active())
      dirty_ = true;
  }

  float processChain(BiquadD1* chain, float in)
  {
    float x = in;
    for (int i = 0; i < order_; ++i)
      x = static_cast<float>(chain[i].process(x));
    return x;
  }

  void sanitizeChain(BiquadD1* chain)
  {
    for (int i = 0; i < order_; ++i)
      chain[i].sanitize();
  }

  void recalculate()
  {
    dirty_ = false;
    MultimodeKind kind {};
    multimodeFromPlain(mode_, kind, order_);
    order_ = std::clamp(order_, 1, kMaxOrder);

    const float freq = cutoff_.getLast();
    const float q = resonance_.getLast();
    const float stageQ = std::pow(q, 1.f / static_cast<float>(order_));
    const float sr = sampleRate_;

    BiquadCoeffs wetCoeff;
    switch (kind)
    {
      case MultimodeKind::Lowpass:
        wetCoeff.setLpRbj(freq, stageQ, sr);
        break;
      case MultimodeKind::Highpass:
        wetCoeff.setHpRbj(freq, stageQ, sr);
        break;
      case MultimodeKind::Bandpass:
        wetCoeff.setBpRbj(freq, stageQ, sr);
        break;
      case MultimodeKind::Bandreject:
        wetCoeff.setBrRbj(freq, order_ * 0.1 * q, sr);
        break;
      case MultimodeKind::Allpass:
        wetCoeff.setAllpass(freq, 1.f, sr);
        break;
    }

    for (int ch = 0; ch < 2; ++ch)
    {
      for (int i = 0; i < order_; ++i)
        wet_[ch][i].copyCoeffs(wetCoeff);
    }

    complementary_ = multimodeIsComplementaryCapable(kind);
    if (complementary_)
    {
      const float excess = std::max(0.f, stageQ - 0.85f);
      complementAmt_ = 1.f / (1.f + excess * excess * 4.f);

      BiquadCoeffs dryCoeff;
      if (kind == MultimodeKind::Lowpass)
        dryCoeff.setHpRbj(freq, stageQ, sr);
      else
        dryCoeff.setLpRbj(freq, stageQ, sr);

      for (int ch = 0; ch < 2; ++ch)
      {
        for (int i = 0; i < order_; ++i)
          dry_[ch][i].copyCoeffs(dryCoeff);
      }
    }
  }

  float sampleRate_ = 44100.f;
  int samplesPerMs_ = 44;
  int msLeft_ = 44;
  int mode_ = 0;
  int order_ = 1;
  bool dirty_ = true;
  bool complementary_ = false;
  float complementAmt_ = 1.f;

  ExpInertia cutoff_ { ExponentialRamp(20), 1000.f };
  ExpInertia resonance_ { ExponentialRamp(20), 0.707f };

  BiquadD1 wet_[2][kMaxOrder] {};
  BiquadD1 dry_[2][kMaxOrder] {};
};

} // namespace Dsp
} // namespace calfNXT
