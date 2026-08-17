#pragma once

// Port of Calf Studio Gear `dsp::simple_lfo` (sine / triangle / square / saw).
// Phase walks 0…1; get_value() returns −1…1 * amount.

#include "dsp_math.h"

#include <algorithm>
#include <cmath>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace calfNXT {
namespace Dsp {

class SimpleLfo
{
public:
  enum Mode : int
  {
    Sine = 0,
    Triangle = 1,
    Square = 2,
    SawUp = 3,
    SawDown = 4,
  };

  void activate()
  {
    active_ = true;
    phase_ = 0.f;
  }

  void deactivate() { active_ = false; }

  void setParams(float freqHz, int mode, float phaseOffset, float sampleRate,
                 float amount = 1.f, float pulseWidth = 1.f)
  {
    freq_ = freqHz;
    mode_ = mode;
    offset_ = phaseOffset;
    sampleRate_ = sampleRate > 0.f ? sampleRate : 44100.f;
    amount_ = amount;
    pulseWidth_ = pulseWidth;
  }

  void setFreq(float freqHz) { freq_ = freqHz; }
  void setMode(int mode) { mode_ = mode; }
  void setAmount(float a) { amount_ = a; }
  void setOffset(float o) { offset_ = o; }

  void setPhase(float ph)
  {
    phase_ = std::fabs(ph);
    if (phase_ >= 1.f)
      phase_ = std::fmod(phase_, 1.f);
    sanitize(phase_);
  }

  float phase() const { return phase_; }

  float getValue() const { return getValueFromPhase(phase_); }

  float getValueFromPhase(float ph) const
  {
    float val = 0.f;
    float phs = std::min(100.f, ph / std::min(1.99f, std::max(0.01f, pulseWidth_)) + offset_);
    if (phs > 1.f)
      phs = std::fmod(phs, 1.f);
    switch (mode_)
    {
      default:
      case Sine:
        val = std::sin((phs * 360.f) * float(M_PI) / 180.f);
        break;
      case Triangle:
        if (phs > 0.75f)
          val = (phs - 0.75f) * 4.f - 1.f;
        else if (phs > 0.5f)
          val = (phs - 0.5f) * 4.f * -1.f;
        else if (phs > 0.25f)
          val = 1.f - (phs - 0.25f) * 4.f;
        else
          val = phs * 4.f;
        break;
      case Square:
        val = (phs < 0.5f) ? -1.f : 1.f;
        break;
      case SawUp:
        val = phs * 2.f - 1.f;
        break;
      case SawDown:
        val = 1.f - phs * 2.f;
        break;
    }
    return val * amount_;
  }

  void advance(uint32_t count)
  {
    if (!(sampleRate_ > 0.f))
      return;
    setPhase(phase_ + static_cast<float>(count) * freq_ * (1.f / sampleRate_));
  }

private:
  float phase_ = 0.f;
  float freq_ = 1.f;
  float offset_ = 0.f;
  float amount_ = 1.f;
  float pulseWidth_ = 1.f;
  float sampleRate_ = 44100.f;
  int mode_ = Sine;
  bool active_ = false;
};

} // namespace Dsp
} // namespace calfNXT
