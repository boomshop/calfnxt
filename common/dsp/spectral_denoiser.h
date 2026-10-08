#pragma once

// Spectral noise reduction (Denoiser): STFT Wiener denoise with 3 learnable
// noise-power profiles, soft band mask, and profile morph on automation.
//
// Reconstruction: sqrt-Hann analysis/synthesis, hop = N/4, shift-OLA.
// Latency = N (full FFT length; wet FIFO prefilled).
// Buffers preallocated to kMaxFft (no RT heap).
//
// Learn: average mid |X|^2 while Learn is engaged; finalize on stop.
//         Re-Learn on a valid slot continues the average (dazulernen);
//         Clear first for a fresh fingerprint.
// Profile listen: random-phase noise from that slot's Pn (latency-matched).
// Diff listen: delayed dry − wet.
//
// Wiener: xi = max(Px−Pn,0)/(Pn+eps); G = xi/(1+xi); G = max(G, floorLin);
//         G = 1 − amount · bandW · (1−G). Soft band from fLo…fHi
//         (each edge optional via fLoOn / fHiOn).
// Floor is stored as min gain in dB (−60…0); applied as linear 10^(dB/20).
//
// Viz: SpectrumTap layout + GR response [N, L×N, R×N] + active-profile
// spectrum (same layout, avg = profile dB).

#include "dsp_math.h"
#include "fft_r2.h"
#include "gain_util.h"
#include "spectrum_bins.h"

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

class SpectralDenoiser
{
public:
  static constexpr int kMaxFft = 8192;
  static constexpr int kMaxHalf = kMaxFft / 2 + 1;
  static constexpr int kMaxBins = kMaxSpectrumBins;
  static constexpr int kMinBins = kMinSpectrumBins;
  static constexpr int kNumProfiles = 3;
  static constexpr float kFloorDb = -120.f;
  static constexpr float kSpecCeilDb = 0.f;
  static constexpr float kEps = 1.0e-20f;

