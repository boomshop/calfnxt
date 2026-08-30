#pragma once

// Stereo-linked TD-PSOLA. Analysis marks every input period; synthesis hops
// at period/ratio so the same mark can be repeated (pitch up) or skipped
// (pitch down). One ratio, identical grain positions on L and R.
//
// wetGate_ (0…1) crossfades wet↔delayed-dry. Duck to 0 across unvoiced /
// re-attack / octave leaps so grain rebuilds never hard-cut the output.

#include "dsp_math.h"

#include <algorithm>
#include <cmath>
#include <cstdint>

namespace calfNXT {
namespace Dsp {

class LinkedPsola
{
public:
  static constexpr int kSize = 32768;
  static constexpr int kMask = kSize - 1;
  static constexpr int kMaxGrains = 12;

  void reset()
  {
    for (int i = 0; i < kSize; ++i)
    {
      l_[i] = 0.f;
      r_[i] = 0.f;
    }
    w_ = 0;
    markIndex_ = 0;
    haveMark_ = false;
    anaAcc_ = 0.f;
    synAcc_ = 0.f;
    nGrains_ = 0;
    periodSm_ = 200.f;
    mix_ = 0.f;
    wetGate_ = 0.f;
    xfLpL_ = xfLpR_ = 0.f;
    for (int i = 0; i < kMaxGrains; ++i)
      grains_[i] = {};
  }

  void write(float inL, float inR)
  {
    l_[w_] = inL;
    r_[w_] = inR;
    w_ = (w_ + 1) & kMask;
  }

  float read(int ch, int delay) const
  {
    delay = std::clamp(delay, 1, kSize - 2);
    const float* b = ch ? r_ : l_;
    return b[(w_ - delay) & kMask];
  }

  float readLerp(int ch, float delay) const
  {
    delay = std::clamp(delay, 1.f, float(kSize - 3));
    const int i0 = static_cast<int>(delay);
    const float frac = delay - float(i0);
    const float* b = ch ? r_ : l_;
    const float a = b[(w_ - i0) & kMask];
    const float c = b[(w_ - (i0 + 1)) & kMask];
    return a + (c - a) * frac;
  }

  float peekDetect(int delay, int mode) const
  {
    const float L = read(0, delay);
    const float R = read(1, delay);
    switch (mode)
    {
      case 1:
        return L;
      case 2:
        return R;
      case 3:
      {
        const float aL = std::fabs(L);
        const float aR = std::fabs(R);
        const float s = aL + aR;
        if (s < 1.0e-12f)
          return 0.5f * (L + R);
        return (L * aL + R * aR) / s;
      }
      default:
        return 0.5f * (L + R);
    }
  }

  /** 0 = delayed dry, 1 = allow wet grains. Crossfaded in process(). */
  void setWetGate(float g) { wetGate_ = std::clamp(g, 0.f, 1.f); }

  /** Jump the period smoother (new syllable / register). Clears live grains
   *  only when already near dry — otherwise the clear itself plops. */
  void snapPeriod(float period)
  {
    periodSm_ = std::clamp(period, 24.f, float(kSize / 8));
    haveMark_ = false;
    anaAcc_ = 0.f;
    synAcc_ = 0.f;
    if (mix_ < 0.08f)
      nGrains_ = 0;
  }

