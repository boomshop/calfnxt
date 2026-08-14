#pragma once

// Shared spectrum analyzer tap (Analyzer plugin + future EQ overlay).
// Audio thread: process() fills ring; hop → Hann → FFT → dB → log-binned.
// Average / L / R: exponential averaging in dB (analyzer-style).
// Max: classic peak-hold with slow decay when hold is off.
// UI thread: takeSpectrum() copies published snapshot.
//
// Viz payload layout (kind:"spectrum"):
//   v[0] = bins N
//   v[1] = hold (0/1)
//   then avg[N], max[N], L[N], R[N]  (dBFS, typically −90…0)
// Total floats: 2 + 4*N

#include "dsp_math.h"
#include "fft_r2.h"

#include <algorithm>
#include <atomic>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <mutex>
#include <vector>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace calfNXT {
namespace Dsp {

class SpectrumTap
{
public:
  static constexpr int kMaxFftSize = 8192;
  static constexpr int kMaxBins = 256;
  static constexpr int kMinBins = 32;
  static constexpr float kFloorDb = -90.f;
  static constexpr float kCeilDb = 0.f;
  /** Display EMA time constant (Average / L / R). */
  static constexpr double kEmaTauSec = 0.1;

  SpectrumTap()
  {
    re_.assign(static_cast<size_t>(kMaxFftSize), 0.f);
    im_.assign(static_cast<size_t>(kMaxFftSize), 0.f);
    window_.assign(static_cast<size_t>(kMaxFftSize), 0.f);
    ringL_.assign(static_cast<size_t>(kMaxFftSize), 0.f);
    ringR_.assign(static_cast<size_t>(kMaxFftSize), 0.f);
    pendingFftSize_.store(2048, std::memory_order_relaxed);
    applyFftSize(2048);
    applyBins(128);
    pendingBins_.store(128, std::memory_order_relaxed);
    setSampleRate(48000.0);
  }

  void setSampleRate(double sr)
  {
    sampleRate_ = sr > 0.0 ? sr : 44100.0;
    updateBallistics();
    rebuildBinMap();
  }

  /** 1024 / 2048 / 4096 / 8192 — applied on next hop (no audio-thread alloc). */
  void setFftSize(int size)
  {
    if (size != 1024 && size != 2048 && size != 4096 && size != 8192)
      size = 2048;
    pendingFftSize_.store(size, std::memory_order_relaxed);
  }

  void setHold(bool on) { hold_ = on; }
  bool hold() const { return hold_; }

  /** UI→DSP bin request (applied on next hop; audio-thread safe). */
  void configureBins(int bins)
  {
    bins = std::clamp(bins, kMinBins, kMaxBins);
    pendingBins_.store(bins, std::memory_order_relaxed);
  }

  void reset()
  {
    std::fill(ringL_.begin(), ringL_.end(), 0.f);
    std::fill(ringR_.begin(), ringR_.end(), 0.f);
    ringPos_ = 0;
    hopCount_ = 0;
    std::fill(avgDb_.begin(), avgDb_.end(), kFloorDb);
    std::fill(maxDb_.begin(), maxDb_.end(), kFloorDb);
    std::fill(lDb_.begin(), lDb_.end(), kFloorDb);
    std::fill(rDb_.begin(), rDb_.end(), kFloorDb);
    std::fill(instantL_.begin(), instantL_.end(), kFloorDb);
    std::fill(instantR_.begin(), instantR_.end(), kFloorDb);
    std::lock_guard<std::mutex> lock(mutex_);
    publishLocked();
  }

  void clearDisplay()
  {
    reset();
  }

  void process(float L, float R)
  {
    // Apply pending FFT size before writing the ring so UI changes take
    // effect on the next sample (not only on the next hop of the old size).
    const int wantFft = pendingFftSize_.load(std::memory_order_relaxed);
    if (wantFft != fftSize_)
      applyFftSize(wantFft);

    const int n = fftSize_;
    ringL_[static_cast<size_t>(ringPos_)] = L;
    ringR_[static_cast<size_t>(ringPos_)] = R;
    ringPos_ = (ringPos_ + 1) % n;
    if (++hopCount_ >= hopSize_)
    {
      hopCount_ = 0;
      analyzeHop();
    }
  }

