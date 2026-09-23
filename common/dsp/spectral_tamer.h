#pragma once

// Spectral resonance tamer: STFT detect + STFT gain (linked stereo).
// Detection: residual prominence above peers − threshold, then soft knee to Depth
// (knee width tracks Threshold; Depth >12 dB steepens the climb).
// Action: soft GR capped by depth, spatially smoothed by sharpness (octaves),
// temporally smoothed by attack/release.
// Search: FrequencyRange-style HP→LP (6…48 dB) shapes the detector spectrum
// and scales Depth linearly in dB (0 dB → full, −24 dB → none). FFT work is
// limited to bins where |H| ≥ −24 dB (same floor as the GR chart axis).
// Harmonics (0…1): among Depth GR tips, walk F0 ladders (≥3 hits at 1·2·3·F0).
// Soft-keep by level vs siblings; overlap = max GR (min keep).
//
// Reconstruction: sqrt-Hann analysis/synthesis, hop = N/4, shift-OLA.
// Latency = N − hop. Buffers preallocated to kMaxFft (no RT heap).
// Fastpath: park STFT only when the editor is hidden and (no audio work, or
// quiet-after-flush). Open UI keeps the STFT on silence/Bypass/Depth=0 so the
// chart decays live (same FFT as processing — no cheaper analyzer path).
//
// Viz: log-binned spectrum (SpectrumTap layout) + GR response [N, L×N, R×N].

#include "biquad.h"
#include "dsp_math.h"
#include "fft_r2.h"
#include "gain_util.h"

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

class SpectralTamer
{
public:
  static constexpr int kMaxFft = 4096;
  static constexpr int kMaxBins = 256;
  static constexpr int kMinBins = 32;
  static constexpr float kFloorDb = -120.f;
  /** Display spectrum ceiling (detection uses unclamped dB). */
  static constexpr float kSpecCeilDb = 0.f;
  static constexpr float kGrFloorDb = -24.f;
  /** Headroom so loud bins don't all pin to 0 dB and kill excess detection. */
  static constexpr float kDetectCeilDb = 48.f;
  /** Detector / GR mask floor — matches chart Y (TAMER_DB_MIN). */
  static constexpr float kDetectFloorDb = -24.f;

  SpectralTamer()
  {
    allocMax();
    fftSize_ = 0; // force applyPendingSizes to install window + hop
    setSampleRate(48000.0);
    setFftSize(2048);
    applyPendingSizes();
    applyBins(128);
    reset();
  }

  void setSampleRate(double sr)
  {
    sampleRate_ = sr > 0.0 ? sr : 44100.0;
    rebuildBinMap();
    updateTimeCoeffs();
    updateDetectFilter();
  }

  /** 1024 / 2048 / 4096. Applied on next process() (no audio-thread alloc). */
  void setFftSize(int size)
  {
    if (size != 1024 && size != 2048 && size != 4096)
      size = 2048;
    pendingFft_.store(size, std::memory_order_relaxed);
  }

  int fftSize() const { return fftSize_; }
  int hopSize() const { return hopSize_; }

  /**
   * Causal WOLA delay (samples). Full FFT length so the wet FIFO can be
   * prefilled through the first hop without underrun (hop every N/4 after fill).
   */
  uint32_t latencySamples() const
  {
    return static_cast<uint32_t>(std::max(1, fftSize_));
  }

  void configureBins(int bins)
  {
    bins = std::clamp(bins, kMinBins, kMaxBins);
    pendingBins_.store(bins, std::memory_order_relaxed);
  }

  void setParams(float fLoHz, float fHiHz, float depthDb, float sharpnessOct,
                 float thresholdDb, float attackMs, float releaseMs,
                 float hpSlopePlain = 2.f, float lpSlopePlain = 2.f,
                 float harmonics = 0.f)
  {
    if (fLoHz > fHiHz)
      std::swap(fLoHz, fHiHz);
    fLoHz_ = std::clamp(fLoHz, 20.f, 20000.f);
    fHiHz_ = std::clamp(fHiHz, 20.f, 20000.f);
    depthDb_ = std::clamp(depthDb, 0.f, 24.f);
    sharpnessOct_ = std::clamp(sharpnessOct, 1.f / 24.f, 0.5f);
    thresholdDb_ = std::clamp(thresholdDb, 0.f, 24.f);
    attackMs_ = std::clamp(attackMs, 0.1f, 500.f);
    releaseMs_ = std::clamp(releaseMs, 1.f, 2000.f);
    hpSlopeDb_ = slopeDbFromPlain(hpSlopePlain);
    lpSlopeDb_ = slopeDbFromPlain(lpSlopePlain);
    harmonics_ = std::clamp(harmonics, 0.f, 1.f);
    updateTimeCoeffs();
    updateDetectFilter();
  }

  void reset()
  {
    std::fill(inL_.begin(), inL_.end(), 0.f);
    std::fill(inR_.begin(), inR_.end(), 0.f);
    std::fill(olaL_.begin(), olaL_.end(), 0.f);
    std::fill(olaR_.begin(), olaR_.end(), 0.f);
    std::fill(dryL_.begin(), dryL_.end(), 0.f);
    std::fill(dryR_.begin(), dryR_.end(), 0.f);
    std::fill(outL_.begin(), outL_.end(), 0.f);
    std::fill(outR_.begin(), outR_.end(), 0.f);
    std::fill(grDb_.begin(), grDb_.end(), 0.f);
    std::fill(envDb_.begin(), envDb_.end(), kFloorDb);
    writePos_ = 0;
    hopCount_ = 0;
    filled_ = 0;
    dryWrite_ = 0;
    outRead_ = 0;
    outWrite_ = 0;
    stftActive_ = false;
    // Prefill wet FIFO with one latency worth of silence so read never underruns.
    const int lat = static_cast<int>(latencySamples());
    for (int i = 0; i < lat; ++i)
    {
      outL_[static_cast<size_t>(outWrite_)] = 0.f;
      outR_[static_cast<size_t>(outWrite_)] = 0.f;
      outWrite_ = (outWrite_ + 1) & outMask_;
    }
    std::fill(avgDb_.begin(), avgDb_.end(), kFloorDb);
    std::fill(maxDb_.begin(), maxDb_.end(), kFloorDb);
    std::fill(lDb_.begin(), lDb_.end(), kFloorDb);
    std::fill(rDb_.begin(), rDb_.end(), kFloorDb);
    std::fill(grDisp_.begin(), grDisp_.end(), 0.f);
    ladderN_ = 0;
    ladderKeep_ = 0.f;
  }

