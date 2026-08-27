#pragma once

// Calf-heritage mono flanger: single-tap delay + feedback (chorus + FB).
// LFO is a sine modulating delay between min_delay and min_delay+mod_depth.
// Stereo = two instances with a phase offset (see Flanger plugin).
//
// Fixes vs classic Calf:
// - larger delay buffer (safe up to ~20 ms at 192 kHz)
// - denormal sanitize on feedback / delay state
// - dry/wet gain smoothing is sample-rate aware (~1.5 ms)
// - optional silence fast-path (still advances LFO for the response chart)

#include "delay_line.h"
#include "dsp_math.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>
#include <complex>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace calfNXT {
namespace Dsp {

class SimpleFlanger
{
public:
  // 10 ms + 10 ms + pad at 192 kHz ≈ 3840; 8192 leaves headroom.
  static constexpr int kMaxDelay = 8192;

  void setup(float sampleRate)
  {
    sr_ = sampleRate > 0.f ? sampleRate : 44100.f;
    odsr_ = 1.0 / static_cast<double>(sr_);
    const float n = std::max(1.f, sr_ * 0.0015f);
    wetDelta_ = 1.f / n;
    dryDelta_ = wetDelta_;
    // Match Calf's ~1024-sample delay-tap ramp.
    delaySlew_ = 1.f / 1024.f;
    rebuildDelaySamples();
    setRateHz(rateHz_);
    reset();
  }

  void reset()
  {
    delay_.reset();
    phase_ = 0.0;
    delayCur_ = minDelaySamp_ + 2.f + 0.5f * modDepthSamp_;
    delayCur_ = std::clamp(delayCur_, 1.f, float(kMaxDelay - 2));
    lastDelay_ = delayCur_;
    wetCur_ = wetTgt_;
    dryCur_ = dryTgt_;
  }

  /** Minimum delay in milliseconds (Calf flanger port). */
  void setMinDelayMs(float ms)
  {
    minDelayMs_ = std::clamp(ms, 0.1f, 10.f);
    rebuildDelaySamples();
  }

  /** Modulation depth in milliseconds. */
  void setModDepthMs(float ms)
  {
    modDepthMs_ = std::clamp(ms, 0.1f, 10.f);
    rebuildDelaySamples();
  }

  void setFeedback(float fb) { fb_ = std::clamp(fb, -0.99f, 0.99f); }
  void setWet(float wet) { wetTgt_ = std::max(0.f, wet); }
  void setDry(float dry) { dryTgt_ = std::max(0.f, dry); }
  void setLfoActive(bool on) { lfoActive_ = on; }

  void setRateHz(float hz)
  {
    rateHz_ = std::clamp(hz, 0.01f, 20.f);
    dphase_ = static_cast<double>(rateHz_) * odsr_;
  }

  /** Phase in turns 0…1 (not degrees). */
  void resetPhase(float turns)
  {
    phase_ = turns - std::floor(turns);
  }

  void setPhase(float turns) { phase_ = turns - std::floor(turns); }
  float phase() const { return static_cast<float>(phase_); }

  void incPhase(float turns)
  {
    phase_ += turns;
    phase_ -= std::floor(phase_);
  }

  float lastDelaySamples() const { return lastDelay_; }
  float dryLast() const { return dryCur_; }
  float wetLast() const { return wetCur_; }
  float feedback() const { return fb_; }
  bool isIdle() const { return std::fabs(lastFd_) < 1.0e-10f; }

  /**
   * Block silence when already idle: advance LFO + delay tap in O(1).
   * Dry/wet continue to slew (no snap). Must not be called while lastFd_ holds energy.
   */
  void advanceSilence(int nSamples)
  {
    if (nSamples <= 0)
      return;
    if (lfoActive_)
    {
      phase_ += dphase_ * static_cast<double>(nSamples);
      phase_ -= std::floor(phase_);
    }
    const float lfo = std::sin(static_cast<float>(2.0 * M_PI * phase_));
    float delayTgt = minDelaySamp_ + 2.f + modDepthSamp_ * (0.5f + 0.5f * lfo);
    delayTgt = std::clamp(delayTgt, 1.f, float(kMaxDelay - 2));
    const float a = 1.f - std::pow(1.f - delaySlew_, static_cast<float>(nSamples));
    delayCur_ += (delayTgt - delayCur_) * a;
    delayCur_ = std::clamp(delayCur_, 1.f, float(kMaxDelay - 2));
    lastDelay_ = delayCur_;
    for (int i = 0; i < nSamples; ++i)
    {
      advanceGain(dryCur_, dryTgt_, dryDelta_);
      advanceGain(wetCur_, wetTgt_, wetDelta_);
    }
    lastFd_ = 0.f;
  }