  void publish()
  {
    std::lock_guard<std::mutex> lock(mutex_);
    publishLocked();
  }

  /**
   * Copy published spectrum into out[]. Returns float count, or 0 if none.
   * Layout: bins, hold, avg[N], max[N], L[N], R[N].
   */
  int takeSpectrum(float* out, int maxOut)
  {
    if (!out || maxOut < 2)
      return 0;
    std::lock_guard<std::mutex> lock(mutex_);
    const int n = bins_;
    if (n < kMinBins
        || static_cast<int>(pubAvg_.size()) < n
        || static_cast<int>(pubMax_.size()) < n
        || static_cast<int>(pubL_.size()) < n
        || static_cast<int>(pubR_.size()) < n)
      return 0;
    const int need = 2 + 4 * n;
    if (maxOut < need)
      return 0;
    out[0] = static_cast<float>(n);
    out[1] = hold_ ? 1.f : 0.f;
    std::memcpy(out + 2, pubAvg_.data(), static_cast<size_t>(n) * sizeof(float));
    std::memcpy(out + 2 + n, pubMax_.data(), static_cast<size_t>(n) * sizeof(float));
    std::memcpy(out + 2 + 2 * n, pubL_.data(), static_cast<size_t>(n) * sizeof(float));
    std::memcpy(out + 2 + 3 * n, pubR_.data(), static_cast<size_t>(n) * sizeof(float));
    return need;
  }

private:
  void updateBallistics()
  {
    const double hopsPerSec =
      sampleRate_ / static_cast<double>(std::max(1, hopSize_));
    // One-pole EMA: y += α (x − y), α = 1 − e^(−Δt/τ).
    const float alpha = static_cast<float>(
      1.0 - std::exp(-1.0 / (kEmaTauSec * hopsPerSec)));
    emaAlpha_ = std::clamp(alpha, 0.01f, 1.f);
    // ~2 dB/s max decay when hold is off.
    maxDecayDb_ = static_cast<float>(2.0 / hopsPerSec);
  }

  void rebuildWindow()
  {
    const int n = fftSize_;
    for (int i = 0; i < n; ++i)
    {
      const float t = n > 1
        ? static_cast<float>(i) / static_cast<float>(n - 1)
        : 0.f;
      window_[static_cast<size_t>(i)] =
        0.5f * (1.f - std::cos(static_cast<float>(2.0 * M_PI) * t));
    }
  }

  void applyFftSize(int size)
  {
    if (size != 1024 && size != 2048 && size != 4096 && size != 8192)
      size = 2048;
    if (size == fftSize_)
      return;
    fftSize_ = size;
    hopSize_ = size / 4;
    ringPos_ = 0;
    hopCount_ = 0;
    std::fill(ringL_.begin(), ringL_.begin() + size, 0.f);
    std::fill(ringR_.begin(), ringR_.begin() + size, 0.f);
    // Clear meters so a size change is obvious (no stale smooth curve).
    std::fill(avgDb_.begin(), avgDb_.end(), kFloorDb);
    std::fill(maxDb_.begin(), maxDb_.end(), kFloorDb);
    std::fill(lDb_.begin(), lDb_.end(), kFloorDb);
    std::fill(rDb_.begin(), rDb_.end(), kFloorDb);
    std::fill(instantL_.begin(), instantL_.end(), kFloorDb);
    std::fill(instantR_.begin(), instantR_.end(), kFloorDb);
    rebuildWindow();
    updateBallistics();
    rebuildBinMap();
  }