  /**
   * Process in-place stereo. When STFT parked: latency-matched dry only.
   * Bypass with live STFT: GR→0 on the wet OLA (no dry↔wet cut). Diff Listen:
   * delayed dry − wet.
   * `runStft`: false skips analysis/OLA (CPU fastpath).
   */
  void process(float* left, float* right, int n, bool bypass, bool diffListen,
               bool runStft)
  {
    if (!left || n <= 0)
      return;
    applyPendingSizes();

    if (runStft && !stftActive_)
    {
      resetStftEngine();
      stftActive_ = true;
    }
    else if (!runStft && stftActive_)
    {
      parkStft();
      stftActive_ = false;
    }

    if (!runStft)
    {
      processDryOnly(left, right, n, bypass, diffListen);
      return;
    }

    bypassActive_ = bypass;

    const int nChR = right ? 1 : 0;
    const int nFft = fftSize_;
    const int hop = hopSize_;
    const int dryMask = dryMask_;
    const int outMask = outMask_;
    const int lat = static_cast<int>(latencySamples());

    for (int i = 0; i < n; ++i)
    {
      float inL = left[i];
      float inR = nChR ? right[i] : inL;
      sanitizeDenormal(inL);
      sanitizeDenormal(inR);

      dryL_[static_cast<size_t>(dryWrite_)] = inL;
      dryR_[static_cast<size_t>(dryWrite_)] = inR;
      const int dryRead = (dryWrite_ - lat) & dryMask;
      const float dryOutL = dryL_[static_cast<size_t>(dryRead)];
      const float dryOutR = dryR_[static_cast<size_t>(dryRead)];
      dryWrite_ = (dryWrite_ + 1) & dryMask;

      inL_[static_cast<size_t>(writePos_)] = inL;
      inR_[static_cast<size_t>(writePos_)] = inR;
      writePos_ = (writePos_ + 1) % nFft;

      if (filled_ < nFft)
      {
        ++filled_;
        if (filled_ == nFft)
          processHop(); // first full frame
      }
      else if (++hopCount_ >= hop)
      {
        hopCount_ = 0;
        processHop();
      }

      float wetL = 0.f;
      float wetR = 0.f;
      if (outRead_ != outWrite_)
      {
        wetL = outL_[static_cast<size_t>(outRead_)];
        wetR = outR_[static_cast<size_t>(outRead_)];
        outL_[static_cast<size_t>(outRead_)] = 0.f;
        outR_[static_cast<size_t>(outRead_)] = 0.f;
        outRead_ = (outRead_ + 1) & outMask;
      }

      // Bypass stays on the wet OLA path with GR forced to 0 — no dry↔wet
      // switch (that hard cut clicked when GR was mid-flight).
      if (diffListen)
      {
        left[i] = dryOutL - wetL;
        if (nChR)
          right[i] = dryOutR - wetR;
      }
      else
      {
        left[i] = wetL;
        if (nChR)
          right[i] = wetR;
      }
    }
  }

  /** Latency-matched dry only — used while STFT is parked. */
  void processDryOnly(float* left, float* right, int n, bool /*bypass*/,
                      bool diffListen)
  {
    const int nChR = right ? 1 : 0;
    const int dryMask = dryMask_;
    const int lat = static_cast<int>(latencySamples());
    for (int i = 0; i < n; ++i)
    {
      float inL = left[i];
      float inR = nChR ? right[i] : inL;
      sanitizeDenormal(inL);
      sanitizeDenormal(inR);

      dryL_[static_cast<size_t>(dryWrite_)] = inL;
      dryR_[static_cast<size_t>(dryWrite_)] = inR;
      const int dryRead = (dryWrite_ - lat) & dryMask;
      const float dryOutL = dryL_[static_cast<size_t>(dryRead)];
      const float dryOutR = dryR_[static_cast<size_t>(dryRead)];
      dryWrite_ = (dryWrite_ + 1) & dryMask;

      // Diff with STFT parked: nothing was removed.
      if (diffListen)
      {
        left[i] = 0.f;
        if (nChR)
          right[i] = 0.f;
      }
      else
      {
        left[i] = dryOutL;
        if (nChR)
          right[i] = dryOutR;
      }
    }
  }

  /** SpectrumTap layout: N, hold(0), avg, max, L, R. */
  int takeSpectrum(float* out, int maxOut)
  {
    if (!out || maxOut < 2)
      return 0;
    std::lock_guard<std::mutex> lock(mutex_);
    const int n = bins_;
    if (n < 1 || pubAvg_.size() != static_cast<size_t>(n))
      return 0;
    const int need = 2 + 4 * n;
    if (maxOut < need)
      return 0;
    out[0] = static_cast<float>(n);
    out[1] = 0.f;
    std::memcpy(out + 2, pubAvg_.data(), sizeof(float) * static_cast<size_t>(n));
    std::memcpy(out + 2 + n, pubMax_.data(), sizeof(float) * static_cast<size_t>(n));
    std::memcpy(out + 2 + 2 * n, pubL_.data(), sizeof(float) * static_cast<size_t>(n));
    std::memcpy(out + 2 + 3 * n, pubR_.data(), sizeof(float) * static_cast<size_t>(n));
    return need;
  }

  /** [bins, grL×N, grR×N] dB (≤0). Linked → L==R. */
  int takeGrResponse(float* out, int maxOut)
  {
    if (!out || maxOut < 1)
      return 0;
    std::lock_guard<std::mutex> lock(mutex_);
    const int n = bins_;
    if (n < 1 || pubGr_.size() != static_cast<size_t>(n))
      return 0;
    const int need = 1 + 2 * n;
    if (maxOut < need)
      return 0;
    out[0] = static_cast<float>(n);
    std::memcpy(out + 1, pubGr_.data(), sizeof(float) * static_cast<size_t>(n));
    std::memcpy(out + 1 + n, pubGr_.data(), sizeof(float) * static_cast<size_t>(n));
    return need;
  }

  /**
   * Harmonic protect guides for the chart (empty until protect logic returns).
   * Layout: [n, keep01, (centerHz, halfWidthHz)×n]. Returns float count, or 0.
   */
  int takeHarmonicGuides(float* out, int maxOut)
  {
    if (!out || maxOut < 2)
      return 0;
    std::lock_guard<std::mutex> lock(mutex_);
    const int n = std::clamp(pubLadderN_, 0, kMaxLadderRungs);
    const int need = 2 + 2 * n;
    if (maxOut < need)
      return 0;
    out[0] = static_cast<float>(n);
    out[1] = pubLadderKeep_;
    if (n > 0)
      std::memcpy(out + 2, pubLadder_.data(),
                  sizeof(float) * static_cast<size_t>(2 * n));
    return need;
  }