  /**
   * Process one sample. `active` gates wet (Calf `on`); dry always mixes.
   * Returns output before IoStage out_gain.
   */
  float process(float in, bool active)
  {
    if (lfoActive_)
    {
      phase_ += dphase_;
      phase_ -= std::floor(phase_);
    }

    const float lfo = std::sin(static_cast<float>(2.0 * M_PI * phase_));
    // Sweep min … min+depth (same span as Calf fix16 flanger).
    float delayTgt = minDelaySamp_ + 2.f + modDepthSamp_ * (0.5f + 0.5f * lfo);
    delayTgt = std::clamp(delayTgt, 1.f, float(kMaxDelay - 2));

    // Smooth tap length (Calf ramps over ~1024 samples on target changes).
    delayCur_ += (delayTgt - delayCur_) * delaySlew_;
    delayCur_ = std::clamp(delayCur_, 1.f, float(kMaxDelay - 2));
    lastDelay_ = delayCur_;

    // Keep reading the delay until its output is drained — do not gate on fb_
    // (fb≈0 would otherwise cut the remaining dry delay tail).
    const float absIn = std::fabs(in);
    if (absIn < 1.0e-10f && std::fabs(lastFd_) < 1.0e-10f)
    {
      lastFd_ = 0.f;
      delay_.write(0.f);
      const float dry = advanceGain(dryCur_, dryTgt_, dryDelta_);
      advanceGain(wetCur_, wetTgt_, wetDelta_);
      return in * dry;
    }

    float fd = delay_.readLerp(delayCur_);
    sanitizeDenormal(fd);
    lastFd_ = fd;

    const float dry = advanceGain(dryCur_, dryTgt_, dryDelta_);
    const float wet = advanceGain(wetCur_, wetTgt_, wetDelta_);
    float out = in * dry;
    if (active)
      out += fd * wet;
    sanitizeDenormal(out);

    float put = in + fb_ * fd;
    sanitizeDenormal(put);
    delay_.write(put);
    return out;
  }

  /** Comb |dry + wet · H| with H = delayed / (1 − fb · delayed), lerped delay. */
  float freqGain(float freqHz) const { return freqGain(freqHz, lastDelay_); }

  /** Same as freqGain, but with an explicit delay (for a display-slewed tap). */
  float freqGain(float freqHz, float delaySamples) const
  {
    const double w = 2.0 * M_PI * static_cast<double>(freqHz) / static_cast<double>(sr_);
    using C = std::complex<double>;
    const C zInv = std::exp(C(0.0, -w)); // z^-1
    const float delay = std::clamp(delaySamples, 1.f, float(kMaxDelay - 2));
    const double ldp = static_cast<double>(delay);
    const double fldp = std::floor(ldp);
    const C zn = std::pow(zInv, fldp); // z^-N
    const C zn1 = zn * zInv;           // z^-(N+1)
    const C delayed = zn + (zn1 - zn) * C(ldp - fldp);
    const C h = delayed / (C(1.0) - C(static_cast<double>(fb_)) * delayed);
    const C mix = C(static_cast<double>(dryCur_)) + C(static_cast<double>(wetCur_)) * h;
    return static_cast<float>(std::abs(mix));
  }

private:
  static float advanceGain(float& cur, float tgt, float delta)
  {
    const float d = tgt - cur;
    if (d > delta)
      cur += delta;
    else if (d < -delta)
      cur -= delta;
    else
      cur = tgt;
    sanitizeDenormal(cur);
    return cur;
  }

  void rebuildDelaySamples()
  {
    minDelaySamp_ = minDelayMs_ * 0.001f * sr_;
    modDepthSamp_ = modDepthMs_ * 0.001f * sr_;
  }

  DelayLine<kMaxDelay> delay_;
  float sr_ = 44100.f;
  double odsr_ = 1.0 / 44100.0;
  double phase_ = 0.0;
  double dphase_ = 0.0;
  float rateHz_ = 0.1f;
  float minDelayMs_ = 0.5f;
  float modDepthMs_ = 2.f;
  float minDelaySamp_ = 0.f;
  float modDepthSamp_ = 0.f;
  float delayCur_ = 2.f;
  float lastDelay_ = 2.f;
  float lastFd_ = 0.f;
  float fb_ = 0.8f;
  bool lfoActive_ = true;
  float delaySlew_ = 1.f / 1024.f;
  float wetTgt_ = 0.5f;
  float dryTgt_ = 1.f;
  float wetCur_ = 0.5f;
  float dryCur_ = 1.f;
  float wetDelta_ = 1.f / 64.f;
  float dryDelta_ = 1.f / 64.f;
};

} // namespace Dsp
} // namespace calfNXT
