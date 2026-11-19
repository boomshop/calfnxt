#pragma once

// Phase-vocoder pitch pedal (no pitch tracker). A dual-head delay crossfade
// amplitude-modulates at a rate that rises with |1 - ratio|: a few hertz of
// bubbling near ±4 st, a wobble at an octave, and a ring-mod-like mess at
// two octaves. Shifting STFT bins keeps the harmonic series and a steady level.
// Formants ride with the pitch. Upward bins that would pass Nyquist are dropped.
// Linked stereo (same hop). Unison parks on the dry delay of the same latency.

#include "dsp_math.h"
#include "fft_r2.h"

#include <algorithm>
#include <cmath>
#include <cstring>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace calfNXT {
namespace Dsp {

class BenderShifter
{
public:
  static constexpr int kFftMax = 8192;
  static constexpr int kRing = kFftMax * 2;
  // Below this the bins are wider than a low note's harmonics, and every
  // pitch turns into a metallic smear. Overlap cannot invent that resolution.
  static constexpr int kFftMin = 4096;

  BenderShifter() { setGrain(kFftMin); }

  void reset()
  {
    std::memset(in_, 0, sizeof in_);
    std::memset(ola_, 0, sizeof ola_);
    std::memset(lastPhase_, 0, sizeof lastPhase_);
    std::memset(sumPhase_, 0, sizeof sumPhase_);
    prevE_[0] = prevE_[1] = 0.0;
    n_ = 0;
    toneL_ = toneR_ = 0.f;
  }

  /** Process Left only and copy to Right. */
  void setMono(bool m) { mono_ = m; }

  /**
   * Analysis window in samples, plus how many times it overlaps (8, 16, 32).
   * The FFT is the largest power of two that fits, and never under kFftMin.
   * Latency equals that FFT. A larger overlap costs CPU and smooths attacks.
   */
  void setGrain(int samples, int overlap = 8)
  {
    grain_ = std::clamp(samples, 128, kFftMax * 2);
    overlap_ = overlap >= 32 ? 32 : overlap >= 16 ? 16 : 8;
    int fft = kFftMin;
    const int cap = std::min(std::max(grain_, kFftMin), kFftMax);
    while ((fft * 2) <= cap)
      fft *= 2;
    fft_ = fft;
    hop_ = std::max(1, fft_ / overlap_);
    lat_ = fft_;
    const float inv = 1.f / float(fft_);
    constexpr float kTwoPi = 2.f * float(M_PI);
    for (int i = 0; i < fft_; ++i)
    {
      const float hann = 0.5f * (1.f - std::cos(kTwoPi * float(i) * inv));
      const float s = std::sqrt(std::max(hann, 0.f));
      aw_[i] = s;
      // M Hann windows spaced by 1/M sum to M/2. Analysis × synthesis = Hann
      // scaled so those overlaps sum to 1.
      sw_[i] = s * (2.f / float(overlap_));
    }
  }

  int grain() const { return grain_; }

  /** PDC delay. Unity pitch and bypass are a pure delay of this many samples. */
  int latency() const { return lat_; }

  /** One-pole Tone coeff — call once per block, not per sample. */
  void setTone(float tone, float sr)
  {
    tone = std::clamp(tone, 0.f, 1.f);
    sr = std::max(sr, 1.f);
    if (tone == tone_ && sr == sr_)
      return;
    tone_ = tone;
    sr_ = sr;
    const float fc = 900.f * std::pow(18000.f / 900.f, tone);
    toneA_ = 1.f - std::exp(-2.f * float(M_PI) * fc / sr);
  }

