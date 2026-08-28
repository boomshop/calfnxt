#pragma once

// FFT-accelerated YIN F0 detector + voiced / sibilant / breath cues.
// Window is provided by the caller (already decimated to ~48 kHz).

#include "dsp_math.h"
#include "fft_r2.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace calfNXT {
namespace Dsp {

class YinDetector
{
public:
  static constexpr int kMaxWin = 4096;
  static constexpr int kMaxFft = 8192;

  struct Result
  {
    float f0Hz = 0.f;
    float period = 0.f;     // samples at analysis rate
    float confidence = 0.f; // 1 = strongly periodic
    float rms = 0.f;
    float flatness = 0.f;   // 0 tonal … 1 noise-like
    float hfRatio = 0.f;    // energy above ~4 kHz / total
    bool voiced = false;
    bool sibilant = false;
    bool breath = false;
    bool octaveSuspect = false;
  };

  void reset()
  {
    result_ = {};
    prevF0_ = 0.f;
    prevPeriod_ = 0.f;
    trackF0_ = 0.f;
    unvoicedHold_ = 0;
    octaveHold_ = 0;
    lastJumpUp_ = false;
    specFftN_ = 0;
    specSr_ = 0.f;
  }

  /** Analyze `n` samples at `sampleRate`. n should be a power of two in [512, 4096].
   *  `source`: 0=voice, 1=strings (bow), 2=guitar (pick/mute). */
  const Result& analyze(const float* x, int n, float sampleRate, float fMin, float fMax,
                        float unvoicedSens, int source)
  {
    result_ = {};
    if (!x || n < 256 || sampleRate < 1000.f)
      return result_;

    n = std::min(n, kMaxWin);
    // Next power of two at or below n.
    int win = 1;
    while ((win << 1) <= n)
      win <<= 1;
    if (win < 256)
      return result_;

    const int fftN = std::min(kMaxFft, win << 1);
    fMin = std::clamp(fMin, 25.f, sampleRate * 0.2f);
    fMax = std::clamp(fMax, fMin + 10.f, sampleRate * 0.45f);

    double energy = 0.0;
    float peak = 0.f;
    for (int i = 0; i < win; ++i)
    {
      const float v = x[i];
      energy += double(v) * double(v);
      peak = std::max(peak, std::fabs(v));
    }
    result_.rms = std::sqrt(static_cast<float>(energy / std::max(1, win)));

    // Prefix sum of squares for the difference function.
    prefixSq_[0] = 0.f;
    for (int i = 0; i < win; ++i)
      prefixSq_[i + 1] = prefixSq_[i] + x[i] * x[i];

    // Autocorrelation via FFT of zero-padded window.
    std::memset(re_, 0, sizeof(float) * static_cast<size_t>(fftN));
    std::memset(im_, 0, sizeof(float) * static_cast<size_t>(fftN));
    for (int i = 0; i < win; ++i)
      re_[i] = x[i];
    fftRadix2(re_, im_, fftN);
    for (int i = 0; i < fftN; ++i)
    {
      const float rr = re_[i];
      const float ii = im_[i];
      re_[i] = rr * rr + ii * ii;
      im_[i] = 0.f;
    }
    ifftRadix2(re_, im_, fftN);

    const int minT = std::max(2, static_cast<int>(sampleRate / fMax));
    const int maxT = std::min(win / 2 - 2, static_cast<int>(sampleRate / fMin));
    if (maxT <= minT + 2)
      return result_;

    // While a track is live, only look near the last period. A pause clears
    // trackF0_ and this window — that is why a gap between notes locks cleanly,
    // while a continuous sweep used to snap to High (first dip at minT).
    int tMin = minT;
    int tMax = maxT;
    const bool tracked = trackF0_ > 1.f && prevPeriod_ > 2.f;
    if (tracked)
    {
      const int t0 = std::clamp(static_cast<int>(std::lround(prevPeriod_)), minT, maxT);
      const int slack = std::max(8, t0 / 4); // ±25% ≈ ±4 semitones; glissandi stay inside
      tMin = std::max(minT, t0 - slack);
      tMax = std::min(maxT, t0 + slack);
      if (tMax <= tMin + 2)
      {
        tMin = minT;
        tMax = maxT;
      }
    }

    // Spectral flatness + HF ratio from the power spectrum we already had…
    // Recompute a cheap magnitude snapshot from the time window via a second FFT
    // of `win` (not 2win) would need another buffer; use the autocorrelation DC
    // and a short DFT on a downsampled copy instead — see classifySpectrum().
    classifySpectrum(x, win, sampleRate);

    const float yinThresh = 0.10f + 0.18f * std::clamp(unvoicedSens, 0.f, 1.f);

    float running = 0.f;
    cmnd_[0] = 1.f;
    d_[0] = 0.f;
    int bestTau = tMin;
    float bestCmnd = 1.f;
    bool crossed = false;
    int crossedTau = tMin;

    for (int tau = 1; tau <= maxT; ++tau)
    {
      const float e0 = prefixSq_[win - tau];
      const float e1 = prefixSq_[win] - prefixSq_[tau];
      const float ac = re_[tau];
      float diff = e0 + e1 - 2.f * ac;
      if (diff < 0.f)
        diff = 0.f;
      d_[tau] = diff;
      running += diff;
      const float cmnd = (running > 1.0e-20f) ? (diff * static_cast<float>(tau) / running) : 1.f;
      cmnd_[tau] = cmnd;
      if (tau < tMin || tau > tMax)
        continue;
      if (!crossed && cmnd < yinThresh)
      {
        crossed = true;
        crossedTau = tau;
      }
      if (cmnd < bestCmnd)
      {
        bestCmnd = cmnd;
        bestTau = tau;
      }
    }

    int tau = crossed ? crossedTau : bestTau;
    // Walk to local minimum after the threshold crossing.
    if (crossed)
    {
      while (tau + 1 <= tMax && cmnd_[tau + 1] < cmnd_[tau])
        ++tau;
    }

    float tauF = static_cast<float>(tau);
    if (tau > 1 && tau < maxT)
    {
      const float s0 = cmnd_[tau - 1];
      const float s1 = cmnd_[tau];
      const float s2 = cmnd_[tau + 1];
      const float denom = 2.f * (s0 - 2.f * s1 + s2);
      if (std::fabs(denom) > 1.0e-12f)
        tauF += (s0 - s2) / denom;
    }
    tauF = std::clamp(tauF, static_cast<float>(tMin), static_cast<float>(tMax));

    float f0 = std::clamp(sampleRate / tauF, fMin, fMax);
    // Fresh lock only: first dip at the High wall → one octave down. While
    // tracked, the window already excludes that wall.
    if (!tracked)
    {
      const float fLo = f0 * 0.5f;
      if (fLo >= fMin * 0.97f && crossed && crossedTau <= minT + 1)
      {
        const int tLo = std::clamp(static_cast<int>(std::lround(sampleRate / fLo)), minT, maxT);
        if (cmnd_[tLo] <= cmnd_[std::clamp(tau, minT, maxT)] + 0.12f)
          f0 = fLo;
      }
    }

    int tauPick = std::clamp(static_cast<int>(std::lround(sampleRate / f0)), tMin, tMax);
    const int tauSpan = std::max(2, tauPick / 8);
    const int walkLo = std::max(tMin, tauPick - tauSpan);
    const int walkHi = std::min(tMax, tauPick + tauSpan);
    while (tauPick + 1 <= walkHi && cmnd_[tauPick + 1] < cmnd_[tauPick])
      ++tauPick;
    while (tauPick - 1 >= walkLo && cmnd_[tauPick - 1] < cmnd_[tauPick])
      --tauPick;
    tauF = static_cast<float>(tauPick);
    if (tauPick > 1 && tauPick < maxT)
    {
      const float s0 = cmnd_[tauPick - 1];
      const float s1 = cmnd_[tauPick];
      const float s2 = cmnd_[tauPick + 1];
      const float denom = 2.f * (s0 - 2.f * s1 + s2);
      if (std::fabs(denom) > 1.0e-12f)
        tauF += (s0 - s2) / denom;
    }
    tauF = std::clamp(tauF, static_cast<float>(tMin), static_cast<float>(tMax));
    result_.period = tauF;
    result_.f0Hz = sampleRate / tauF;
    // Folding vs raw YIN is the detector doing its job — not a warning.
    // Flag only a hop-to-hop octave jump (red dots at the discontinuity).
    result_.octaveSuspect = false;
    result_.confidence = std::clamp(1.f - cmnd_[tauPick], 0.f, 1.f);

    float rmsFloor = 0.002f;
    float sibFlat = 0.55f;
    float sibHf = 0.42f;
    if (source == 1)
    {
      // Bowed strings: scratch is not a sibilant.
      rmsFloor = 0.003f;
      sibFlat = 0.72f;
      sibHf = 0.55f;
    }
    else if (source == 2)
    {
      // Guitar/bass: pick scrape and mutes closer to unvoiced than bow noise.
      rmsFloor = 0.0026f;
      sibFlat = 0.50f;
      sibHf = 0.38f;
    }

    const float confFloor = 0.22f + 0.25f * std::clamp(unvoicedSens, 0.f, 1.f);
    result_.breath = result_.rms < rmsFloor * (0.5f + unvoicedSens);
    result_.sibilant = !result_.breath && result_.flatness > sibFlat && result_.hfRatio > sibHf;
    result_.voiced = !result_.breath && !result_.sibilant && result_.confidence >= confFloor &&
                     peak > rmsFloor * 3.f;

    if (result_.voiced && prevF0_ > 1.f)
    {
      const float jump = result_.f0Hz / prevF0_;
      const float octs = std::fabs(std::log2(std::max(jump, 1.0e-6f)));
      if (octs > 0.72f)
      {
        const bool up = jump > 1.f;
        if (octaveHold_ > 0 && up == lastJumpUp_)
          ++octaveHold_;
        else
          octaveHold_ = 1;
        lastJumpUp_ = up;
        result_.octaveSuspect = true;
        // Chatter C2↔C4 flips direction every hop and never crosses 5.
        // A real leap that YIN repeats for ~40 ms is accepted.
        if (octaveHold_ < 5)
        {
          result_.f0Hz = prevF0_;
          result_.period = prevPeriod_ > 1.f ? prevPeriod_ : result_.period;
        }
        else
          octaveHold_ = 0;
      }
      else
        octaveHold_ = 0;
    }

    if (!result_.voiced)
    {
      octaveHold_ = 0;
      ++unvoicedHold_;
      result_.period = prevPeriod_ > 1.f ? prevPeriod_ : (sampleRate / std::max(fMin, 1.f));
      if (unvoicedHold_ < 3 && prevF0_ > 1.f)
      {
        result_.voiced = true;
        result_.f0Hz = prevF0_;
        result_.period = prevPeriod_ > 1.f ? prevPeriod_ : result_.period;
      }
      else
        result_.f0Hz = 0.f;
      if (unvoicedHold_ > 8)
      {
        trackF0_ = 0.f;
        prevPeriod_ = 0.f;
      }
    }
    else
    {
      unvoicedHold_ = 0;
      prevF0_ = result_.f0Hz;
      prevPeriod_ = result_.period;
      if (trackF0_ > 1.f)
        trackF0_ += (result_.f0Hz - trackF0_) * 0.4f;
      else
        trackF0_ = result_.f0Hz;
    }

    return result_;
  }

