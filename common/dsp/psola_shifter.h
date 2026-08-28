#pragma once

// Stereo-linked TD-PSOLA. Analysis marks every input period; synthesis hops
// at period/ratio so the same mark can be repeated (pitch up) or skipped
// (pitch down). One ratio, identical grain positions on L and R.

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

    // Period only: hop jitter clicks. Ratio is smoothed by the caller.
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

    anaAcc_ += 1.f;
    while (anaAcc_ >= Ha)
    {
      anaAcc_ -= Ha;
      markIndex_ = (w_ - latency) & kMask;
    }

    synAcc_ += 1.f;
    while (synAcc_ >= Hs)
    {
      synAcc_ -= Hs;
      spawnGrain(grainLen, stretch, gain);
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
      outL = dryL;
      outR = dryR;
    }
    else
    {
      outL = accL;
      outR = accR;
    }
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
};

} // namespace Dsp
} // namespace calfNXT
