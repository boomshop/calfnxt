#pragma once

// Calf-heritage multi-tap chorus (no feedback): DelayLine + sine_multi_lfo.
// Stereo = two instances with a phase offset (see Chorus plugin).
// Post-filter lives in the plugin (ComplementaryBandFilter on wet).

#include "delay_line.h"
#include "dsp_math.h"
#include "gain_util.h"

#include <algorithm>
#include <cmath>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace calfNXT {
namespace Dsp {

/** Multi-voice sine LFO (Calf sine_multi_lfo), phase in turns 0…1. */
class SineMultiLfo
{
public:
  static constexpr int kMaxVoices = 8;

  void setVoices(int n)
  {
    voices_ = std::clamp(n, 1, kMaxVoices);
    scale_ = std::sqrt(1.f / static_cast<float>(voices_));
    setOverlap(overlap_);
  }

  void setOverlap(float overlap)
  {
    overlap_ = std::clamp(overlap, 0.f, 1.f);
    const float range = 1.f + (1.f - overlap_) * static_cast<float>(voices_ - 1);
    const float scaling = 1.f / range;
    // Match Calf voice_offset/65536 = 2·(1−overlap)/range; depth band = 1/range.
    voiceOffset_ = 2.f * (1.f - overlap_) / range;
    voiceDepth_ = scaling;
  }

  /** Inter-voice phase step in turns (already / max(voices-1,1) from plugin). */
  void setVoicePhaseStep(float turns) { vphase_ = turns - std::floor(turns); }

  void setRateHz(float hz, float sr)
  {
    sr = sr > 0.f ? sr : 44100.f;
    rateHz_ = std::clamp(hz, 0.01f, 20.f);
    dphase_ = rateHz_ / sr;
  }

  void resetPhase(float turns) { phase_ = turns - std::floor(turns); }
  void setPhase(float turns) { phase_ = turns - std::floor(turns); }
  void incPhase(float turns)
  {
    phase_ += turns;
    phase_ -= std::floor(phase_);
  }

  float phase() const { return phase_; }
  int voices() const { return voices_; }
  float scale() const { return scale_; }
  float overlap() const { return overlap_; }
  float voiceOffset() const { return voiceOffset_; }
  float voiceDepth() const { return voiceDepth_; }
  float vphase() const { return vphase_; }

  void setLfoActive(bool on) { active_ = on; }
  bool lfoActive() const { return active_; }

  void step()
  {
    if (!active_)
      return;
    phase_ += dphase_;
    phase_ -= std::floor(phase_);
  }

  void advance(int nSamples)
  {
    if (!active_ || nSamples <= 0)
      return;
    phase_ += dphase_ * static_cast<float>(nSamples);
    phase_ -= std::floor(phase_);
  }

  /**
   * Calf get_value: returns roughly −1…+1 positioned in the voice’s overlap band.
   * Used both for delay modulation and for chart Y mapping.
   */
  float getValue(int voice) const
  {
    voice = std::clamp(voice, 0, voices_ - 1);
    float vp = phase_ + vphase_ * static_cast<float>(voice);
    vp -= std::floor(vp);
    const float sine = sineTurns(vp); // −1…1
    // Calf: −1 + voice·offset + (1+sine)/range  (full span ≈ −1…+1 across voices).
    return -1.f + static_cast<float>(voice) * voiceOffset_ + voiceDepth_ * (sine + 1.f);
  }

  /** Phase of a voice in turns (for chart X on rate panel). */
  float voicePhase(int voice) const
  {
    float vp = phase_ + vphase_ * static_cast<float>(std::clamp(voice, 0, voices_ - 1));
    vp -= std::floor(vp);
    return vp;
  }

private:
  float phase_ = 0.f;
  float dphase_ = 0.f;
  float vphase_ = 0.f;
  float rateHz_ = 0.1f;
  float overlap_ = 0.75f;
  float voiceOffset_ = 0.f;
  float voiceDepth_ = 1.f;
  float scale_ = 1.f;
  int voices_ = 4;
  bool active_ = true;
};

/**
 * Mono multi-tap chorus wet generator (no feedback).
 * Returns wet (already × √(1/N)); dry mix is done by the plugin.
 */
class SimpleChorus
{
public:
  static constexpr int kMaxDelay = 8192;