  SpectralDenoiser()
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
  }

  /** 1024 / 2048 / 4096 / 8192. Applied on next process() (no audio-thread alloc). */
  void setFftSize(int size)
  {
    if (size != 1024 && size != 2048 && size != 4096 && size != 8192)
      size = 2048;
    pendingFft_.store(size, std::memory_order_relaxed);
  }

  int fftSize() const { return fftSize_; }
  int hopSize() const { return hopSize_; }

  /** Causal WOLA delay (samples). Full FFT length for wet FIFO prefill. */
  uint32_t latencySamples() const
  {
    return static_cast<uint32_t>(std::max(1, fftSize_));
  }

  void configureBins(int bins)
  {
    bins = std::clamp(bins, kMinBins, kMaxBins);
    pendingBins_.store(bins, std::memory_order_relaxed);
  }

  /**
   * Log-bin count for the profile thumbnails only.
   * The main spectrum keeps `configureBins`. Applied on the audio thread.
   */
  void configureProfileUiBins(int bins)
  {
    bins = std::clamp(bins, kMinBins, kMaxBins);
    pendingProfileUiBins_.store(bins, std::memory_order_relaxed);
  }

  void setParams(float fLoHz, float fHiHz, float amount, float floorDb,
                 float blendMs, bool fLoOn = true, bool fHiOn = true)
  {
    if (fLoHz > fHiHz)
      std::swap(fLoHz, fHiHz);
    fLoHz_ = std::clamp(fLoHz, 20.f, 20000.f);
    fHiHz_ = std::clamp(fHiHz, 20.f, 20000.f);
    fLoOn_ = fLoOn;
    fHiOn_ = fHiOn;
    amount_ = std::clamp(amount, 0.f, 1.f);
    floorDb_ = std::clamp(floorDb, -60.f, 0.f);
    floorLin_ = dbToLin(floorDb_);
    blendMs_ = std::clamp(blendMs, 10.f, 5000.f);
    updateTimeCoeffs();
    rebuildBandWeights();
  }

  /** Select active profile 0…2. Morphs Pn over blendMs when the target changes. */
  void setProfileTarget(int slot)
  {
    slot = std::clamp(slot, 0, kNumProfiles - 1);
    if (slot == targetSlot_)
      return;
    // Snapshot current morph state as the new blend source.
    const int half = fftSize_ / 2 + 1;
    for (int k = 0; k < half; ++k)
      pnFrom_[static_cast<size_t>(k)] = pnActive_[static_cast<size_t>(k)];
    targetSlot_ = slot;
    morphT_ = 0.f;
    morphing_ = true;
    copyProfileTo(pnTo_, slot);
  }

  /**
   * Begin averaging noise power into slot 0…2.
   * If the slot already has a fingerprint at the current FFT size, seed the
   * accumulator from it so a new Learn session continues ("dazulernen")
   * instead of wiping. Clear the slot first for a fresh capture.
   */
  void startLearn(int slot)
  {
    slot = std::clamp(slot, 0, kNumProfiles - 1);
    learnSlot_ = slot;
    learnAccum_ = 0.0;
    learning_ = true;
    const int half = fftSize_ / 2 + 1;
    const Profile& existing = profiles_[slot];
    // Weight prior capture as ~0.5 s of hops so new audio can pull it around.
    const int seedHops = std::max(
      1, static_cast<int>(std::lround(
           0.5 * sampleRate_ / static_cast<double>(std::max(1, hopSize_)))));
    if (existing.valid && existing.fftSize == fftSize_)
    {
      learnHops_ = seedHops;
      for (int k = 0; k < half; ++k)
        learnSum_[static_cast<size_t>(k)] =
          existing.power[static_cast<size_t>(k)]
          * static_cast<float>(seedHops);
    }
    else
    {
      learnHops_ = 0;
      std::fill(learnSum_.begin(), learnSum_.begin() + half, 0.f);
    }
  }

  /**
   * Stop learning. If `commit` and hops were collected, write the average into
   * the learn slot and return true. Empty / cancel leaves the previous profile.
   */
  bool stopLearn(bool commit = true)
  {
    if (!learning_)
      return false;
    learning_ = false;
    if (!commit || learnHops_ <= 0)
    {
      learnHops_ = 0;
      learnAccum_ = 0.0;
      return false;
    }
    const int n = fftSize_;
    const int half = n / 2;
    Profile& p = profiles_[learnSlot_];
    const float inv = 1.f / static_cast<float>(learnHops_);
    std::fill(p.power.begin(), p.power.end(), 0.f);
    for (int k = 0; k <= half; ++k)
      p.power[static_cast<size_t>(k)] =
        learnSum_[static_cast<size_t>(k)] * inv;
    p.fftSize = n;
    p.valid = true;
    profilesDirty_.store(true, std::memory_order_relaxed);
    if (targetSlot_ == learnSlot_)
    {
      copyProfileTo(pnTo_, learnSlot_);
      for (int k = 0; k <= half; ++k)
        pnFrom_[static_cast<size_t>(k)] = pnActive_[static_cast<size_t>(k)];
      morphT_ = 0.f;
      morphing_ = true;
    }
    learnHops_ = 0;
    learnAccum_ = 0.0;
    return true;
  }

  /** Abandon an in-progress learn without writing. */
  void cancelLearn() { stopLearn(false); }

  bool isLearning() const { return learning_; }
  /** Learning slot 0…2, or −1 if idle. */
  int learnSlot() const { return learning_ ? learnSlot_ : -1; }

  void clearProfile(int slot)
  {
    slot = std::clamp(slot, 0, kNumProfiles - 1);
    profiles_[slot].valid = false;
    profiles_[slot].fftSize = 0;
    std::fill(profiles_[slot].power.begin(), profiles_[slot].power.end(), 0.f);
    if (targetSlot_ == slot)
    {
      // Snap — Clear should drop the fingerprint immediately (no Blend morph).
      for (int k = 0; k < kMaxHalf; ++k)
      {
        pnTo_[static_cast<size_t>(k)] = 0.f;
        pnActive_[static_cast<size_t>(k)] = 0.f;
        pnFrom_[static_cast<size_t>(k)] = 0.f;
      }
      morphT_ = 1.f;
      morphing_ = false;
    }
    if (listenSlot_ == slot)
      listenSlot_ = -1;
    profilesDirty_.store(true, std::memory_order_relaxed);
  }

  /** Profile listen: slot 0…2, or −1 to disable. Exclusive with Diff Listen. */
  void setProfileListen(int slot)
  {
    if (slot < 0)
    {
      listenSlot_ = -1;
      return;
    }
    listenSlot_ = std::clamp(slot, 0, kNumProfiles - 1);
  }

  bool profileValid(int slot) const
  {
    if (slot < 0 || slot >= kNumProfiles)
      return false;
    return profiles_[slot].valid;
  }

  /**
   * Copy stored noise power (|X|^2, half+1 bins for the profile's FFT size).
   * Returns bin count written, or 0. Optionally writes the FFT size used at learn.
   */
  int getProfileRaw(int slot, float* out, int maxOut, int* fftSizeOut = nullptr) const
  {
    if (slot < 0 || slot >= kNumProfiles || !out || maxOut < 1)
      return 0;
    const Profile& p = profiles_[slot];
    if (!p.valid || p.fftSize < 4)
      return 0;
    const int n = p.fftSize / 2 + 1;
    if (maxOut < n)
      return 0;
    std::memcpy(out, p.power.data(), sizeof(float) * static_cast<size_t>(n));
    if (fftSizeOut)
      *fftSizeOut = p.fftSize;
    return n;
  }

  /** Load a learned profile from session state. */
  bool setProfileRaw(int slot, int fftSize, const float* power, int n)
  {
    if (slot < 0 || slot >= kNumProfiles || !power || n < 2)
      return false;
    if (fftSize != 1024 && fftSize != 2048 && fftSize != 4096 && fftSize != 8192)
      return false;
    const int expect = fftSize / 2 + 1;
    if (n != expect)
      return false;
    Profile& p = profiles_[slot];
    std::fill(p.power.begin(), p.power.end(), 0.f);
    std::memcpy(p.power.data(), power, sizeof(float) * static_cast<size_t>(n));
    p.fftSize = fftSize;
    p.valid = true;
    if (targetSlot_ == slot)
    {
      copyProfileTo(pnTo_, slot);
      morphT_ = 1.f;
      morphing_ = false;
      const int half = fftSize_ / 2 + 1;
      for (int k = 0; k < half; ++k)
        pnActive_[static_cast<size_t>(k)] = pnTo_[static_cast<size_t>(k)];
    }
    profilesDirty_.store(true, std::memory_order_relaxed);
    return true;
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
    writePos_ = 0;
    hopCount_ = 0;
    filled_ = 0;
    dryWrite_ = 0;
    outRead_ = 0;
    outWrite_ = 0;
    learning_ = false;
    learnHops_ = 0;
    learnAccum_ = 0.0;
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
    std::fill(profDisp_.begin(), profDisp_.end(), kFloorDb);
  }

  /**
   * Process in-place stereo. Diff Listen: delayed dry − wet.
   * Profile Listen (set separately) wins over Diff when a valid slot is set.
   */
  void process(float* left, float* right, int n, bool bypass, bool diffListen)
  {
    if (!left || n <= 0)
      return;
    applyPendingSizes();

    bypassActive_ = bypass;
    const bool profListen =
      listenSlot_ >= 0 && listenSlot_ < kNumProfiles
      && profiles_[listenSlot_].valid;
    if (profListen)
      diffListen = false;

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
          processHop();
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

      float outL = 0.f;
      float outR = 0.f;
      if (diffListen)
      {
        outL = dryOutL - wetL;
        outR = dryOutR - wetR;
      }
      else
      {
        outL = wetL;
        outR = wetR;
      }
      left[i] = outL;
      if (nChR)
        right[i] = outR;
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
   * Active (morphed) profile spectrum — SpectrumTap layout.
   * avg/max/L/R all carry the profile power in dB.
   */
  int takeActiveProfileSpectrum(float* out, int maxOut)
  {
    if (!out || maxOut < 2)
      return 0;
    std::lock_guard<std::mutex> lock(mutex_);
    const int n = bins_;
    if (n < 1 || pubProf_.size() != static_cast<size_t>(n))
      return 0;
    const int need = 2 + 4 * n;
    if (maxOut < need)
      return 0;
    out[0] = static_cast<float>(n);
    out[1] = 0.f;
    std::memcpy(out + 2, pubProf_.data(), sizeof(float) * static_cast<size_t>(n));
    std::memcpy(out + 2 + n, pubProf_.data(), sizeof(float) * static_cast<size_t>(n));
    std::memcpy(out + 2 + 2 * n, pubProf_.data(),
                sizeof(float) * static_cast<size_t>(n));
    std::memcpy(out + 2 + 3 * n, pubProf_.data(),
                sizeof(float) * static_cast<size_t>(n));
    return need;
  }

  /**
   * Log-binned dB curve for one stored profile (UI mini charts / IR JSON).
   * Uses mean power per log bin (not peak) so wide HF bins don't turn the
   * FFT noise floor into a ceiling of spikes.
   */
  int fillSlotProfileDb(int slot, float* outDb, int maxBins) const
  {
    if (!outDb || maxBins < 1 || slot < 0 || slot >= kNumProfiles)
      return 0;
    const bool uiMap = profileUiBins_ >= kMinBins
                       && static_cast<int>(profileUiLo_.size()) == profileUiBins_;
    const int nBins = uiMap ? profileUiBins_ : bins_;
    const std::vector<int>& binLo = uiMap ? profileUiLo_ : binLo_;
    const std::vector<int>& binHi = uiMap ? profileUiHi_ : binHi_;
    const std::vector<int>& binValid = uiMap ? profileUiValid_ : binValid_;
    const int n = std::min(nBins, maxBins);
    if (n < 1)
      return 0;
    if (!profiles_[slot].valid)
    {
      for (int i = 0; i < n; ++i)
        outDb[i] = kFloorDb;
      return n;
    }
    float pn[kMaxHalf];
    fillProfilePower(pn, slot);
    const float norm = 2.f / static_cast<float>(std::max(4, fftSize_));
    for (int i = 0; i < n; ++i)
    {
      if (!binValid[static_cast<size_t>(i)])
      {
        outDb[i] = kFloorDb;
        continue;
      }
      const int lo = binLo[static_cast<size_t>(i)];
      const int hi = binHi[static_cast<size_t>(i)];
      double sum = 0.0;
      int count = 0;
      for (int k = lo; k < hi; ++k)
      {
        sum += static_cast<double>(std::max(0.f, pn[k]));
        ++count;
      }
      const float mean = count > 0 ? static_cast<float>(sum / count) : 0.f;
      outDb[i] = magToDb(std::sqrt(mean), norm);
    }
    return n;
  }

  int vizBins() const { return bins_; }

  /** Bin count of the profile-thumbnail series (falls back to the main map). */
  int profileUiBinCount() const
  {
    return profileUiBins_ >= kMinBins ? profileUiBins_ : bins_;
  }

  /** True once after learn/clear/setProfileRaw until consumed. */
  bool takeProfilesDirty()
  {
    return profilesDirty_.exchange(false, std::memory_order_relaxed);
  }

  void publish()
  {
    std::unique_lock<std::mutex> lock(mutex_, std::try_to_lock);
    if (!lock.owns_lock())
      return;

    auto copyEq = [](std::vector<float>& dst, const std::vector<float>& src) {
      if (src.empty() || dst.size() != src.size())
        return;
      std::memcpy(dst.data(), src.data(), src.size() * sizeof(float));
    };
    copyEq(pubAvg_, avgDb_);
    copyEq(pubMax_, maxDb_);
    copyEq(pubL_, lDb_);
    copyEq(pubR_, rDb_);
    copyEq(pubGr_, grDisp_);
    copyEq(pubProf_, profDisp_);
  }

private:
  struct Profile
  {
    bool valid = false;
    int fftSize = 0;
    std::vector<float> power; // kMaxHalf, |X|^2
  };

  void allocMax()
  {
    const size_t n = static_cast<size_t>(kMaxFft);
    const size_t half = static_cast<size_t>(kMaxHalf);
    inL_.assign(n, 0.f);
    inR_.assign(n, 0.f);
    olaL_.assign(n, 0.f);
    olaR_.assign(n, 0.f);
    window_.assign(n, 0.f);
    reL_.assign(n, 0.f);
    imL_.assign(n, 0.f);
    reR_.assign(n, 0.f);
    imR_.assign(n, 0.f);
    px_.assign(half, 0.f);
    pnActive_.assign(half, 0.f);
    pnFrom_.assign(half, 0.f);
    pnTo_.assign(half, 0.f);
    gain_.assign(half, 1.f);
    bandW_.assign(half, 0.f);
    learnSum_.assign(half, 0.f);
    scratchPn_.assign(half, 0.f);
    for (int s = 0; s < kNumProfiles; ++s)
    {
      profiles_[s].power.assign(half, 0.f);
      profiles_[s].valid = false;
      profiles_[s].fftSize = 0;
    }

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
      rebuildBandWeights();
      // Remap morph buffers to the new FFT grid from the target profile.
      copyProfileTo(pnTo_, targetSlot_);
      copyProfileTo(pnFrom_, targetSlot_);
      for (int k = 0; k < want / 2 + 1; ++k)
        pnActive_[static_cast<size_t>(k)] = pnTo_[static_cast<size_t>(k)];
      morphT_ = 1.f;
      morphing_ = false;
      reset();
      // Force IR mini refresh with power-rescaled dB for the new FFT.
      if (profiles_[0].valid || profiles_[1].valid || profiles_[2].valid)
        profilesDirty_.store(true, std::memory_order_relaxed);
    }
    const int wantBins = pendingBins_.load(std::memory_order_relaxed);
    if (wantBins != bins_ || avgDb_.size() != static_cast<size_t>(bins_))
      applyBins(wantBins);
    const int wantUi = pendingProfileUiBins_.load(std::memory_order_relaxed);
    if (wantUi >= kMinBins && wantUi != profileUiBins_)
      applyProfileUiBins(wantUi);
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
    profDisp_.assign(static_cast<size_t>(bins_), kFloorDb);
    {
      std::lock_guard<std::mutex> lock(mutex_);
      pubAvg_.assign(static_cast<size_t>(bins_), kFloorDb);
      pubMax_.assign(static_cast<size_t>(bins_), kFloorDb);
      pubL_.assign(static_cast<size_t>(bins_), kFloorDb);
      pubR_.assign(static_cast<size_t>(bins_), kFloorDb);
      pubGr_.assign(static_cast<size_t>(bins_), 0.f);
      pubProf_.assign(static_cast<size_t>(bins_), kFloorDb);
    }
    rebuildBinMap();
  }

  void applyProfileUiBins(int bins)
  {
    bins = std::clamp(bins, kMinBins, kMaxBins);
    if (bins == profileUiBins_
        && static_cast<int>(profileUiLo_.size()) == profileUiBins_)
      return;
    profileUiBins_ = bins;
    pendingProfileUiBins_.store(bins, std::memory_order_relaxed);
    buildLogBinMap(profileUiBins_, profileUiLo_, profileUiHi_, profileUiValid_);
    profilesDirty_.store(true, std::memory_order_relaxed);
  }

  void rebuildBinMap()
  {
    buildLogBinMap(bins_, binLo_, binHi_, binValid_);
    if (profileUiBins_ >= kMinBins)
      buildLogBinMap(profileUiBins_, profileUiLo_, profileUiHi_, profileUiValid_);
  }

  /** Log partitions of the FFT, 20 Hz…20 kHz. `bins` is the UI pixel budget. */
  void buildLogBinMap(int bins, std::vector<int>& lo, std::vector<int>& hi,
                      std::vector<int>& valid) const
  {
    if (bins < 1)
      return;
    lo.assign(static_cast<size_t>(bins), 0);
    hi.assign(static_cast<size_t>(bins), 0);
    valid.assign(static_cast<size_t>(bins), 0);
    if (fftSize_ < 4)
      return;
    const float nyquist = static_cast<float>(sampleRate_ * 0.5);
    constexpr float fMin = 20.f;
    constexpr float fMaxUi = 20000.f;
    const int fftBins = fftSize_ / 2;
    for (int i = 0; i < bins; ++i)
    {
      const float t0 = static_cast<float>(i) / static_cast<float>(bins);
      const float t1 = static_cast<float>(i + 1) / static_cast<float>(bins);
      const float f0 = fMin * std::pow(fMaxUi / fMin, t0);
      const float f1 = fMin * std::pow(fMaxUi / fMin, t1);
      if (!(f0 < nyquist) || fftBins < 2)
        continue;
      int blo = static_cast<int>(f0 / nyquist * static_cast<float>(fftBins));
      int bhi = static_cast<int>(f1 / nyquist * static_cast<float>(fftBins));
      blo = std::clamp(blo, 1, fftBins - 1);
      bhi = std::clamp(std::max(bhi, blo + 1), blo + 1, fftBins);
      lo[static_cast<size_t>(i)] = blo;
      hi[static_cast<size_t>(i)] = bhi;
      valid[static_cast<size_t>(i)] = 1;
    }
  }

  void updateTimeCoeffs()
  {
    const double hopsPerSec =
      sampleRate_ / static_cast<double>(std::max(1, hopSize_));
    emaSpec_ = static_cast<float>(1.0 - std::exp(-1.0 / (0.1 * hopsPerSec)));
    morphStep_ =
      static_cast<float>(1.0 / std::max(1.0, (blendMs_ * 0.001) * hopsPerSec));
  }

  void rebuildBandWeights()
  {
    if (fftSize_ < 4)
      return;
    const int half = fftSize_ / 2;
    const float nyquist = static_cast<float>(sampleRate_ * 0.5);
    // Disabled edge = full open (HP off → DC, LP off → Nyquist).
    float lo = fLoOn_ ? fLoHz_ : 0.f;
    float hi = fHiOn_ ? fHiHz_ : nyquist;
    if (lo > hi)
      std::swap(lo, hi);
    // Soft skirts ~½ octave outside the pass band (skipped when edge is open).
    const float fadeLo = fLoOn_ ? std::max(10.f, lo / 1.41421356f) : 0.f;
    const float fadeHi =
      fHiOn_ ? std::min(nyquist, hi * 1.41421356f) : nyquist;
    for (int k = 0; k <= half; ++k)
    {
      const float f =
        (static_cast<float>(k) / static_cast<float>(half)) * nyquist;
      float w = 0.f;
      if (f >= fadeLo && f <= fadeHi)
      {
        if (f >= lo && f <= hi)
          w = 1.f;
        else if (fLoOn_ && f < lo)
        {
          const float t = (f - fadeLo) / std::max(1.0e-6f, lo - fadeLo);
          w = 0.5f - 0.5f * std::cos(static_cast<float>(M_PI) * std::clamp(t, 0.f, 1.f));
        }
        else if (fHiOn_ && f > hi)
        {
          const float t = (fadeHi - f) / std::max(1.0e-6f, fadeHi - hi);
          w = 0.5f - 0.5f * std::cos(static_cast<float>(M_PI) * std::clamp(t, 0.f, 1.f));
        }
        else
          w = 1.f;
      }
      bandW_[static_cast<size_t>(k)] = w;
    }
  }

  /** Resample a stored profile onto the current FFT grid into dst (half+1). */
  void copyProfileTo(std::vector<float>& dst, int slot) const
  {
    const int half = fftSize_ / 2 + 1;
    if (static_cast<int>(dst.size()) < half)
      dst.assign(static_cast<size_t>(half), 0.f);
    fillProfilePower(dst.data(), slot);
  }

  void fillProfilePower(float* dst, int slot) const
  {
    const int half = fftSize_ / 2 + 1;
    std::fill(dst, dst + half, 0.f);
    if (slot < 0 || slot >= kNumProfiles || !profiles_[slot].valid)
      return;
    const Profile& p = profiles_[slot];
    const int srcHalf = p.fftSize / 2 + 1;
    if (p.fftSize == fftSize_)
    {
      std::memcpy(dst, p.power.data(), sizeof(float) * static_cast<size_t>(half));
      return;
    }
    // Unnormalized FFT: |X| ∝ N. Resample in power, then scale so
    // mag * (2/N_dst) matches mag * (2/N_src) — otherwise Quality changes
    // shift the displayed / Wiener profile by 20*log10(N_src/N_dst) dB.
    const float s =
      static_cast<float>(fftSize_) / static_cast<float>(std::max(4, p.fftSize));
    const float pScale = s * s;
    for (int k = 0; k < half; ++k)
    {
      const float t = static_cast<float>(k) / static_cast<float>(half - 1);
      const float srcPos = t * static_cast<float>(srcHalf - 1);
      const int i0 = static_cast<int>(srcPos);
      const int i1 = std::min(i0 + 1, srcHalf - 1);
      const float frac = srcPos - static_cast<float>(i0);
      dst[k] = pScale
               * ((1.f - frac) * p.power[static_cast<size_t>(i0)]
                  + frac * p.power[static_cast<size_t>(i1)]);
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
    return std::clamp(db, kFloorDb, kSpecCeilDb);
  }

  float nextPhase()
  {
    rng_ = rng_ * 1664525u + 1013904223u;
    const float u = static_cast<float>((rng_ >> 8) & 0x00FFFFFFu)
                    * (1.f / 16777216.f);
    return u * static_cast<float>(2.0 * M_PI);
  }

  void processHop()
  {
    const int n = fftSize_;
    const int hop = hopSize_;
    const int half = n / 2;
    const float norm = 2.f / static_cast<float>(n);

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

    for (int k = 0; k <= half; ++k)
    {
      const float mL = fftBinMag(reL_.data(), imL_.data(), k);
      const float mR = fftBinMag(reR_.data(), imR_.data(), k);
      // Mid power for learn / Wiener (linked stereo).
      const float mid = 0.5f * (mL + mR);
      px_[static_cast<size_t>(k)] = mid * mid;
    }

    updateDisplaySpectrum(norm);

    if (learning_)
    {
      for (int k = 0; k <= half; ++k)
        learnSum_[static_cast<size_t>(k)] += px_[static_cast<size_t>(k)];
      ++learnHops_;
      learnAccum_ += static_cast<double>(hop) / sampleRate_;
      // Finalize only via stopLearn() — Learn stays engaged until the UI releases.
    }

    // Morph active Pn toward the target profile.
    if (morphing_)
    {
      morphT_ = std::min(1.f, morphT_ + morphStep_);
      const float t = morphT_;
      for (int k = 0; k <= half; ++k)
      {
        pnActive_[static_cast<size_t>(k)] =
          (1.f - t) * pnFrom_[static_cast<size_t>(k)]
          + t * pnTo_[static_cast<size_t>(k)];
      }
      if (morphT_ >= 1.f)
        morphing_ = false;
    }

    updateDisplayProfile(norm);

    const bool profListen =
      listenSlot_ >= 0 && listenSlot_ < kNumProfiles
      && profiles_[listenSlot_].valid;

    if (profListen)
    {
      // Random-phase noise from the listened profile's Pn.
      copyProfileTo(scratchPn_, listenSlot_);
      reL_[0] = std::sqrt(std::max(0.f, scratchPn_[0]));
      imL_[0] = 0.f;
      reR_[0] = reL_[0];
      imR_[0] = 0.f;
      for (int k = 1; k < half; ++k)
      {
        const float mag =
          std::sqrt(std::max(0.f, scratchPn_[static_cast<size_t>(k)]));
        const float ph = nextPhase();
        const float c = std::cos(ph);
        const float s = std::sin(ph);
        reL_[static_cast<size_t>(k)] = mag * c;
        imL_[static_cast<size_t>(k)] = mag * s;
        reR_[static_cast<size_t>(k)] = mag * c;
        imR_[static_cast<size_t>(k)] = mag * s;
        const int mk = n - k;
        reL_[static_cast<size_t>(mk)] = mag * c;
        imL_[static_cast<size_t>(mk)] = -mag * s;
        reR_[static_cast<size_t>(mk)] = mag * c;
        imR_[static_cast<size_t>(mk)] = -mag * s;
      }
      {
        const float mag =
          std::sqrt(std::max(0.f, scratchPn_[static_cast<size_t>(half)]));
        reL_[static_cast<size_t>(half)] = mag;
        imL_[static_cast<size_t>(half)] = 0.f;
        reR_[static_cast<size_t>(half)] = mag;
        imR_[static_cast<size_t>(half)] = 0.f;
      }
      std::fill(gain_.begin(), gain_.begin() + half + 1, 0.f);
    }
    else
    {
      const bool denoise =
        !bypassActive_ && amount_ > 1.0e-6f
        && (profiles_[targetSlot_].valid || morphing_
            || pnActive_[1] > kEps);

      for (int k = 0; k <= half; ++k)
      {
        float g = 1.f;
        if (denoise)
        {
          const float pn = pnActive_[static_cast<size_t>(k)];
          const float px = px_[static_cast<size_t>(k)];
          const float xi = std::max(px - pn, 0.f) / (pn + kEps);
          g = xi / (1.f + xi);
          g = std::max(g, floorLin_);
          const float bw = bandW_[static_cast<size_t>(k)];
          g = 1.f - amount_ * bw * (1.f - g);
        }
        gain_[static_cast<size_t>(k)] = std::clamp(g, 0.f, 1.f);
      }

      // Apply linked gain; keep Hermitian.
      {
        const float g0 = gain_[0];
        reL_[0] *= g0;
        reR_[0] *= g0;
      }
      for (int k = 1; k < half; ++k)
      {
        const float gLin = gain_[static_cast<size_t>(k)];
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
        const float gN = gain_[static_cast<size_t>(half)];
        reL_[static_cast<size_t>(half)] *= gN;
        reR_[static_cast<size_t>(half)] *= gN;
      }
    }

    ifftRadix2(reL_.data(), imL_.data(), n);
    ifftRadix2(reR_.data(), imR_.data(), n);

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
    std::memmove(olaL_.data(), olaL_.data() + hop,
                 sizeof(float) * static_cast<size_t>(keep));
    std::memmove(olaR_.data(), olaR_.data() + hop,
                 sizeof(float) * static_cast<size_t>(keep));
    std::fill(olaL_.begin() + keep, olaL_.begin() + n, 0.f);
    std::fill(olaR_.begin() + keep, olaR_.begin() + n, 0.f);

    updateDisplayGr();
  }

  void updateDisplaySpectrum(float norm)
  {
    const float alpha = emaSpec_;
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
      const float dL = magToDb(peakL, norm);
      const float dR = magToDb(peakR, norm);
      const float dA = 0.5f * (dL + dR);
      lDb_[static_cast<size_t>(i)] += alpha * (dL - lDb_[static_cast<size_t>(i)]);
      rDb_[static_cast<size_t>(i)] += alpha * (dR - rDb_[static_cast<size_t>(i)]);
      avgDb_[static_cast<size_t>(i)] += alpha * (dA - avgDb_[static_cast<size_t>(i)]);
      maxDb_[static_cast<size_t>(i)] =
        std::max(maxDb_[static_cast<size_t>(i)] - 0.05f, dA);
    }
  }

  void updateDisplayProfile(float norm)
  {
    for (int i = 0; i < bins_; ++i)
    {
      if (!binValid_[static_cast<size_t>(i)])
      {
        profDisp_[static_cast<size_t>(i)] = kFloorDb;
        continue;
      }
      const int lo = binLo_[static_cast<size_t>(i)];
      const int hi = binHi_[static_cast<size_t>(i)];
      double sum = 0.0;
      int count = 0;
      for (int k = lo; k < hi; ++k)
      {
        sum += static_cast<double>(std::max(0.f, pnActive_[static_cast<size_t>(k)]));
        ++count;
      }
      const float mean = count > 0 ? static_cast<float>(sum / count) : 0.f;
      // |X| = sqrt(mean power); same amplitude norm as spectrum.
      profDisp_[static_cast<size_t>(i)] = magToDb(std::sqrt(mean), norm);
    }
  }

  void updateDisplayGr()
  {
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
      float peakPx = px_[static_cast<size_t>(lo)];
      for (int k = lo + 1; k < hi; ++k)
      {
        const float m = px_[static_cast<size_t>(k)];
        if (m > peakPx)
        {
          peakPx = m;
          peakK = k;
        }
      }
      const float g = gain_[static_cast<size_t>(peakK)];
      grDisp_[static_cast<size_t>(i)] =
        (g > 1.0e-12f) ? std::min(0.f, linToDb(g)) : kFloorDb;
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
  int profileUiBins_ = 0;
  bool bypassActive_ = false;

  float fLoHz_ = 20.f;
  float fHiHz_ = 160.f;
  bool fLoOn_ = true;
  bool fHiOn_ = true;
  float amount_ = 1.f;
  float floorDb_ = -20.f;
  float floorLin_ = 0.1f; // dbToLin(-20)
  float blendMs_ = 250.f;
  float morphStep_ = 0.01f;
  float morphT_ = 1.f;
  bool morphing_ = false;
  int targetSlot_ = 0;
  int listenSlot_ = -1;

  bool learning_ = false;
  int learnSlot_ = 0;
  int learnHops_ = 0;
  double learnAccum_ = 0.0;

  float emaSpec_ = 0.2f;
  float colaNorm_ = 0.5f;
  uint32_t rng_ = 0xC0FFEEu;

  std::atomic<int> pendingFft_ {2048};
  std::atomic<int> pendingBins_ {128};
  std::atomic<int> pendingProfileUiBins_ {0};
  std::atomic<bool> profilesDirty_ {false};

  Profile profiles_[kNumProfiles];

  std::vector<float> inL_, inR_, olaL_, olaR_, dryL_, dryR_, outL_, outR_, window_;
  std::vector<float> reL_, imL_, reR_, imR_;
  std::vector<float> px_, pnActive_, pnFrom_, pnTo_, gain_, bandW_, learnSum_,
    scratchPn_;
  std::vector<float> avgDb_, maxDb_, lDb_, rDb_, grDisp_, profDisp_;
  std::vector<float> pubAvg_, pubMax_, pubL_, pubR_, pubGr_, pubProf_;
  std::vector<int> binLo_, binHi_, binValid_;
  std::vector<int> profileUiLo_, profileUiHi_, profileUiValid_;
  std::mutex mutex_;
};

} // namespace Dsp
} // namespace calfNXT
