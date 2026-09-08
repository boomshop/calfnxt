#pragma once

// Period-locked sub oscillator for octaver-style layers (not a pitch shift).
// Generates mono tone at f0/2 with selectable waveform + soft saturation.

#include "dsp_math.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace calfNXT {
namespace Dsp {

class SubHarmonic
{
public:
  enum Wave : int
  {
    kSine = 0,
    kTri = 1,
    kSquare = 2,
    kSaw = 3,
  };

  void reset()
  {
    phase_ = 0.f;
    env_ = 0.f;
    freqSm_ = 55.f;
    ampSm_ = 0.f;
  }

  /**
   * `f0Hz` = detected fundamental (sub plays at f0/2).
   * `gate` 0…1 from voiced/periodicity.
   * `wave` 0…3, `harmonics` 0…1 soft-sat amount, `tone` 0…1 (dark→bright LP).
   */
  float process(float f0Hz, float gate, float sampleRate, int wave, float harmonics, float tone)
  {
    gate = std::clamp(gate, 0.f, 1.f);
    harmonics = std::clamp(harmonics, 0.f, 1.f);
    tone = std::clamp(tone, 0.f, 1.f);
    sampleRate = std::max(1000.f, sampleRate);

    const float targetHz = (f0Hz > 1.f && gate > 0.01f) ? std::clamp(f0Hz * 0.5f, 20.f, 400.f) : freqSm_;
    freqSm_ += (targetHz - freqSm_) * 0.0025f;
    sanitizeDenormal(freqSm_);

    const float envTarget = (f0Hz > 1.f) ? gate : 0.f;
    const float envRate = envTarget > env_ ? 0.0012f : 0.004f;
    env_ += (envTarget - env_) * envRate;
    sanitizeDenormal(env_);

    if (env_ < 1.0e-4f)
    {
      ampSm_ *= 0.98f;
      lp_ *= 0.98f;
      return 0.f;
    }

    const float inc = freqSm_ / sampleRate;
    phase_ += inc;
    if (phase_ >= 1.f)
      phase_ -= std::floor(phase_);

    float s = 0.f;
    switch (std::clamp(wave, 0, 3))
    {
      case kTri:
      {
        const float t = phase_ < 0.5f ? phase_ * 4.f - 1.f : 3.f - phase_ * 4.f;
        s = t;
        break;
      }
      case kSquare:
        s = phase_ < 0.5f ? 1.f : -1.f;
        break;
      case kSaw:
        s = phase_ * 2.f - 1.f;
        break;
      default:
        s = std::sin(phase_ * 2.f * float(M_PI));
        break;
    }

    // Soft saturation adds odd harmonics without hard clipping.
    if (harmonics > 0.001f)
    {
      const float drive = 1.f + harmonics * 4.f;
      s = std::tanh(s * drive) / std::tanh(drive);
    }

    // Tone: one-pole LP, dark ≈ 180 Hz … bright ≈ 2.5 kHz at 48 kHz.
    const float fc = 180.f * std::pow(2500.f / 180.f, tone);
    const float a = 1.f - std::exp(-2.f * float(M_PI) * fc / sampleRate);
    lp_ += a * (s - lp_);
    sanitizeDenormal(lp_);

    ampSm_ += (env_ - ampSm_) * 0.01f;
    return lp_ * ampSm_ * 0.55f;
  }

private:
  float phase_ = 0.f;
  float env_ = 0.f;
  float freqSm_ = 55.f;
  float ampSm_ = 0.f;
  float lp_ = 0.f;
};

} // namespace Dsp
} // namespace calfNXT