  void applyBins(int bins)
  {
    bins = std::clamp(bins, kMinBins, kMaxBins);
    if (bins == bins_
        && static_cast<int>(avgDb_.size()) == bins
        && static_cast<int>(pubAvg_.size()) == bins
        && static_cast<int>(binLo_.size()) == bins)
      return;
    bins_ = bins;
    avgDb_.assign(static_cast<size_t>(bins_), kFloorDb);
    maxDb_.assign(static_cast<size_t>(bins_), kFloorDb);
    lDb_.assign(static_cast<size_t>(bins_), kFloorDb);
    rDb_.assign(static_cast<size_t>(bins_), kFloorDb);
    instantL_.assign(static_cast<size_t>(bins_), kFloorDb);
    instantR_.assign(static_cast<size_t>(bins_), kFloorDb);
    {
      std::lock_guard<std::mutex> lock(mutex_);
      pubAvg_.assign(static_cast<size_t>(bins_), kFloorDb);
      pubMax_.assign(static_cast<size_t>(bins_), kFloorDb);
      pubL_.assign(static_cast<size_t>(bins_), kFloorDb);
      pubR_.assign(static_cast<size_t>(bins_), kFloorDb);
    }
    rebuildBinMap();
  }

  void rebuildBinMap()
  {
    if (bins_ < 1)
      return;
    binLo_.assign(static_cast<size_t>(bins_), 0);
    binHi_.assign(static_cast<size_t>(bins_), 0);
    binValid_.assign(static_cast<size_t>(bins_), 0);
    const float nyquist = static_cast<float>(sampleRate_ * 0.5);
    // Keep 20 Hz…20 kHz log map in sync with SpectrumChart (not Nyquist), so
    // tilt / grid / DSP bins share the same abscissa. Bands above Nyquist stay invalid.
    constexpr float fMin = 20.f;
    constexpr float fMaxUi = 20000.f;
    const int fftBins = fftSize_ / 2;
    for (int i = 0; i < bins_; ++i)
    {
      const float t0 = static_cast<float>(i) / static_cast<float>(bins_);
      const float t1 = static_cast<float>(i + 1) / static_cast<float>(bins_);
      const float f0 = fMin * std::pow(fMaxUi / fMin, t0);
      const float f1 = fMin * std::pow(fMaxUi / fMin, t1);
      if (!(f0 < nyquist) || fftBins < 2)
      {
        binLo_[static_cast<size_t>(i)] = 0;
        binHi_[static_cast<size_t>(i)] = 0;
        binValid_[static_cast<size_t>(i)] = 0;
        continue;
      }
      int lo = static_cast<int>(f0 / nyquist * static_cast<float>(fftBins));
      int hi = static_cast<int>(f1 / nyquist * static_cast<float>(fftBins));
      lo = std::clamp(lo, 1, fftBins - 1);
      hi = std::clamp(std::max(hi, lo + 1), lo + 1, fftBins);
      binLo_[static_cast<size_t>(i)] = lo;
      binHi_[static_cast<size_t>(i)] = hi;
      binValid_[static_cast<size_t>(i)] = 1;
    }
  }

  static float magToDb(float mag, float norm)
  {
    const float lin = mag * norm;
    if (!(lin > 1.0e-12f))
      return kFloorDb;
    float db = 20.f * std::log10(lin);
    if (!std::isfinite(db))
      return kFloorDb;
    return std::clamp(db, kFloorDb, kCeilDb);
  }

  /** Analyzer-style one-pole average in dB (symmetric up/down). */
  void emaDb(float& dst, float db)
  {
    dst += emaAlpha_ * (db - dst);
    sanitize(dst);
    dst = std::clamp(dst, kFloorDb, kCeilDb);
  }