  /**
   * `ratio` = 2^(semitones/12). `pitchAbs` = |smoothed pitch| in st (park zone).
   * `mix` 0…1 dry→wet; dry is delayed by the same latency as the vocoder.
   * Bypass outputs that dry tap so host latency does not jump.
   */
  void process(float inL, float inR, float ratio, float pitchAbs, float mix, bool bypass,
               float& outL, float& outR)
  {
    const int mask = kRing - 1;
    const int w = n_ & mask;
    const float xL = inL;
    const float xR = mono_ ? inL : inR;
    in_[0][w] = xL;
    in_[1][w] = xR;

    ratio_ = std::clamp(ratio, 0.24f, 4.1f);
    if (hop_ > 0 && ((n_ + 1) % hop_) == 0)
    {
      shiftFrame(0);
      shiftFrame(1);
    }

    float dryL = 0.f;
    float dryR = 0.f;
    float wetL = 0.f;
    float wetR = 0.f;
    if (n_ >= lat_)
    {
      const int r = (n_ - lat_) & mask;
      dryL = in_[0][r];
      dryR = mono_ ? dryL : in_[1][r];
      wetL = ola_[0][r];
      wetR = mono_ ? wetL : ola_[1][r];
      ola_[0][r] = 0.f;
      ola_[1][r] = 0.f;
    }
    ++n_;

    const float shifterAmt =
      pitchAbs <= 0.02f ? 0.f : std::min(1.f, (pitchAbs - 0.02f) / 0.15f);
    if (shifterAmt < 1.f)
    {
      wetL = dryL + (wetL - dryL) * shifterAmt;
      wetR = dryR + (wetR - dryR) * shifterAmt;
    }
    if (mono_)
      wetR = wetL;

    if (bypass || mix <= 0.f)
    {
      outL = dryL;
      outR = mono_ ? dryL : dryR;
      return;
    }

    wetL = toneLp(wetL, toneL_);
    if (mono_)
    {
      toneR_ = toneL_;
      wetR = wetL;
    }
    else
      wetR = toneLp(wetR, toneR_);

    if (mix >= 1.f)
    {
      outL = wetL;
      outR = wetR;
      return;
    }
    const float dryAmt = 1.f - mix;
    outL = wetL * mix + dryL * dryAmt;
    outR = mono_ ? outL : (wetR * mix + dryR * dryAmt);
  }

private:
  static float wrapPi(float dp)
  {
    constexpr float kTwoPi = 2.f * float(M_PI);
    return dp - std::floor(dp * (1.f / kTwoPi) + 0.5f) * kTwoPi;
  }