  void publish()
  {
    std::lock_guard<std::mutex> lock(mutex_);
    pubAvg_ = avgDb_;
    pubMax_ = maxDb_;
    pubL_ = lDb_;
    pubR_ = rDb_;
    pubGr_ = grDisp_;
    pubLadderN_ = ladderN_;
    pubLadderKeep_ = ladderKeep_;
    if (ladderN_ > 0)
      pubLadder_.assign(ladder_.begin(),
                        ladder_.begin() + static_cast<size_t>(2 * ladderN_));
    else
      pubLadder_.clear();
  }

private:
  static constexpr int kMaxLadderRungs = 48;
  static constexpr int kMaxPeaks = 64;

  struct PeakTip
  {
    float hz = 0.f;
    float db = 0.f;
    float res = 0.f; // detect − env — tip quality / ranking
    int k = 0;
  };


  void allocMax()
  {
    const size_t n = static_cast<size_t>(kMaxFft);
    const size_t half = n / 2 + 1;
    inL_.assign(n, 0.f);
    inR_.assign(n, 0.f);
    olaL_.assign(n, 0.f);
    olaR_.assign(n, 0.f);
    window_.assign(n, 0.f);
    reL_.assign(n, 0.f);
    imL_.assign(n, 0.f);
    reR_.assign(n, 0.f);
    imR_.assign(n, 0.f);
    magDb_.assign(half, kFloorDb);
    detectDb_.assign(half, kFloorDb);
    filtDb_.assign(half, 0.f);
    envDb_.assign(half, kFloorDb);
    grDb_.assign(half, 0.f);
    grTarget_.assign(half, 0.f);
    scratch_.assign(half, 0.f);
    ladder_.assign(static_cast<size_t>(2 * kMaxLadderRungs), 0.f);
    pubLadder_.clear();
    ladderN_ = 0;
    pubLadderN_ = 0;
    ladderKeep_ = 0.f;
    pubLadderKeep_ = 0.f;

    // Dry / out rings: power-of-two ≥ max latency + block headroom
    int ringNeed = kMaxFft + 8192;
    dryMask_ = 1;
    while (dryMask_ < ringNeed)
      dryMask_ <<= 1;
    --dryMask_;
    outMask_ = dryMask_;
    dryL_.assign(static_cast<size_t>(dryMask_ + 1), 0.f);
    dryR_.assign(static_cast<size_t>(dryMask_ + 1), 0.f);
    outL_.assign(static_cast<size_t>(outMask_ + 1), 0.f);
    outR_.assign(static_cast<size_t>(outMask_ + 1), 0.f);
  }

  void rebuildWindow(int fft)
  {
    // Periodic sqrt-Hann — analysis×synthesis = Hann.
    // Periodic Hann COLA at hop N/4 sums to 2 → scale 1/2.
    for (int i = 0; i < fft; ++i)
    {
      const float hann =
        0.5f
        - 0.5f
            * std::cos(static_cast<float>(2.0 * M_PI) * static_cast<float>(i)
                       / static_cast<float>(fft));
      window_[static_cast<size_t>(i)] = std::sqrt(std::max(0.f, hann));
    }
    colaNorm_ = 0.5f;
  }

  void applyPendingSizes()
  {
    const int want = pendingFft_.load(std::memory_order_relaxed);
    if (want != fftSize_)
    {
      fftSize_ = want;
      hopSize_ = want / 4;
      rebuildWindow(want);
      rebuildBinMap();
      updateTimeCoeffs();
      updateDetectFilter();
      reset();
    }
    const int wantBins = pendingBins_.load(std::memory_order_relaxed);
    if (wantBins != bins_ || avgDb_.size() != static_cast<size_t>(bins_))
      applyBins(wantBins);
  }

  void applyBins(int bins)
  {
    bins = std::clamp(bins, kMinBins, kMaxBins);
    if (bins == bins_ && avgDb_.size() == static_cast<size_t>(bins_))
      return;
    bins_ = bins;
    pendingBins_.store(bins_, std::memory_order_relaxed);
    avgDb_.assign(static_cast<size_t>(bins_), kFloorDb);
    maxDb_.assign(static_cast<size_t>(bins_), kFloorDb);
    lDb_.assign(static_cast<size_t>(bins_), kFloorDb);
    rDb_.assign(static_cast<size_t>(bins_), kFloorDb);
    grDisp_.assign(static_cast<size_t>(bins_), 0.f);
    {
      std::lock_guard<std::mutex> lock(mutex_);
      pubAvg_.assign(static_cast<size_t>(bins_), kFloorDb);
      pubMax_.assign(static_cast<size_t>(bins_), kFloorDb);
      pubL_.assign(static_cast<size_t>(bins_), kFloorDb);
      pubR_.assign(static_cast<size_t>(bins_), kFloorDb);
      pubGr_.assign(static_cast<size_t>(bins_), 0.f);
    }
    rebuildBinMap();
  }

  void rebuildBinMap()
  {
    if (bins_ < 1 || fftSize_ < 4)
      return;
    binLo_.assign(static_cast<size_t>(bins_), 0);
    binHi_.assign(static_cast<size_t>(bins_), 0);
    binValid_.assign(static_cast<size_t>(bins_), 0);
    const float nyquist = static_cast<float>(sampleRate_ * 0.5);
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
    updateDetectFilter();
  }

  /** Plain 0…4 → 6/12/24/36/48 dB/oct (always-on search filters). */
  static int slopeDbFromPlain(float plain)
  {
    switch (static_cast<int>(std::lround(std::clamp(plain, 0.f, 4.f))))
    {
    case 0:
      return 6;
    case 1:
      return 12;
    case 2:
      return 24;
    case 3:
      return 36;
    default:
      return 48;
    }
  }

  /** RBJ cascade count; 0 = first-order (6 dB). */
  static int stagesFromSlopeDb(int slopeDb)
  {
    if (slopeDb <= 6)
      return 0;
    return std::clamp(slopeDb / 12, 1, 4);
  }