  /**
   * `period` in full-rate samples, `ratio` = outHz/inHz (already smoothed),
   * `formant` 0…1, `latency` = PDC delay of the analysis centre.
   */
  void process(float period, float ratio, float formant, int latency, float& outL, float& outR,
               float& dryL, float& dryR)
  {
    latency = std::clamp(latency, 64, kSize / 4);
    period = std::clamp(period, 24.f, float(latency - 16));
    ratio = std::clamp(ratio, 0.5f, 2.f);
    formant = std::clamp(formant, 0.f, 1.f);

    // Slow period only — hop-level updates handle glides. Fast adaptive
    // coeffs here make extreme leaps click inside the grain train.
    periodSm_ += (period - periodSm_) * 0.0012f;
    const float p = std::max(24.f, periodSm_);
    const float Ha = p;
    const float Hs = std::max(12.f, p / ratio);
    const float grainLen = std::min(float(latency * 2 - 16), 2.f * p);
    const float stretch = formant * 1.f + (1.f - formant) * ratio;
    // Hann COLA is unity at hop = grainLen/2 (= period at ratio 1).
    const float gain = std::clamp(Hs / std::max(1.f, grainLen * 0.5f), 0.55f, 1.25f);

    if (!haveMark_)
    {
      markIndex_ = (w_ - latency) & kMask;
      haveMark_ = true;
    }

    // Always keep analysis marks fresh (even while ducked).
    anaAcc_ += 1.f;
    while (anaAcc_ >= Ha)
    {
      anaAcc_ -= Ha;
      markIndex_ = (w_ - latency) & kMask;
    }

    // Spawn only when the gate wants wet — avoids building a wrong-period
    // train during S / re-attack / octave duck.
    if (wetGate_ > 0.45f)
    {
      synAcc_ += 1.f;
      while (synAcc_ >= Hs)
      {
        synAcc_ -= Hs;
        spawnGrain(grainLen, stretch, gain);
      }
    }

    dryL = read(0, latency);
    dryR = read(1, latency);

    float accL = 0.f;
    float accR = 0.f;
    for (int i = 0; i < nGrains_;)
    {
      Grain& g = grains_[i];
      if (g.pos >= g.length)
      {
        grains_[i] = grains_[nGrains_ - 1];
        --nGrains_;
        continue;
      }
      const float t = static_cast<float>(g.pos);
      const float denom = std::max(1.f, g.length - 1.f);
      const float hann = 0.5f - 0.5f * std::cos(2.f * float(M_PI) * t / denom);
      const int dist = (w_ - g.markIndex) & kMask;
      const float delay = float(dist) - (t - g.length * 0.5f) * g.stretch;
      const float w = hann * g.gain;
      accL += w * readLerp(0, delay);
      accR += w * readLerp(1, delay);
      ++g.pos;
      ++i;
    }

    if (nGrains_ <= 0)
    {
      accL = dryL;
      accR = dryR;
    }

    // Crossfade wet↔delayed-dry (xf-hp-v3 timing — best plop scores).
    // Only strip sub/LF from (wet−dry) while slewing: stronger HP (~120 Hz)
    // was killing plops but briefly phase-smeared like a flanger.
    const float target = wetGate_;
    const float rate = target > mix_ ? 0.0010f : 0.0035f;
    const float before = mix_;
    mix_ += (target - mix_) * rate;
    const bool slewing = std::fabs(target - mix_) > 0.0008f || std::fabs(mix_ - before) > 1.0e-6f;

    float diffL = accL - dryL;
    float diffR = accR - dryR;
    if (slewing)
    {
      // ~30 Hz — thump/plop only, leave mids alone (less phaser artefact).
      xfLpL_ += 0.004f * (diffL - xfLpL_);
      xfLpR_ += 0.004f * (diffR - xfLpR_);
      diffL -= xfLpL_;
      diffR -= xfLpR_;
    }
    else
    {
      xfLpL_ *= 0.995f;
      xfLpR_ *= 0.995f;
    }

    outL = dryL + diffL * mix_;
    outR = dryR + diffR * mix_;
    if (mix_ < 0.02f && wetGate_ < 0.02f)
      nGrains_ = 0;

    sanitizeDenormal(outL);
    sanitizeDenormal(outR);
  }

private:
  struct Grain
  {
    int markIndex = 0;
    float stretch = 1.f;
    float length = 1.f;
    float gain = 1.f;
    int pos = 0;
  };

  void spawnGrain(float grainLen, float stretch, float gain)
  {
    if (nGrains_ >= kMaxGrains)
      return;
    Grain& g = grains_[nGrains_++];
    g.markIndex = markIndex_;
    g.stretch = stretch;
    g.length = std::max(48.f, grainLen);
    g.gain = gain;
    g.pos = 0;
  }

  float l_[kSize] {};
  float r_[kSize] {};
  int w_ = 0;
  int markIndex_ = 0;
  bool haveMark_ = false;
  float anaAcc_ = 0.f;
  float synAcc_ = 0.f;
  float periodSm_ = 200.f;
  Grain grains_[kMaxGrains] {};
  int nGrains_ = 0;
  float mix_ = 0.f;
  float wetGate_ = 0.f;
  float xfLpL_ = 0.f;
  float xfLpR_ = 0.f;
};

} // namespace Dsp
} // namespace calfNXT