  void setup(float sampleRate)
  {
    sr_ = sampleRate > 0.f ? sampleRate : 44100.f;
    rebuildDelaySamples();
    lfo_.setRateHz(rateHz_, sr_);
    reset();
  }

  void reset()
  {
    delay_.reset();
    lfo_.resetPhase(0.f);
    lastEnergy_ = 0.f;
  }

  void setMinDelayMs(float ms)
  {
    minDelayMs_ = std::clamp(ms, 0.1f, 10.f);
    rebuildDelaySamples();
  }

  void setModDepthMs(float ms)
  {
    modDepthMs_ = std::clamp(ms, 0.1f, 10.f);
    rebuildDelaySamples();
  }

  void setRateHz(float hz)
  {
    rateHz_ = std::clamp(hz, 0.01f, 20.f);
    lfo_.setRateHz(rateHz_, sr_);
  }

  void setVoices(int n) { lfo_.setVoices(n); }
  void setOverlap(float o) { lfo_.setOverlap(o); }
  void setVoicePhaseStep(float turns) { lfo_.setVoicePhaseStep(turns); }
  void setLfoActive(bool on) { lfo_.setLfoActive(on); }
  void resetPhase(float turns) { lfo_.resetPhase(turns); }
  void setPhase(float turns) { lfo_.setPhase(turns); }
  void incPhase(float turns) { lfo_.incPhase(turns); }
  float phase() const { return lfo_.phase(); }
  const SineMultiLfo& lfo() const { return lfo_; }

  bool isIdle() const { return lastEnergy_ < 1.0e-8f; }

  /** Block silence: advance multi-LFO in O(1), clear energy tracking. */
  void advanceSilence(int nSamples)
  {
    lfo_.advance(nSamples);
    lastEnergy_ = 0.f;
  }

  /**
   * Process one sample → wet (× √1/N). Caller applies amount / dry / active / post.
   * Topology unchanged vs heritage: per-sample LFO taps; `sineTurns` replaces `std::sin`.
   */
  float processWet(float in)
  {
    const float absIn = std::fabs(in);
    lastEnergy_ = std::max(absIn, lastEnergy_ * 0.999f);

    if (absIn < 1.0e-10f && lastEnergy_ < 1.0e-8f)
    {
      lastEnergy_ = 0.f;
      delay_.write(0.f);
      lfo_.step();
      return 0.f;
    }

    delay_.write(in);

    float out = 0.f;
    const int nV = lfo_.voices();
    for (int v = 0; v < nV; ++v)
    {
      const float lfoVal = lfo_.getValue(v);
      float d = minDelaySamp_ + 2.f + modDepthSamp_ * (0.5f + 0.5f * lfoVal);
      d = std::clamp(d, 1.f, float(kMaxDelay - 2));
      out += delay_.readLerp(d);
    }

    lfo_.step();
    out *= lfo_.scale();
    return out;
  }

private:
  void rebuildDelaySamples()
  {
    minDelaySamp_ = minDelayMs_ * 0.001f * sr_;
    modDepthSamp_ = modDepthMs_ * 0.001f * sr_;
  }

  DelayLine<kMaxDelay> delay_;
  SineMultiLfo lfo_;
  float sr_ = 44100.f;
  float rateHz_ = 0.1f;
  float minDelayMs_ = 5.f;
  float modDepthMs_ = 6.f;
  float minDelaySamp_ = 0.f;
  float modDepthSamp_ = 0.f;
  float lastEnergy_ = 0.f;
};

} // namespace Dsp
} // namespace calfNXT