  /** Instantaneous peak-bin dB for one channel (no ballistics). */
  void analyzeChannelInstant(const std::vector<float>& ring, std::vector<float>& outDb)
  {
    const int n = fftSize_;
    const int start = ringPos_;
    for (int i = 0; i < n; ++i)
    {
      const int idx = (start + i) % n;
      re_[static_cast<size_t>(i)] =
        ring[static_cast<size_t>(idx)] * window_[static_cast<size_t>(i)];
      im_[static_cast<size_t>(i)] = 0.f;
    }
    fftRadix2(re_.data(), im_.data(), n);

    const float norm = 2.f / (static_cast<float>(n) * 0.5f);

    for (int i = 0; i < bins_; ++i)
    {
      if (!binValid_[static_cast<size_t>(i)])
      {
        outDb[static_cast<size_t>(i)] = kFloorDb;
        continue;
      }
      const int lo = binLo_[static_cast<size_t>(i)];
      const int hi = binHi_[static_cast<size_t>(i)];
      float peak = 0.f;
      for (int k = lo; k < hi; ++k)
        peak = std::max(peak, fftBinMag(re_.data(), im_.data(), k));
      outDb[static_cast<size_t>(i)] = magToDb(peak, norm);
    }
  }

  void analyzeHop()
  {
    const int wantBins = pendingBins_.load(std::memory_order_relaxed);
    if (wantBins != bins_)
      applyBins(wantBins);

    analyzeChannelInstant(ringL_, instantL_);
    analyzeChannelInstant(ringR_, instantR_);

    for (int i = 0; i < bins_; ++i)
    {
      if (!binValid_[static_cast<size_t>(i)])
      {
        avgDb_[static_cast<size_t>(i)] = kFloorDb;
        maxDb_[static_cast<size_t>(i)] = kFloorDb;
        lDb_[static_cast<size_t>(i)] = kFloorDb;
        rDb_[static_cast<size_t>(i)] = kFloorDb;
        continue;
      }
      const float lInst = instantL_[static_cast<size_t>(i)];
      const float rInst = instantR_[static_cast<size_t>(i)];
      emaDb(lDb_[static_cast<size_t>(i)], lInst);
      emaDb(rDb_[static_cast<size_t>(i)], rInst);
      // Average = mid of EMA'd channels (no second smoother).
      avgDb_[static_cast<size_t>(i)] =
        0.5f * (lDb_[static_cast<size_t>(i)] + rDb_[static_cast<size_t>(i)]);
      sanitize(avgDb_[static_cast<size_t>(i)]);

      // Max tracks instantaneous mid so Hold catches real peaks.
      const float midInst = 0.5f * (lInst + rInst);
      float& mx = maxDb_[static_cast<size_t>(i)];
      if (midInst > mx)
        mx = midInst;
      else if (!hold_)
        mx = std::max(kFloorDb, mx - maxDecayDb_);
      sanitize(mx);
    }
  }

  void publishLocked()
  {
    pubAvg_ = avgDb_;
    pubMax_ = maxDb_;
    pubL_ = lDb_;
    pubR_ = rDb_;
  }

  double sampleRate_ = 48000.0;
  float emaAlpha_ = 0.2f;
  float maxDecayDb_ = 0.05f;
  bool hold_ = false;
  int fftSize_ = 0;
  int hopSize_ = 512;
  int bins_ = 0;
  std::atomic<int> pendingBins_{128};
  std::atomic<int> pendingFftSize_{2048};
  int ringPos_ = 0;
  int hopCount_ = 0;

  std::vector<float> window_;
  std::vector<float> ringL_;
  std::vector<float> ringR_;
  std::vector<float> re_;
  std::vector<float> im_;
  std::vector<int> binLo_;
  std::vector<int> binHi_;
  std::vector<uint8_t> binValid_;
  std::vector<float> instantL_;
  std::vector<float> instantR_;
  std::vector<float> avgDb_;
  std::vector<float> maxDb_;
  std::vector<float> lDb_;
  std::vector<float> rDb_;

  std::mutex mutex_;
  std::vector<float> pubAvg_;
  std::vector<float> pubMax_;
  std::vector<float> pubL_;
  std::vector<float> pubR_;
};

} // namespace Dsp
} // namespace calfNXT