  void shiftFrame(int ch)
  {
    const int N = fft_;
    const int hop = hop_;
    const int mask = kRing - 1;
    const int end = n_;
    constexpr float kTwoPi = 2.f * float(M_PI);
    const float expct = kTwoPi * float(hop) / float(N);

    for (int i = 0; i < N; ++i)
    {
      const int idx = end - N + 1 + i;
      const float x = idx >= 0 ? in_[ch][idx & mask] : 0.f;
      re_[i] = x * aw_[i];
      im_[i] = 0.f;
    }
    fftRadix2(re_, im_, N);

    const float magGate = 1.0e-6f * float(N);
    for (int k = 1; k < N / 2; ++k)
    {
      const float mag = std::sqrt(re_[k] * re_[k] + im_[k] * im_[k]);
      const float phase = std::atan2(im_[k], re_[k]);
      float dp = wrapPi(phase - lastPhase_[ch][k] - float(k) * expct);
      lastPhase_[ch][k] = phase;
      anaPhase_[k] = phase;
      anaMag_[k] = mag;
      anaFreq_[k] = (kTwoPi * float(k) / float(N)) + dp / float(hop);
      if (mag < magGate)
        anaMag_[k] = 0.f;
    }

    std::fill_n(synMag_, N / 2, 0.f);
    std::fill_n(used_, N / 2, static_cast<unsigned char>(0));

    // Peaks, not every bin. Shifting each bin on its own turns one partial
    // into several tones that cancel. The lobe around a peak is kept and
    // phase-locked to it, so a transient stays a transient instead of a
    // stack of bare sines.
    float frameMax = 0.f;
    double energy = 0.0;
    for (int k = 1; k < N / 2; ++k)
    {
      frameMax = std::max(frameMax, anaMag_[k]);
      energy += double(anaMag_[k]) * double(anaMag_[k]);
    }
    const bool onset = prevE_[ch] > 0.0 && energy > prevE_[ch] * 4.0;
    prevE_[ch] = energy;
    const float peakFloor = std::max(magGate, frameMax * 0.025f);

    int nPeaks = 0;
    for (int k = 1; k < N / 2; ++k)
    {
      const float m = anaMag_[k];
      if (m < peakFloor)
        continue;
      const float left = k > 1 ? anaMag_[k - 1] : 0.f;
      const float right = (k + 1) < N / 2 ? anaMag_[k + 1] : 0.f;
      if (m >= left && m > right)
        peakAt_[nPeaks++] = k;
    }
    // peakAt_ stays in frequency order so each lobe is the gap to the
    // neighbouring peaks. order_ walks those lobes loudest first.
    for (int i = 0; i < nPeaks; ++i)
      order_[i] = i;
    std::sort(order_, order_ + nPeaks, [this](int a, int b) {
      return anaMag_[peakAt_[a]] > anaMag_[peakAt_[b]];
    });

    const float ratio = ratio_;
    for (int n = 0; n < nPeaks; ++n)
    {
      const int i = order_[n];
      const int p = peakAt_[i];
      const int lo = i == 0 ? 1 : (peakAt_[i - 1] + p) / 2 + 1;
      const int hi = i + 1 == nPeaks ? N / 2 - 1 : (p + peakAt_[i + 1]) / 2;
      const float destBin = anaFreq_[p] * ratio * float(N) / kTwoPi;
      const int dest = static_cast<int>(std::lround(destBin));
      if (dest <= 0 || dest >= N / 2 || used_[dest])
        continue;
      const float advance = anaFreq_[p] * ratio * float(hop);
      sumPhase_[ch][dest] =
        onset ? anaPhase_[p] : wrapPi(sumPhase_[ch][dest] + advance);
      for (int k = lo; k <= hi; ++k)
      {
        const int bin = dest + (k - p);
        if (bin <= 0 || bin >= N / 2 || used_[bin])
          continue;
        used_[bin] = 1;
        synMag_[bin] = anaMag_[k];
        synBase_[bin] = dest;
        synOff_[bin] = anaPhase_[k] - anaPhase_[p];
      }
    }

    std::fill_n(re_, N, 0.f);
    std::fill_n(im_, N, 0.f);
    for (int k = 1; k < N / 2; ++k)
    {
      if (synMag_[k] <= 0.f)
        continue;
      const float phase = sumPhase_[ch][synBase_[k]] + synOff_[k];
      const float c = std::cos(phase);
      const float s = std::sin(phase);
      re_[k] = synMag_[k] * c;
      im_[k] = synMag_[k] * s;
      re_[N - k] = re_[k];
      im_[N - k] = -im_[k];
    }
    ifftRadix2(re_, im_, N);

    for (int i = 0; i < N; ++i)
    {
      const int idx = end - N + 1 + i;
      if (idx >= 0)
        ola_[ch][idx & mask] += re_[i] * sw_[i];
    }
  }

  float toneLp(float x, float& y) const
  {
    y += toneA_ * (x - y);
    sanitizeDenormal(y);
    return y;
  }

  float in_[2][kRing] {};
  float ola_[2][kRing] {};
  float aw_[kFftMax] {};
  float sw_[kFftMax] {};
  float lastPhase_[2][kFftMax / 2 + 1] {};
  float sumPhase_[2][kFftMax / 2 + 1] {};
  float anaMag_[kFftMax / 2] {};
  float anaFreq_[kFftMax / 2] {};
  float anaPhase_[kFftMax / 2] {};
  float synMag_[kFftMax / 2] {};
  float synOff_[kFftMax / 2] {};
  int synBase_[kFftMax / 2] {};
  int peakAt_[kFftMax / 2] {};
  int order_[kFftMax / 2] {};
  unsigned char used_[kFftMax / 2] {};
  float re_[kFftMax] {};
  float im_[kFftMax] {};

  int n_ = 0;
  int grain_ = kFftMin;
  int fft_ = kFftMin;
  int overlap_ = 8;
  int hop_ = kFftMin / 8;
  int lat_ = kFftMin;
  double prevE_[2] {};
  float ratio_ = 1.f;
  float tone_ = -1.f;
  float sr_ = 0.f;
  float toneA_ = 1.f;
  float toneL_ = 0.f;
  float toneR_ = 0.f;
  bool mono_ = false;
};

} // namespace Dsp
} // namespace calfNXT
