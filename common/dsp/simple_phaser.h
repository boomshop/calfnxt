#pragma once

// Calf-heritage mono phaser: cascaded identical first-order allpasses + feedback.
// LFO is a triangle wave modulating allpass fc in cents around center frequency.
// Stereo = two instances with a phase offset (see Phaser plugin).
//
// Fixes vs classic Calf:
// - set_stages(0→N) no longer reads x1[stages-1] when stages==0
// - denormal sanitize every control step + on state
// - dry/wet gain smoothing is sample-rate aware (~1.5 ms)
// - optional silence fast-path (still advances LFO for the response chart)

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

class SimplePhaser
{
public:
  static constexpr int kMaxStages = 12;
  static constexpr int kControlPeriod = 32;

  void setup(float sampleRate)
  {
    sr_ = sampleRate > 0.f ? sampleRate : 44100.f;
    odsr_ = 1.0 / static_cast<double>(sr_);
    // ~1.5 ms gain ramp (classic Calf used a fixed 64-sample inertia).
    const float n = std::max(1.f, sr_ * 0.0015f);
    wetDelta_ = 1.f / n;
    dryDelta_ = wetDelta_;
    reset();
  }

  void reset()
  {
    cnt_ = 0;
    state_ = 0.f;
    phase_ = 0.0;
    for (int i = 0; i < kMaxStages; ++i)
      x1_[i] = y1_[i] = 0.f;
    wetCur_ = wetTgt_;
    dryCur_ = dryTgt_;
    controlStep();
  }

  void setBaseFreq(float hz) { baseFrq_ = std::clamp(hz, 20.f, 20000.f); }
  void setModDepthCents(float cents) { modDepth_ = std::clamp(cents, 0.f, 10800.f); }
  void setFeedback(float fb) { fb_ = std::clamp(fb, -0.99f, 0.99f); }
  void setWet(float wet) { wetTgt_ = std::max(0.f, wet); }
  void setDry(float dry) { dryTgt_ = std::max(0.f, dry); }
  void setLfoActive(bool on) { lfoActive_ = on; }
  void setRateHz(float hz)
  {
    rateHz_ = std::clamp(hz, 0.01f, 20.f);
    // One LFO cycle = phase 1.0 (fractional turns).
    dphase_ = static_cast<double>(rateHz_) * odsr_;
  }