  const Result& last() const { return result_; }

private:
  void classifySpectrum(const float* x, int win, float sampleRate)
  {
    // Short power-of-two FFT on a truncated / padded copy for flatness.
    int n = 512;
    while (n < win && n < 2048)
      n <<= 1;
    n = std::min(n, win);
    int fftN = 1;
    while (fftN < n)
      fftN <<= 1;
    fftN = std::min(fftN, 2048);

    std::memset(specRe_, 0, sizeof(float) * 2048);
    std::memset(specIm_, 0, sizeof(float) * 2048);
    // Hann to reduce leakage into the HF bins used for sibilants.
    const float sc = 2.f * float(M_PI) / std::max(1.f, float(n - 1));
    for (int i = 0; i < n; ++i)
    {
      const float w = 0.5f - 0.5f * std::cos(sc * float(i));
      specRe_[i] = x[i] * w;
    }
    fftRadix2(specRe_, specIm_, fftN);
    specFftN_ = fftN;
    specSr_ = sampleRate;

    const int nBins = fftN / 2;
    const float binHz = sampleRate / float(fftN);
    const int kLo = std::max(1, int(80.f / binHz));
    const int kHi = std::min(nBins - 1, int((sampleRate * 0.45f) / binHz));
    const int kHf = std::min(nBins - 1, int(4000.f / binHz));

    double sum = 0.0;
    double logSum = 0.0;
    double hf = 0.0;
    int count = 0;
    for (int k = kLo; k <= kHi; ++k)
    {
      const float mag = fftBinMag(specRe_, specIm_, k) + 1.0e-12f;
      sum += mag;
      logSum += std::log(double(mag));
      if (k >= kHf)
        hf += mag;
      ++count;
    }
    if (count < 4 || sum < 1.0e-12)
    {
      result_.flatness = 1.f;
      result_.hfRatio = 0.f;
      return;
    }
    const double geo = std::exp(logSum / double(count));
    const double arith = sum / double(count);
    result_.flatness = std::clamp(float(geo / std::max(arith, 1.0e-20)), 0.f, 1.f);
    result_.hfRatio = std::clamp(float(hf / std::max(sum, 1.0e-20)), 0.f, 1.f);
  }

  Result result_{};
  float prevF0_ = 0.f;
  float prevPeriod_ = 0.f;
  float trackF0_ = 0.f;
  int unvoicedHold_ = 0;
  int octaveHold_ = 0;
  bool lastJumpUp_ = false;
  int specFftN_ = 0;
  float specSr_ = 0.f;
  float prefixSq_[kMaxWin + 1] {};
  float d_[kMaxWin / 2] {};
  float cmnd_[kMaxWin / 2] {};
  float re_[kMaxFft] {};
  float im_[kMaxFft] {};
  float specRe_[2048] {};
  float specIm_[2048] {};
};

} // namespace Dsp
} // namespace calfNXT