  void updateDetectFilter()
  {
    const int half = fftSize_ / 2;
    if (half < 2 || !(sampleRate_ > 0.0))
    {
      kLo_ = 1;
      kHi_ = 1;
      return;
    }

    const float sr = static_cast<float>(sampleRate_);
    const int hpSt = stagesFromSlopeDb(hpSlopeDb_);
    const int lpSt = stagesFromSlopeDb(lpSlopeDb_);

    if (hpSt == 0)
      hpCoeff_.setHp1(fLoHz_, sr);
    else
      hpCoeff_.setHpRbj(fLoHz_, 0.707f, sr, 1.f);

    if (lpSt == 0)
      lpCoeff_.setLp1(fHiHz_, sr);
    else
      lpCoeff_.setLpRbj(fHiHz_, 0.707f, sr, 1.f);

    const float nyquist = static_cast<float>(sampleRate_ * 0.5);
    if (static_cast<int>(filtDb_.size()) < half + 1)
      filtDb_.assign(static_cast<size_t>(half) + 1, 0.f);

    int lo = half - 1;
    int hi = 1;
    for (int k = 1; k <= half - 1; ++k)
    {
      const float hz =
        (static_cast<float>(k) / static_cast<float>(half)) * nyquist;
      float db = 0.f;
      if (hpSt == 0)
        db += hpCoeff_.responseDb(hz, sr);
      else
        db += static_cast<float>(hpSt) * hpCoeff_.responseDb(hz, sr);
      if (lpSt == 0)
        db += lpCoeff_.responseDb(hz, sr);
      else
        db += static_cast<float>(lpSt) * lpCoeff_.responseDb(hz, sr);
      if (!std::isfinite(db))
        db = -240.f;
      filtDb_[static_cast<size_t>(k)] = db;
      // FFT search window: where detector filter is still above −24 dB.
      if (db >= kDetectFloorDb)
      {
        lo = std::min(lo, k);
        hi = std::max(hi, k);
      }
    }
    filtDb_[0] = filtDb_[1];
    filtDb_[static_cast<size_t>(half)] = filtDb_[static_cast<size_t>(half - 1)];

    if (hi < lo)
    {
      // Degenerate (very soft + extreme freqs): fall back to cutoff bins.
      auto hzToBin = [&](float hz) {
        int k = static_cast<int>(hz / nyquist * static_cast<float>(half));
        return std::clamp(k, 1, half - 1);
      };
      lo = hzToBin(fLoHz_);
      hi = hzToBin(fHiHz_);
      if (lo > hi)
        std::swap(lo, hi);
    }
    kLo_ = lo;
    kHi_ = hi;
  }

  void updateTimeCoeffs()
  {
    const double hopsPerSec =
      sampleRate_ / static_cast<double>(std::max(1, hopSize_));
    auto coeff = [&](float ms) {
      const double tauHop =
        std::max(1.0e-3, static_cast<double>(ms) * 0.001) * hopsPerSec;
      return static_cast<float>(1.0 - std::exp(-1.0 / tauHop));
    };
    atkCoeff_ = coeff(attackMs_);
    relCoeff_ = coeff(releaseMs_);
    // Spectral envelope ~120 ms — slow so narrow peaks sit above it.
    envCoeff_ = coeff(120.f);
    emaSpec_ = static_cast<float>(1.0 - std::exp(-1.0 / (0.1 * hopsPerSec)));
  }

  /** Clear analysis/OLA/wet FIFO; leave dry delay untouched (PDC continuity). */
  void resetStftEngine()
  {
    std::fill(inL_.begin(), inL_.end(), 0.f);
    std::fill(inR_.begin(), inR_.end(), 0.f);
    std::fill(olaL_.begin(), olaL_.end(), 0.f);
    std::fill(olaR_.begin(), olaR_.end(), 0.f);
    std::fill(outL_.begin(), outL_.end(), 0.f);
    std::fill(outR_.begin(), outR_.end(), 0.f);
    std::fill(grDb_.begin(), grDb_.end(), 0.f);
    std::fill(grTarget_.begin(), grTarget_.end(), 0.f);
    std::fill(envDb_.begin(), envDb_.end(), kFloorDb);
    writePos_ = 0;
    hopCount_ = 0;
    filled_ = 0;
    outRead_ = 0;
    outWrite_ = 0;
    const int lat = static_cast<int>(latencySamples());
    for (int i = 0; i < lat; ++i)
    {
      outL_[static_cast<size_t>(outWrite_)] = 0.f;
      outR_[static_cast<size_t>(outWrite_)] = 0.f;
      outWrite_ = (outWrite_ + 1) & outMask_;
    }
    std::fill(grDisp_.begin(), grDisp_.end(), 0.f);
  }

  void parkStft()
  {
    resetStftEngine();
  }

  static float magToDb(float mag, float norm, float ceilDb)
  {
    const float lin = mag * norm;
    if (!(lin > 1.0e-12f))
      return kFloorDb;
    float db = 20.f * std::log10(lin);
    if (!std::isfinite(db))
      return kFloorDb;
    return std::clamp(db, kFloorDb, ceilDb);
  }