  void setStages(int n)
  {
    const int next = std::clamp(n, 1, kMaxStages);
    if (next > stages_)
    {
      const float sx = stages_ > 0 ? x1_[stages_ - 1] : 0.f;
      const float sy = stages_ > 0 ? y1_[stages_ - 1] : 0.f;
      for (int i = stages_; i < next; ++i)
      {
        x1_[i] = sx;
        y1_[i] = sy;
      }
    }
    stages_ = next;
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

  float lastApFreqHz() const { return lastApFreq_; }
  float dryLast() const { return dryCur_; }
  float wetLast() const { return wetCur_; }
  float feedback() const { return fb_; }
  int stages() const { return stages_; }
  float apCoef() const { return a0_; }

  /**
   * Process one sample. `active` gates wet (Calf `on`); dry always mixes.
   * Returns output before IoStage out_gain.
   */
  float process(float in, bool active)
  {
    if (++cnt_ >= kControlPeriod)
      controlStep();

    // Silence fast-path: keep LFO/coeffs alive for the chart, skip the chain.
    // Still slew dry/wet so target changes during silence don't click on return.
    const float absIn = std::fabs(in);
    if (absIn < 1.0e-10f && std::fabs(state_) < 1.0e-10f)
    {
      state_ = 0.f;
      const float dry = advanceGain(dryCur_, dryTgt_, dryDelta_);
      advanceGain(wetCur_, wetTgt_, wetDelta_);
      return in * dry;
    }

    float fd = in + state_ * fb_;
    for (int j = 0; j < stages_; ++j)
      fd = processAp(fd, x1_[j], y1_[j], a0_);
    state_ = fd;
    sanitizeDenormal(state_);

    const float dry = advanceGain(dryCur_, dryTgt_, dryDelta_);
    const float wet = advanceGain(wetCur_, wetTgt_, wetDelta_);
    float out = in * dry;
    if (active)
      out += fd * wet;
    sanitizeDenormal(out);
    return out;
  }

  /** Complex magnitude of dry + wet·P/(1−fb·P) with P = AP^N (current coeffs). */
  float freqGain(float freqHz) const
  {
    const double w = 2.0 * M_PI * static_cast<double>(freqHz) / static_cast<double>(sr_);
    using C = std::complex<double>;
    const C zInv = std::exp(C(0.0, -w)); // z^-1
    // First-order AP: H(z) = (a0 + z^-1) / (1 + a0·z^-1) with a1=1, b1=a0 (Calf set_ap_w).
    const C num = C(static_cast<double>(a0_)) + zInv;
    const C den = C(1.0) + C(static_cast<double>(a0_)) * zInv;
    C stg = num / den;
    C p(1.0);
    for (int i = 0; i < stages_; ++i)
      p *= stg;
    p = p / (C(1.0) - C(static_cast<double>(fb_)) * p);
    const C h = C(static_cast<double>(dryCur_)) + C(static_cast<double>(wetCur_)) * p;
    return static_cast<float>(std::abs(h));
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

  static float processAp(float in, float& x1, float& y1, float a0)
  {
    const float out = (in - y1) * a0 + x1;
    x1 = in;
    y1 = out;
    return out;
  }

  void controlStep()
  {
    cnt_ = 0;
    // Triangle wave ∈ [-1, 1] from fractional phase (matches Calf fixed-point fold).
    double p = phase_;
    p -= std::floor(p);
    // Map [0,1) → triangle via saw fold (same shape as Calf's bit-fold triangle).
    double t = p * 4.0; // 0…4
    if (t >= 2.0)
      t = 4.0 - t; // 2…0…2 → peak at 1 and 3
    // t is now 0…2…0 over a cycle; center to ±1
    const double vf = t - 1.0;

    float freq = baseFrq_ * std::pow(2.0f, static_cast<float>(vf) * modDepth_ / 1200.f);
    freq = std::clamp(freq, 10.f, 0.49f * sr_);
    lastApFreq_ = freq;

    // Calf: set_ap_w(freq * (π/2) * odsr) → tan(π·fc/(2·sr))
    const float w = freq * static_cast<float>(M_PI * 0.5 * odsr_);
    const float x = std::tan(w);
    const float q = 1.f / (1.f + x);
    a0_ = (x - 1.f) * q;

    if (lfoActive_)
    {
      phase_ += dphase_ * static_cast<double>(kControlPeriod);
      phase_ -= std::floor(phase_);
    }

    for (int i = 0; i < stages_; ++i)
    {
      sanitizeDenormal(x1_[i]);
      sanitizeDenormal(y1_[i]);
    }
    sanitizeDenormal(state_);
  }

  float sr_ = 44100.f;
  double odsr_ = 1.0 / 44100.0;
  double phase_ = 0.0;
  double dphase_ = 0.0;
  float rateHz_ = 0.1f;
  float baseFrq_ = 1000.f;
  float modDepth_ = 4000.f;
  float fb_ = 0.25f;
  float a0_ = 0.f;
  float lastApFreq_ = 1000.f;
  float state_ = 0.f;
  float x1_[kMaxStages] {};
  float y1_[kMaxStages] {};
  int stages_ = 6;
  int cnt_ = 0;
  bool lfoActive_ = true;
  float wetTgt_ = 0.5f;
  float dryTgt_ = 1.f;
  float wetCur_ = 0.5f;
  float dryCur_ = 1.f;
  float wetDelta_ = 1.f / 64.f;
  float dryDelta_ = 1.f / 64.f;
};

} // namespace Dsp
} // namespace calfNXT