  void processHop()
  {
    const int n = fftSize_;
    const int hop = hopSize_;
    const int half = n / 2;
    // Window mean energy ≈ 0.5 for Hann; 2/N recovers ~peak amplitude in dB.
    const float norm = 2.f / static_cast<float>(n);

    // Frame ending at the sample just written: writePos_ is next slot = oldest.
    const int start = writePos_;
    for (int i = 0; i < n; ++i)
    {
      const int idx = (start + i) % n;
      const float w = window_[static_cast<size_t>(i)];
      reL_[static_cast<size_t>(i)] = inL_[static_cast<size_t>(idx)] * w;
      imL_[static_cast<size_t>(i)] = 0.f;
      reR_[static_cast<size_t>(i)] = inR_[static_cast<size_t>(idx)] * w;
      imR_[static_cast<size_t>(i)] = 0.f;
    }

    fftRadix2(reL_.data(), imL_.data(), n);
    fftRadix2(reR_.data(), imR_.data(), n);

    // Unclamped (high ceiling) magnitudes — relative excess must survive loud
    // programme where a 0 dBFS ceiling would pin every bin and kill detection.
    for (int k = 0; k <= half; ++k)
    {
      const float mL = fftBinMag(reL_.data(), imL_.data(), k);
      const float mR = fftBinMag(reR_.data(), imR_.data(), k);
      magDb_[static_cast<size_t>(k)] =
        magToDb(0.5f * (mL + mR), norm, kDetectCeilDb);
      const float w =
        (k < static_cast<int>(filtDb_.size())) ? filtDb_[static_cast<size_t>(k)]
                                               : 0.f;
      detectDb_[static_cast<size_t>(k)] =
        std::max(kFloorDb, magDb_[static_cast<size_t>(k)] + w);
    }

    updateDisplaySpectrum();

    // Bypass / Depth=0: no new cuts — GR releases to 0, wet OLA keeps running
    // so engaging Bypass never hard-switches dry↔wet (click).
    std::fill(grTarget_.begin(),
              grTarget_.begin() + static_cast<size_t>(half) + 1, 0.f);

    ladderN_ = 0;
    ladderKeep_ = 0.f;

    if (!bypassActive_ && depthDb_ > 0.f && kHi_ >= kLo_)
    {
      // Slow spectral floor on the *filtered* detector spectrum.
      const float a = 0.94f;
      scratch_[0] = detectDb_[0];
      for (int k = 1; k <= half; ++k)
        scratch_[static_cast<size_t>(k)] =
          a * scratch_[static_cast<size_t>(k - 1)]
          + (1.f - a) * detectDb_[static_cast<size_t>(k)];
      float back = scratch_[static_cast<size_t>(half)];
      for (int k = half; k >= 0; --k)
      {
        back = a * back + (1.f - a) * scratch_[static_cast<size_t>(k)];
        float& e = envDb_[static_cast<size_t>(k)];
        e += envCoeff_ * (back - e);
        sanitizeDenormal(e);
      }

      const float depth = depthDb_;
      // Detection threshold (0…24 dB). Soft knee width tracks it so high Thresh
      // is both pickier and gentler toward Depth.
      const float thresh = thresholdDb_;
      const float soft = 3.f + 0.5f * thresh; // ~3…15 dB
      // Depth only *drives* past ~12 dB (steeper climb to the ceiling).
      const float drive =
        1.f + std::max(0.f, (depth - 12.f) / 12.f); // 1…2
      const float softEff = soft / drive;

      // Peak list for Harmonics = same tips that qualify for Depth GR
      // (local max + peer prominence above Threshold) — not every envelope bump.
      PeakTip peaks[kMaxPeaks];
      int nPeaks = 0;
      const float nyquist = static_cast<float>(sampleRate_ * 0.5);
      const float mergeHz =
        std::max(25.f, 1.5f * (nyquist / static_cast<float>(half)));

      auto considerTip = [&](float f, float m, float res, int kBin) {
        if (!(f >= 40.f && f < nyquist * 0.98f))
          return;
        for (int i = 0; i < nPeaks; ++i)
        {
          if (std::fabs(peaks[i].hz - f) <= mergeHz)
          {
            if (res > peaks[i].res)
            {
              peaks[i].hz = f;
              peaks[i].db = m;
              peaks[i].res = res;
              peaks[i].k = kBin;
            }
            return;
          }
        }
        if (nPeaks < kMaxPeaks)
        {
          peaks[nPeaks].hz = f;
          peaks[nPeaks].db = m;
          peaks[nPeaks].res = res;
          peaks[nPeaks].k = kBin;
          ++nPeaks;
          return;
        }
        int weak = 0;
        for (int i = 1; i < nPeaks; ++i)
        {
          if (peaks[i].res < peaks[weak].res)
            weak = i;
        }
        if (res > peaks[weak].res)
        {
          peaks[weak].hz = f;
          peaks[weak].db = m;
          peaks[weak].res = res;
          peaks[weak].k = kBin;
        }
      };

      for (int k = kLo_; k <= kHi_; ++k)
      {
        if (k <= 1 || k >= half - 1)
          continue;
        const float m = detectDb_[static_cast<size_t>(k)];
        if (!(m > detectDb_[static_cast<size_t>(k - 1)]
              && m >= detectDb_[static_cast<size_t>(k + 1)]))
          continue;

        const float f =
          (static_cast<float>(k) / static_cast<float>(half)) * nyquist;
        const float res = m - envDb_[static_cast<size_t>(k)];

        // Prominence window (~≥200 Hz) so harmonic peers count as neighbours.
        int R = std::max(4, static_cast<int>(0.2f * static_cast<float>(k) + 0.5f));
        const int Rhz =
          std::max(4, static_cast<int>(220.f / nyquist * static_cast<float>(half) + 0.5f));
        R = std::max(R, Rhz);
        const float detectOct = std::max(sharpnessOct_, 1.f / 6.f);
        if (f > 20.f)
        {
          const float fHalf = f * (std::pow(2.f, 0.5f * detectOct) - 1.f);
          const int Roct =
            static_cast<int>(fHalf / nyquist * static_cast<float>(half) + 0.5f);
          R = std::max(R, Roct);
        }
        R = std::min(R, half / 3);

        float peer = -240.f;
        const int lo = std::max(1, k - R);
        const int hi = std::min(half - 1, k + R);
        for (int j = lo; j <= hi; ++j)
        {
          if (std::abs(j - k) <= 1)
            continue;
          const float rj =
            detectDb_[static_cast<size_t>(j)] - envDb_[static_cast<size_t>(j)];
          peer = std::max(peer, rj);
        }
        const float excess = res - peer - thresh;
        if (excess <= 0.f)
          continue;

        // Same tip that Depth will cut — only these enter Harmonics ladders.
        considerTip(f, m, res, k);

        const float amt = depth * (1.f - std::exp(-excess / softEff));
        grTarget_[static_cast<size_t>(k)] = -std::min(depth, amt);
      }

      // Peak list must be sorted by Hz for the low→high F0 walk.
      for (int i = 1; i < nPeaks; ++i)
      {
        PeakTip key = peaks[i];
        int j = i - 1;
        while (j >= 0 && peaks[j].hz > key.hz)
        {
          peaks[j + 1] = peaks[j];
          --j;
        }
        peaks[j + 1] = key;
      }

      applyHarmonicsProtect(peaks, nPeaks);

      blurGrByOctaves();
      // Filter curve gates Depth: 0 dB → full, −24 dB → none (linear in dB).
      applySearchMaskToGr();
    }

    for (int k = 0; k <= half; ++k)
    {
      float& g = grDb_[static_cast<size_t>(k)];
      const float t = grTarget_[static_cast<size_t>(k)];
      const float c = (t < g) ? atkCoeff_ : relCoeff_;
      g += c * (t - g);
      g = std::clamp(g, kGrFloorDb, 0.f);
      sanitizeDenormal(g);
    }

    // Real gain on positive bins; keep Hermitian by mirroring.
    {
      const float g0 = dbToLin(grDb_[0]);
      reL_[0] *= g0;
      reR_[0] *= g0;
    }
    for (int k = 1; k < half; ++k)
    {
      const float gLin = dbToLin(grDb_[static_cast<size_t>(k)]);
      reL_[static_cast<size_t>(k)] *= gLin;
      imL_[static_cast<size_t>(k)] *= gLin;
      reR_[static_cast<size_t>(k)] *= gLin;
      imR_[static_cast<size_t>(k)] *= gLin;
      const int mk = n - k;
      reL_[static_cast<size_t>(mk)] *= gLin;
      imL_[static_cast<size_t>(mk)] *= gLin;
      reR_[static_cast<size_t>(mk)] *= gLin;
      imR_[static_cast<size_t>(mk)] *= gLin;
    }
    {
      const float gN = dbToLin(grDb_[static_cast<size_t>(half)]);
      reL_[static_cast<size_t>(half)] *= gN;
      reR_[static_cast<size_t>(half)] *= gN;
    }

    ifftRadix2(reL_.data(), imL_.data(), n);
    ifftRadix2(reR_.data(), imR_.data(), n);

    // Shift-OLA: add windowed frame, emit hop, shift accumulator.
    for (int i = 0; i < n; ++i)
    {
      const float w = window_[static_cast<size_t>(i)];
      olaL_[static_cast<size_t>(i)] += reL_[static_cast<size_t>(i)] * w;
      olaR_[static_cast<size_t>(i)] += reR_[static_cast<size_t>(i)] * w;
    }

    const int outMask = outMask_;
    for (int i = 0; i < hop; ++i)
    {
      float oL = olaL_[static_cast<size_t>(i)] * colaNorm_;
      float oR = olaR_[static_cast<size_t>(i)] * colaNorm_;
      sanitizeDenormal(oL);
      sanitizeDenormal(oR);
      outL_[static_cast<size_t>(outWrite_)] = oL;
      outR_[static_cast<size_t>(outWrite_)] = oR;
      outWrite_ = (outWrite_ + 1) & outMask;
    }

    const int keep = n - hop;
    std::memmove(olaL_.data(), olaL_.data() + hop, sizeof(float) * static_cast<size_t>(keep));
    std::memmove(olaR_.data(), olaR_.data() + hop, sizeof(float) * static_cast<size_t>(keep));
    std::fill(olaL_.begin() + keep, olaL_.begin() + n, 0.f);
    std::fill(olaR_.begin() + keep, olaR_.begin() + n, 0.f);

    updateDisplayGr();
  }

  /**
   * Peak-list Harmonics: walk Depth GR tips low→high. Tips already in a
   * ladder are not used as a new F0 start. Free tip → try F0 = tip, tip/2…/4
   * (≥3 consecutive hits). Soft-keep + n·F0 grid; boom only if louder than
   * all other rungs by Threshold. Overlap: min keep (max GR).
   */
  void applyHarmonicsProtect(const PeakTip* peaks, int nPeaks)
  {
    ladderN_ = 0;
    ladderKeep_ = 0.f;
    if (!peaks || nPeaks < 3 || harmonics_ < 1.0e-3f)
      return;

    const int half = fftSize_ / 2;
    const float nyquist = static_cast<float>(sampleRate_ * 0.5);
    if (half < 8 || !(nyquist > 20.f))
      return;

    const float binHz = nyquist / static_cast<float>(half);
    constexpr float kF0Min = 70.f;
    constexpr float kF0Max = 800.f;
    constexpr float kGridFrac = 0.08f;
    constexpr int kMaxHarm = 24;
    constexpr int kMaxLadders = 12;
    constexpr int kMaxMembers = 16;

    auto findNear = [&](float hzIdeal, float tol, const bool* used) -> int {
      int best = -1;
      float bestD = tol + 1.f;
      for (int p = 0; p < nPeaks; ++p)
      {
        if (used && used[p])
          continue;
        const float d = std::fabs(peaks[p].hz - hzIdeal);
        if (d < bestD)
        {
          bestD = d;
          best = p;
        }
      }
      return (best >= 0 && bestD <= tol) ? best : -1;
    };

    auto addCand = [&](float f, float* cands, int& nC) {
      if (!(f >= kF0Min && f <= kF0Max))
        return;
      for (int i = 0; i < nC; ++i)
      {
        if (std::fabs(cands[i] - f) <= f * 0.03f)
          return;
      }
      if (nC < 8)
        cands[nC++] = f;
    };

    int ladderMem[kMaxLadders][kMaxMembers];
    int ladderNMem[kMaxLadders];
    float ladderF0[kMaxLadders];
    int nLadders = 0;

    bool inLadder[kMaxPeaks];
    for (int i = 0; i < kMaxPeaks; ++i)
      inLadder[i] = false;

    // Walk tips low→high. Already claimed → skip (no new ladder from them).
    // From a free tip: try F0 = tip, then tip/2…/4 (missing fundamental).
    for (int i = 0; i < nPeaks; ++i)
    {
      if (inLadder[i] || nLadders >= kMaxLadders)
        continue;

      float cands[8];
      int nC = 0;
      for (int div = 1; div <= 4; ++div)
        addCand(peaks[i].hz / static_cast<float>(div), cands, nC);

      int bestMem[kMaxMembers];
      int bestNMem = 0;
      float bestF0 = 0.f;
      float bestScore = -1.f;

      for (int ci = 0; ci < nC; ++ci)
      {
        const float f0 = cands[ci];
        const float tol = std::max(f0 * kGridFrac, 1.5f * binHz);
        bool used[kMaxPeaks];
        for (int u = 0; u < nPeaks; ++u)
          used[u] = false;

        int peakAt[kMaxHarm + 1];
        for (int h = 0; h <= kMaxHarm; ++h)
          peakAt[h] = -1;

        for (int h = 1; h <= kMaxHarm; ++h)
        {
          const float hzIdeal = static_cast<float>(h) * f0;
          if (hzIdeal >= nyquist * 0.98f)
            break;
          const int p = findNear(hzIdeal, tol, used);
          if (p < 0)
            continue;
          used[p] = true;
          peakAt[h] = p;
        }

        int bestRun = 0;
        int run = 0;
        for (int h = 1; h <= kMaxHarm; ++h)
        {
          if (peakAt[h] >= 0)
          {
            ++run;
            bestRun = std::max(bestRun, run);
          }
          else
            run = 0;
        }
        if (bestRun < 3)
          continue;

        int members[kMaxMembers];
        int nMem = 0;
        float score = 0.f;
        for (int h = 1; h <= kMaxHarm && nMem < kMaxMembers; ++h)
        {
          if (peakAt[h] < 0)
            continue;
          members[nMem++] = peakAt[h];
          score += peaks[peakAt[h]].res;
        }
        if (nMem < 3)
          continue;
        score += 0.5f * static_cast<float>(nMem);
        // Prefer tip-as-F0 (div1) when scores are close.
        if (ci == 0)
          score += 1.f;

        if (score > bestScore)
        {
          bestScore = score;
          bestF0 = f0;
          bestNMem = nMem;
          for (int m = 0; m < nMem; ++m)
            bestMem[m] = members[m];
        }
      }

      if (bestNMem < 3)
        continue;

      for (int m = 0; m < bestNMem; ++m)
      {
        ladderMem[nLadders][m] = bestMem[m];
        inLadder[bestMem[m]] = true;
      }
      ladderNMem[nLadders] = bestNMem;
      ladderF0[nLadders] = bestF0;
      ++nLadders;
    }

    if (nLadders < 1)
      return;

    // Drop octave/subharmonic duplicates — keep the stronger ladder only.
    // tip/k often proposes both F0 and 2·F0; overlapping min-keep then chews
    // shared partials even when none is a real boom.
    {
      float score[kMaxLadders];
      for (int L = 0; L < nLadders; ++L)
      {
        float s = 0.f;
        for (int m = 0; m < ladderNMem[L]; ++m)
          s += peaks[ladderMem[L][m]].res + 0.25f * peaks[ladderMem[L][m]].db;
        score[L] = s + 0.5f * static_cast<float>(ladderNMem[L]);
      }
      bool kill[kMaxLadders];
      for (int L = 0; L < nLadders; ++L)
        kill[L] = false;
      for (int a = 0; a < nLadders; ++a)
      {
        if (kill[a])
          continue;
        for (int b = a + 1; b < nLadders; ++b)
        {
          if (kill[b])
            continue;
          const float ra = ladderF0[a] / ladderF0[b];
          const bool oct =
            (ra > 1.85f && ra < 2.15f) || (ra > 0.46f && ra < 0.54f)
            || (ra > 2.8f && ra < 3.2f) || (ra > 0.31f && ra < 0.36f);
          if (!oct)
            continue;
          if (score[a] >= score[b])
            kill[b] = true;
          else
            kill[a] = true;
        }
      }
      int w = 0;
      for (int L = 0; L < nLadders; ++L)
      {
        if (kill[L])
          continue;
        if (w != L)
        {
          ladderNMem[w] = ladderNMem[L];
          ladderF0[w] = ladderF0[L];
          for (int m = 0; m < ladderNMem[L]; ++m)
            ladderMem[w][m] = ladderMem[L][m];
        }
        ++w;
      }
      nLadders = w;
    }
    if (nLadders < 1)
      return;

    float keepPeak[kMaxPeaks];
    bool claimed[kMaxPeaks];
    for (int i = 0; i < nPeaks; ++i)
    {
      keepPeak[i] = 0.f;
      claimed[i] = false;
    }

    // Boom only if louder than every other ladder tip by ≥ Threshold.
    // Threshold 0 → no boom path (full Harmonics keep on all rungs).
    for (int L = 0; L < nLadders; ++L)
    {
      const int nMem = ladderNMem[L];
      for (int m = 0; m < nMem; ++m)
      {
        const int pi = ladderMem[L][m];
        float maxOther = -240.f;
        for (int j = 0; j < nMem; ++j)
        {
          if (j == m)
            continue;
          maxOther = std::max(maxOther, peaks[ladderMem[L][j]].db);
        }
        float keep = harmonics_;
        if (thresholdDb_ > 1.0e-3f && maxOther > -200.f
            && peaks[pi].db > maxOther + thresholdDb_)
        {
          const float excess = peaks[pi].db - maxOther - thresholdDb_;
          keep = harmonics_
                 * std::clamp(1.f - excess / thresholdDb_, 0.f, 1.f);
        }
        if (!claimed[pi])
        {
          keepPeak[pi] = keep;
          claimed[pi] = true;
        }
        else
          keepPeak[pi] = std::min(keepPeak[pi], keep);
      }
    }

    // Per-bin keep in scratch_ (blur runs after). Overlap → min keep (max GR).
    for (int k = 0; k <= half; ++k)
      scratch_[static_cast<size_t>(k)] = 0.f;
    const float detectOct = std::max(sharpnessOct_, 1.f / 12.f);

    auto splatKeep = [&](float hz, float keep) {
      if (!(keep > 1.0e-3f) || !(hz > 1.f))
        return;
      const float halfW = std::max(
        hz * (std::pow(2.f, 0.5f * detectOct) - 1.f), 2.f * binHz);
      for (int k = kLo_; k <= kHi_; ++k)
      {
        if (!(grTarget_[static_cast<size_t>(k)] < -1.0e-3f))
          continue;
        const float f =
          (static_cast<float>(k) / static_cast<float>(half)) * nyquist;
        if (std::fabs(f - hz) <= halfW)
        {
          float& bk = scratch_[static_cast<size_t>(k)];
          bk = (bk < 1.0e-3f) ? keep : std::min(bk, keep);
        }
      }
    };

    for (int i = 0; i < nPeaks; ++i)
    {
      if (claimed[i])
        splatKeep(peaks[i].hz, keepPeak[i]);
    }

    // Also cover n·F0 grid (skirt below Search Low). Use full Harmonics keep
    // on virtual slots — averaging in boom tips was pulling skirt protect down.
    for (int L = 0; L < nLadders; ++L)
    {
      const float f0 = ladderF0[L];
      for (int h = 1; h <= kMaxHarm; ++h)
      {
        const float hzIdeal = static_cast<float>(h) * f0;
        if (hzIdeal < 25.f || hzIdeal >= nyquist * 0.98f)
          break;
        splatKeep(hzIdeal, harmonics_);
      }
    }

    for (int k = kLo_; k <= kHi_; ++k)
    {
      const float keep = scratch_[static_cast<size_t>(k)];
      if (!(keep > 1.0e-3f))
        continue;
      float& g = grTarget_[static_cast<size_t>(k)];
      if (g < -1.0e-3f)
        g *= (1.f - keep);
    }

    ladderKeep_ = harmonics_;
    if (ladder_.size() < static_cast<size_t>(2 * kMaxLadderRungs))
      ladder_.assign(static_cast<size_t>(2 * kMaxLadderRungs), 0.f);

    for (int i = 0; i < nPeaks; ++i)
    {
      if (!claimed[i] || keepPeak[i] < 1.0e-3f)
        continue;
      if (ladderN_ >= kMaxLadderRungs)
        break;
      const float hz = peaks[i].hz;
      const float halfW = std::max(
        hz * (std::pow(2.f, 0.5f * detectOct) - 1.f), 2.f * binHz);
      const bool boom = keepPeak[i] < harmonics_ * 0.5f;
      ladder_[static_cast<size_t>(2 * ladderN_)] = hz;
      ladder_[static_cast<size_t>(2 * ladderN_ + 1)] = boom ? -halfW : halfW;
      ++ladderN_;
    }
  }

  void blurGrByOctaves()
  {
    const int half = fftSize_ / 2;
    const float nyquist = static_cast<float>(sampleRate_ * 0.5);
    const float oct = sharpnessOct_;
    for (int k = 0; k <= half; ++k)
      scratch_[static_cast<size_t>(k)] = grTarget_[static_cast<size_t>(k)];

    // Splat each peak as a gaussian notch (weight 1 at centre). Take min so
    // neighbouring zeros cannot dilute Depth the way a mean blur did.
    std::fill(grTarget_.begin(),
              grTarget_.begin() + static_cast<size_t>(half) + 1, 0.f);

    for (int k = kLo_; k <= kHi_; ++k)
    {
      const float peak = scratch_[static_cast<size_t>(k)];
      if (!(peak < -1.0e-3f))
        continue;
      const float f =
        (static_cast<float>(k) / static_cast<float>(half)) * nyquist;
      if (!(f > 1.f))
      {
        float& dst = grTarget_[static_cast<size_t>(k)];
        dst = std::min(dst, peak);
        continue;
      }
      const float f0 = f * std::pow(2.f, -0.5f * oct);
      const float f1 = f * std::pow(2.f, 0.5f * oct);
      int lo = static_cast<int>(f0 / nyquist * static_cast<float>(half));
      int hi = static_cast<int>(f1 / nyquist * static_cast<float>(half));
      lo = std::clamp(lo, kLo_, kHi_);
      hi = std::clamp(hi, kLo_, kHi_);
      if (hi < lo)
        std::swap(lo, hi);
      const float sigma = std::max(0.5f, 0.5f * static_cast<float>(hi - lo + 1));
      const float inv2s2 = 1.f / (2.f * sigma * sigma);
      for (int j = lo; j <= hi; ++j)
      {
        const float d = static_cast<float>(j - k);
        const float w = std::exp(-d * d * inv2s2);
        const float g = peak * w;
        float& dst = grTarget_[static_cast<size_t>(j)];
        dst = std::min(dst, g);
      }
    }
  }

  /**
   * Scale GR by search-filter response: mask = (filtDb − (−24)) / 24.
   * Passband keeps Depth; at the chart floor (−24 dB) Depth is zero.
   */
  void applySearchMaskToGr()
  {
    const int half = fftSize_ / 2;
    const int nFilt = static_cast<int>(filtDb_.size());
    const float span = -kDetectFloorDb; // 24
    for (int k = 0; k <= half; ++k)
    {
      float& g = grTarget_[static_cast<size_t>(k)];
      if (!(g < 0.f))
        continue;
      const float wDb =
        (k < nFilt) ? filtDb_[static_cast<size_t>(k)] : kDetectFloorDb;
      const float mask = std::clamp((wDb - kDetectFloorDb) / span, 0.f, 1.f);
      g *= mask;
    }
  }

  void updateDisplaySpectrum()
  {
    const float alpha = emaSpec_;
    const float nrm = 2.f / static_cast<float>(fftSize_);
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
      const int lo = binLo_[static_cast<size_t>(i)];
      const int hi = binHi_[static_cast<size_t>(i)];
      float peakL = 0.f;
      float peakR = 0.f;
      for (int k = lo; k < hi; ++k)
      {
        peakL = std::max(peakL, fftBinMag(reL_.data(), imL_.data(), k));
        peakR = std::max(peakR, fftBinMag(reR_.data(), imR_.data(), k));
      }
      // Viz clamps to 0 dBFS; detection path keeps full headroom separately.
      const float dL = magToDb(peakL, nrm, kSpecCeilDb);
      const float dR = magToDb(peakR, nrm, kSpecCeilDb);
      const float dA = 0.5f * (dL + dR);
      lDb_[static_cast<size_t>(i)] += alpha * (dL - lDb_[static_cast<size_t>(i)]);
      rDb_[static_cast<size_t>(i)] += alpha * (dR - rDb_[static_cast<size_t>(i)]);
      avgDb_[static_cast<size_t>(i)] += alpha * (dA - avgDb_[static_cast<size_t>(i)]);
      maxDb_[static_cast<size_t>(i)] =
        std::max(maxDb_[static_cast<size_t>(i)] - 0.05f, dA);
    }
  }

  void updateDisplayGr()
  {
    // Same log bands as the analyzer: report GR at the FFT bin that owns the
    // band's magnitude peak. Sampling only at the band centre put the GR tip
    // beside the spectrum needle whenever the peak sat near a band edge.
    for (int i = 0; i < bins_; ++i)
    {
      if (!binValid_[static_cast<size_t>(i)])
      {
        grDisp_[static_cast<size_t>(i)] = 0.f;
        continue;
      }
      const int lo = binLo_[static_cast<size_t>(i)];
      const int hi = binHi_[static_cast<size_t>(i)];
      int peakK = lo;
      float peakDb = magDb_[static_cast<size_t>(lo)];
      for (int k = lo + 1; k < hi; ++k)
      {
        const float m = magDb_[static_cast<size_t>(k)];
        if (m > peakDb)
        {
          peakDb = m;
          peakK = k;
        }
      }
      grDisp_[static_cast<size_t>(i)] =
        std::clamp(grDb_[static_cast<size_t>(peakK)], kGrFloorDb, 0.f);
    }
  }

  double sampleRate_ = 48000.0;
  int fftSize_ = 2048;
  int hopSize_ = 512;
  int dryMask_ = 8191;
  int outMask_ = 8191;
  int writePos_ = 0;
  int hopCount_ = 0;
  int filled_ = 0;
  int dryWrite_ = 0;
  int outRead_ = 0;
  int outWrite_ = 0;
  int bins_ = 0;
  int kLo_ = 1;
  int kHi_ = 1;
  bool stftActive_ = false;
  /** When true, hops skip detection (GR→0) but keep wet OLA running. */
  bool bypassActive_ = false;

  float fLoHz_ = 200.f;
  float fHiHz_ = 5000.f;
  int hpSlopeDb_ = 24;
  int lpSlopeDb_ = 24;
  float depthDb_ = 6.f;
  float sharpnessOct_ = 1.f / 12.f;
  float thresholdDb_ = 6.f;
  float harmonics_ = 0.f;
  float attackMs_ = 5.f;
  float releaseMs_ = 80.f;
  float atkCoeff_ = 0.5f;
  float relCoeff_ = 0.1f;
  float envCoeff_ = 0.1f;
  float emaSpec_ = 0.2f;
  float colaNorm_ = 0.5f;

  BiquadCoeffs hpCoeff_;
  BiquadCoeffs lpCoeff_;
  std::atomic<int> pendingFft_ {2048};
  std::atomic<int> pendingBins_ {128};

  std::vector<float> inL_, inR_, olaL_, olaR_, dryL_, dryR_, outL_, outR_, window_;
  std::vector<float> reL_, imL_, reR_, imR_;
  std::vector<float> magDb_, detectDb_, filtDb_, envDb_, grDb_, grTarget_, scratch_;
  std::vector<float> avgDb_, maxDb_, lDb_, rDb_, grDisp_;
  std::vector<float> pubAvg_, pubMax_, pubL_, pubR_, pubGr_;
  /** Live guides: interleaved (centerHz, halfWidthHz) × ladderN_. */
  std::vector<float> ladder_;
  std::vector<float> pubLadder_;
  int ladderN_ = 0;
  int pubLadderN_ = 0;
  float ladderKeep_ = 0.f;
  float pubLadderKeep_ = 0.f;
  std::vector<int> binLo_, binHi_, binValid_;
  std::mutex mutex_;
};

} // namespace Dsp
} // namespace calfNXT
