#pragma once

// Spectral noise reduction (Denoiser): STFT Wiener denoise with 3 learnable
// noise-power profiles, pass-filter band mask, and profile morph on automation.
//
// Reconstruction: sqrt-Hann analysis/synthesis, hop = N/4, shift-OLA.
// Latency = N (full FFT length; wet FIFO prefilled).
// Buffers preallocated to kMaxFft (no RT heap).
//
// Learn: average mid |X|^2 while Learn is engaged; finalize on stop.
// Mono (header toggle, or no right buffer): left input only, one analysis
// FFT and one IFFT, same result on both outputs. Stereo stays linked —
// one gain, two transforms. The toggle is manual; the host channel count
// is not trusted to mean the source is mono.
//         Re-Learn on a valid slot continues the average (dazulernen)
//         only when that fingerprint's FFT size still matches;
//         a Quality change makes the next capture start fresh.
//         Clear first for a fresh fingerprint at the same size.
// Profile listen: random-phase noise from that slot's Pn (latency-matched).
// Diff listen: delayed dry − wet.
//
// Gain: Wiener on a stretched excess, then max(G, floor). Span moves the
// −6 dB point out to Span dB above the floor the law uses. Offset raises
// that floor by a constant dB (Pn × 10^(Offset/10)) before the ratio, so
// both the full-cut line and the −6 dB line sit higher together.
// Detect Peak uses this hop's bin power. RMS follows that power with a
// fixed ~40 ms average before the ratio. Octave (0…1) is a raised-cosine
// max on the octave axis: a neighbour counts as power × weight, the bin
// itself stays at full weight, and the weight is 0 at ± the knob value.
// Band limit is the chart's 24 dB/oct HP+LP magnitude. The cut in dB is
// scaled by that drop: full at 0 dB, gone where the curve hits −96 dB.
// Each edge is a slope plain 0…4 (off / 12 / 24 / 36 / 48 dB/oct).
// Floor is stored as min gain in dB (−60…0); applied as linear 10^(dB/20).
//
// Viz: SpectrumTap layout + GR response [N, L×N, R×N] + active-profile
// spectrum (same layout, avg = profile dB).

#include "biquad.h"
#include "dsp_math.h"
#include "fft_r2.h"
#include "gain_util.h"
#include "spectrum_display_map.h"

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
  /** Chart axis floor (`DENOISER_DB_MIN`). Band mask is 0 where the filters hit it. */
  static constexpr float kBandChartDb = -96.f;
  static constexpr float kFloorDb = -120.f;
  static constexpr float kSpecCeilDb = 0.f;
  static constexpr float kEps = 1.0e-20f;
  /** Log-frequency cells per octave for the opening window. */
  static constexpr int kOctCellsPerOct = 32;
  /** log2(4096) * 32 + a few. Preallocated so the audio thread never grows it. */
  static constexpr int kOctCellCap = 400;
  /** RMS detector time constant (seconds). Not a parameter. */
  static constexpr double kRmsTauSec = 0.04;

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
    fadeLen_ = std::clamp(static_cast<int>(sampleRate_ * 0.005), 32, 512);
    bandDirty_ = true;
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
   * Thumbnails share the main spectrum's display slots.
   * A second map sized to the card width turned the same profile into a
   * handful of steps. The noise law does not read this.
   */
  void configureProfileUiBins(int /*bins*/) {}

  void setParams(float fLoHz, float fHiHz, float amount, float floorDb,
                 float blendMs, int loSlope = 2, int hiSlope = 2,
                 float spanDb = 12.f, float offsetDb = 0.f,
                 bool rms = false, float octave = 0.f)
  {
    if (fLoHz > fHiHz)
      std::swap(fLoHz, fHiHz);
    const float loHz = std::clamp(fLoHz, 20.f, 20000.f);
    const float hiHz = std::clamp(fHiHz, 20.f, 20000.f);
    // 0 off, 1…4 = that many RBJ stages (12 dB/oct each).
    const int loS = std::clamp(loSlope, 0, 4);
    const int hiS = std::clamp(hiSlope, 0, 4);
    const float blend = std::clamp(blendMs, 10.f, 5000.f);
    const bool bandChanged = bandDirty_ || loHz != fLoHz_ || hiHz != fHiHz_
                             || loS != loSlope_ || hiS != hiSlope_;
    const bool timeChanged = blend != blendMs_;
    fLoHz_ = loHz;
    fHiHz_ = hiHz;
    loSlope_ = loS;
    hiSlope_ = hiS;
    amount_ = std::clamp(amount, 0.f, 1.f);
    floorDb_ = std::clamp(floorDb, -60.f, 0.f);
    floorLin_ = dbToLin(floorDb_);
    // 3 dB = unstretched Wiener (+3 dB over the raised floor → −6 dB gain).
    spanDb_ = std::clamp(spanDb, 3.f, 24.f);
    // Constant lift of every noise-power bin. 0 dB leaves Pn untouched.
    offsetDb_ = std::clamp(offsetDb, 0.f, 24.f);
    offsetLin_ = std::pow(10.f, offsetDb_ * 0.1f);
    // Entering RMS snaps the average to this hop so a zero state cannot
    // hold the filter shut for a whole time constant.
    if (rms && !rms_)
      rmsWarm_ = false;
    rms_ = rms;
    octave_ = std::clamp(octave, 0.f, 1.f);
    blendMs_ = blend;
    if (timeChanged)
      updateTimeCoeffs();
    if (bandChanged)
    {
      rebuildBandWeights();
      bandDirty_ = false;
    }
  }

  /** Editor open. Profile curves refresh once; the live spectrum follows hops. */
  void setVizActive(bool on)
  {
    if (on && !vizActive_)
      displayDirty_.store(true, std::memory_order_relaxed);
    vizActive_ = on;
  }

  /**
   * Host silenceFlags: buffers are not written. Flush the overlap once,
   * then only advance the delay rings.
   */
  void drainSilence(int n)
  {
    if (n <= 0)
      return;
    maybeRefreshProfiles();
    const bool idle = skipLatched_ && !learning_ && !morphing_
                      && listenSlot_ < 0 && quietRun_ >= fftSize_ * 2;
    if (idle)
    {
      advanceQuiet(n);
      return;
    }
    float zeros[64];
    std::fill(zeros, zeros + 64, 0.f);
    while (n > 0)
    {
      const int chunk = std::min(n, 64);
      process(zeros, mono_ ? nullptr : zeros, chunk, bypassActive_, false, mono_);
      n -= chunk;
      if (skipLatched_ && !learning_ && !morphing_ && listenSlot_ < 0)
        break;
    }
    if (n > 0)
      advanceQuiet(n);
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
    displayDirty_.store(true, std::memory_order_relaxed);
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
    displayDirty_.store(true, std::memory_order_relaxed);
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

  /** FFT length the fingerprint was learned at, or 0 if the slot is empty. */
  int profileFftSize(int slot) const
  {
    if (!profileValid(slot))
      return 0;
    return profiles_[slot].fftSize;
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
    displayDirty_.store(true, std::memory_order_relaxed);
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
    quietRun_ = 0;
    resumeSamples_ = 0;
    enterFade_ = 0;
    skipLatched_ = false;
    rmsWarm_ = false;
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
   *
   * Bypass and a long digital silence keep the latency delay and skip hops.
   * Coming back runs hops again and fades from that delay onto the new wet
   * path, so the overlap-add can refill before it is all the listener hears.
   */
  void process(float* left, float* right, int n, bool bypass, bool diffListen,
               bool mono)
  {
    if (!left || n <= 0)
      return;
    applyPendingSizes();
    maybeRefreshProfiles();

    bypassActive_ = bypass;
    // Manual Mono uses the left input even when the host still offers a
    // right buffer. A missing right buffer is mono either way.
    mono_ = mono || (right == nullptr);
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
    const int quietHold = nFft * 2;
    const int resumeLen = nFft * 2;

    for (int i = 0; i < n; ++i)
    {
      float inL = left[i];
      float inR = 0.f;
      if (!mono_)
        inR = nChR ? right[i] : inL;
      sanitizeDenormal(inL);
      sanitizeDenormal(inR);

      const float inAbs = std::max(std::fabs(inL), std::fabs(inR));
      if (inAbs < 1.0e-7f)
        quietRun_ = std::min(quietRun_ + 1, quietHold + nFft);
      else
        quietRun_ = 0;

      dryL_[static_cast<size_t>(dryWrite_)] = inL;
      if (!mono_)
        dryR_[static_cast<size_t>(dryWrite_)] = inR;
      const int dryRead = (dryWrite_ - lat) & dryMask;
      const float dryOutL = dryL_[static_cast<size_t>(dryRead)];
      const float dryOutR = dryR_[static_cast<size_t>(dryRead)];
      dryWrite_ = (dryWrite_ + 1) & dryMask;

      inL_[static_cast<size_t>(writePos_)] = inL;
      if (!mono_)
        inR_[static_cast<size_t>(writePos_)] = inR;
      writePos_ = (writePos_ + 1) % nFft;

      if (profListen || diffListen || learning_ || morphing_)
        resumeSamples_ = 0;

      const bool skipHop =
        !profListen && !diffListen && !learning_ && !morphing_
        && resumeSamples_ <= 0
        && (bypass || quietRun_ >= quietHold);

      if (skipHop)
      {
        if (!skipLatched_)
        {
          skipLatched_ = true;
          enterFade_ = fadeLen_;
        }
      }
      else if (skipLatched_)
      {
        skipLatched_ = false;
        enterFade_ = 0;
        if (filled_ >= nFft)
          resumeSamples_ = resumeLen;
      }

      bool fireHop = false;
      if (filled_ < nFft)
      {
        ++filled_;
        if (filled_ == nFft)
          fireHop = true;
      }
      else if (++hopCount_ >= hop)
      {
        hopCount_ = 0;
        fireHop = true;
      }
      // The input ring still fills while hops are skipped, so resume
      // does not wait out another full FFT of silence.
      if (fireHop && !skipHop)
        processHop();

      float outL = dryOutL;
      float outR = dryOutR;
      if (skipHop)
      {
        // Keep the latency gap: replace the oldest queued wet sample with dry.
        const float droppedL = outL_[static_cast<size_t>(outRead_)];
        const float droppedR = outR_[static_cast<size_t>(outRead_)];
        outL_[static_cast<size_t>(outWrite_)] = dryOutL;
        outR_[static_cast<size_t>(outWrite_)] =
          mono_ ? dryOutL : dryOutR;
        outWrite_ = (outWrite_ + 1) & outMask;
        outRead_ = (outRead_ + 1) & outMask;
        if (enterFade_ > 0)
        {
          const float t =
            1.f - static_cast<float>(enterFade_) / static_cast<float>(std::max(1, fadeLen_));
          outL = droppedL * (1.f - t) + dryOutL * t;
          outR = droppedR * (1.f - t) + dryOutR * t;
          --enterFade_;
        }
      }
      else
      {
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
        if (resumeSamples_ > 0)
        {
          const float t = 1.f
            - static_cast<float>(resumeSamples_) / static_cast<float>(resumeLen);
          outL = dryOutL * (1.f - t) + wetL * t;
          outR = dryOutR * (1.f - t) + wetR * t;
          --resumeSamples_;
        }
        else if (diffListen)
        {
          outL = dryOutL - wetL;
          outR = dryOutR - wetR;
        }
        else
        {
          outL = wetL;
          outR = wetR;
        }
      }
      left[i] = outL;
      if (nChR)
        right[i] = mono_ ? outL : outR;
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
    const int need = 2 + 5 * n;
    if (maxOut < need || static_cast<int>(pubT_.size()) < n)
      return 0;
    out[0] = static_cast<float>(n);
    out[1] = 0.f;
    std::memcpy(out + 2, pubAvg_.data(), sizeof(float) * static_cast<size_t>(n));
    std::memcpy(out + 2 + n, pubMax_.data(), sizeof(float) * static_cast<size_t>(n));
    std::memcpy(out + 2 + 2 * n, pubL_.data(), sizeof(float) * static_cast<size_t>(n));
    std::memcpy(out + 2 + 3 * n, pubR_.data(), sizeof(float) * static_cast<size_t>(n));
    std::memcpy(out + 2 + 4 * n, pubT_.data(), sizeof(float) * static_cast<size_t>(n));
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
    const int need = 2 + 5 * n;
    if (maxOut < need || static_cast<int>(pubT_.size()) < n)
      return 0;
    out[0] = static_cast<float>(n);
    out[1] = 0.f;
    std::memcpy(out + 2, pubProf_.data(), sizeof(float) * static_cast<size_t>(n));
    std::memcpy(out + 2 + n, pubProf_.data(), sizeof(float) * static_cast<size_t>(n));
    std::memcpy(out + 2 + 2 * n, pubProf_.data(),
                sizeof(float) * static_cast<size_t>(n));
    std::memcpy(out + 2 + 3 * n, pubProf_.data(),
                sizeof(float) * static_cast<size_t>(n));
    std::memcpy(out + 2 + 4 * n, pubT_.data(), sizeof(float) * static_cast<size_t>(n));
    return need;
  }

  /**
   * One learned fingerprint as a spectrum snapshot (same layout as
   * takeActiveProfileSpectrum). Slot is 0…2. Returns 0 when that slot has
   * no fingerprint and is not currently learning.
   */
  int takeProfileSlotSpectrum(int slot, float* out, int maxOut)
  {
    if (!out || maxOut < 2 || slot < 0 || slot >= kNumProfiles)
      return 0;
    std::lock_guard<std::mutex> lock(mutex_);
    if (!pubSlotShown_[slot])
      return -1;
    const int n = bins_;
    if (n < 1 || pubSlotProf_[slot].size() != static_cast<size_t>(n))
      return 0;
    const int need = 2 + 5 * n;
    if (maxOut < need || static_cast<int>(pubT_.size()) < n)
      return 0;
    out[0] = static_cast<float>(n);
    out[1] = 0.f;
    std::memcpy(out + 2, pubSlotProf_[slot].data(), sizeof(float) * static_cast<size_t>(n));
    std::memcpy(out + 2 + n, pubSlotProf_[slot].data(),
                sizeof(float) * static_cast<size_t>(n));
    std::memcpy(out + 2 + 2 * n, pubSlotProf_[slot].data(),
                sizeof(float) * static_cast<size_t>(n));
    std::memcpy(out + 2 + 3 * n, pubSlotProf_[slot].data(),
                sizeof(float) * static_cast<size_t>(n));
    std::memcpy(out + 2 + 4 * n, pubT_.data(), sizeof(float) * static_cast<size_t>(n));
    return need;
  }

  /**
   * Display-slot dB curve for one stored profile (UI mini charts / IR JSON).
   * Same slots as the main profile overlay. Mean power per slot (not peak)
   * so a wide HF group does not turn the FFT noise floor into a ceiling of
   * spikes. Slot centers are `copyProfileUiT`.
   */
  int fillSlotProfileDb(int slot, float* outDb, int maxBins) const
  {
    if (!outDb || maxBins < 1 || slot < 0 || slot >= kNumProfiles)
      return 0;
    const int nBins = bins_;
    const std::vector<int>& binLo = binLo_;
    const std::vector<int>& binHi = binHi_;
    const std::vector<int>& binValid = binValid_;
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

  /** Bin count of the profile-thumbnail series (the main display map). */
  int profileUiBinCount() const
  {
    return bins_;
  }

  /** Log-fraction centers for the thumbnail slots. Same `t` as the overlay. */
  int copyProfileUiT(float* out, int maxBins) const
  {
    if (!out || maxBins < 1)
      return 0;
    const int n = std::min(bins_, maxBins);
    if (n < 1 || static_cast<int>(slotT_.size()) < n)
      return 0;
    std::memcpy(out, slotT_.data(), sizeof(float) * static_cast<size_t>(n));
    return n;
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
    copyEq(pubT_, slotT_);
    for (int s = 0; s < kNumProfiles; ++s)
    {
      pubSlotShown_[s] = slotShown_[s];
      auto& dst = pubSlotProf_[s];
      const auto& src = slotProf_[s];
      if (src.empty())
        continue;
      if (dst.size() != src.size())
        dst = src;
      else
        std::memcpy(dst.data(), src.data(), src.size() * sizeof(float));
    }
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
    pxDet_.assign(half, 0.f);
    pxOpen_.assign(half, 0.f);
    binCell_.assign(half, -1);
    cellPx_.assign(static_cast<size_t>(kOctCellCap), 0.f);
    cellOpen_.assign(static_cast<size_t>(kOctCellCap), 0.f);
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
      rebuildOctaveMap();
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
    displayDirty_.store(true, std::memory_order_relaxed);
    }
    const int wantBins = pendingBins_.load(std::memory_order_relaxed);
    if (wantBins != displayWidth_ || avgDb_.size() != static_cast<size_t>(bins_))
      applyBins(wantBins);
    const int wantUi = pendingProfileUiBins_.load(std::memory_order_relaxed);
    if (wantUi >= kMinBins && wantUi != profileUiWidth_)
      applyProfileUiBins(wantUi);
  }

  void applyBins(int width)
  {
    width = std::clamp(width, kMinBins, kMaxBins);
    pendingBins_.store(width, std::memory_order_relaxed);
    if (width == displayWidth_
        && bins_ >= 2
        && static_cast<int>(avgDb_.size()) == bins_
        && static_cast<int>(slotT_.size()) == bins_)
      return;
    displayWidth_ = width;
    rebuildBinMap();
  }

  void applyProfileUiBins(int width)
  {
    width = std::clamp(width, kMinBins, kMaxBins);
    pendingProfileUiBins_.store(width, std::memory_order_relaxed);
    if (width == profileUiWidth_
        && profileUiBins_ >= 2
        && static_cast<int>(profileUiT_.size()) == profileUiBins_)
      return;
    profileUiWidth_ = width;
    rebuildProfileUiMap();
    profilesDirty_.store(true, std::memory_order_relaxed);
    displayDirty_.store(true, std::memory_order_relaxed);
  }

  void rebuildProfileUiMap()
  {
    if (profileUiWidth_ < kMinBins || fftSize_ < 4)
      return;
    std::vector<int> lo;
    std::vector<int> hi;
    std::vector<float> pos;
    const int n = buildSpectrumDisplayMap(sampleRate_, fftSize_, profileUiWidth_,
                                          lo, hi, pos);
    if (n < 2)
      return;
    profileUiLo_ = std::move(lo);
    profileUiHi_ = std::move(hi);
    profileUiT_ = std::move(pos);
    profileUiBins_ = n;
    profileUiValid_.assign(static_cast<size_t>(n), 1);
  }

  void rebuildBinMap()
  {
    if (fftSize_ >= 4)
    {
      std::vector<int> lo;
      std::vector<int> hi;
      std::vector<float> pos;
      const int n = buildSpectrumDisplayMap(sampleRate_, fftSize_, displayWidth_,
                                            lo, hi, pos);
      if (n >= 2)
      {
        binLo_ = std::move(lo);
        binHi_ = std::move(hi);
        slotT_ = std::move(pos);
        binValid_.assign(static_cast<size_t>(n), 1);
        if (n != bins_ || static_cast<int>(avgDb_.size()) != n
            || static_cast<int>(pubT_.size()) != n)
        {
          bins_ = n;
          const auto nn = static_cast<size_t>(n);
          avgDb_.assign(nn, kFloorDb);
          maxDb_.assign(nn, kFloorDb);
          lDb_.assign(nn, kFloorDb);
          rDb_.assign(nn, kFloorDb);
          grDisp_.assign(nn, 0.f);
          profDisp_.assign(nn, kFloorDb);
          {
            std::lock_guard<std::mutex> lock(mutex_);
            pubAvg_.assign(nn, kFloorDb);
            pubMax_.assign(nn, kFloorDb);
            pubL_.assign(nn, kFloorDb);
            pubR_.assign(nn, kFloorDb);
            pubGr_.assign(nn, 0.f);
            pubProf_.assign(nn, kFloorDb);
            pubT_.assign(nn, 0.f);
          }
        }
        if (profiles_[0].valid || profiles_[1].valid || profiles_[2].valid)
          profilesDirty_.store(true, std::memory_order_relaxed);
    displayDirty_.store(true, std::memory_order_relaxed);
      }
    }
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
    rmsA_ = static_cast<float>(1.0 - std::exp(-1.0 / (kRmsTauSec * hopsPerSec)));
    morphStep_ =
      static_cast<float>(1.0 / std::max(1.0, (blendMs_ * 0.001) * hopsPerSec));
  }

  /**
   * Band mask from the same HP/LP cascade the chart draws (Q = 0.707,
   * one RBJ stage per 12 dB/oct). 1 in the passband, 0 where the summed
   * magnitude hits the chart floor. Slope 0 adds nothing.
   */
  void rebuildBandWeights()
  {
    if (fftSize_ < 4 || !(sampleRate_ > 0.0))
      return;
    const int half = fftSize_ / 2;
    const float nyquist = static_cast<float>(sampleRate_ * 0.5);
    const float sr = static_cast<float>(sampleRate_);
    BiquadCoeffs hp;
    BiquadCoeffs lp;
    if (loSlope_ > 0)
      hp.setHpRbj(fLoHz_, 0.707f, sr, 1.f);
    if (hiSlope_ > 0)
      lp.setLpRbj(fHiHz_, 0.707f, sr, 1.f);

    const float span = -kBandChartDb;
    for (int k = 0; k <= half; ++k)
    {
      const float hz =
        (static_cast<float>(k) / static_cast<float>(half)) * nyquist;
      float db = 0.f;
      if (loSlope_ > 0)
        db += static_cast<float>(loSlope_) * hp.responseDb(hz, sr);
      if (hiSlope_ > 0)
        db += static_cast<float>(hiSlope_) * lp.responseDb(hz, sr);
      if (!std::isfinite(db))
        db = -240.f;
      const float mask = std::clamp((db - kBandChartDb) / span, 0.f, 1.f);
      bandW_[static_cast<size_t>(k)] = mask;
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

  /** Bin index → octave cell. Distance between bins k and j is |log2(j/k)|. */
  void rebuildOctaveMap()
  {
    const int half = fftSize_ / 2;
    octCells_ = 0;
    if (half < 2)
      return;
    const float cells = static_cast<float>(kOctCellsPerOct);
    octCells_ = static_cast<int>(
                  std::ceil(std::log2(static_cast<float>(half)) * cells))
                + 1;
    if (octCells_ > kOctCellCap)
      octCells_ = kOctCellCap;
    binCell_[0] = -1;
    for (int k = 1; k <= half; ++k)
    {
      const int c = static_cast<int>(
        std::lround(std::log2(static_cast<float>(k)) * cells));
      binCell_[static_cast<size_t>(k)] = std::clamp(c, 0, octCells_ - 1);
    }
  }

  /** EMA of hop power. Peak leaves px_ untouched. */
  void followDetectorPower()
  {
    const int n = fftSize_ / 2 + 1;
    if (!rmsWarm_)
    {
      std::memcpy(pxDet_.data(), px_.data(),
                  sizeof(float) * static_cast<size_t>(n));
      rmsWarm_ = true;
      return;
    }
    const float a = rmsA_;
    for (int k = 0; k < n; ++k)
    {
      float& d = pxDet_[static_cast<size_t>(k)];
      d += a * (px_[static_cast<size_t>(k)] - d);
    }
  }

  /**
   * Raised-cosine max on the octave axis. Weight is 1 on the bin's own
   * cell and 0 at ±octave_. A neighbour can only raise the detector.
   */
  void widenOpening(const float* src)
  {
    const int half = fftSize_ / 2;
    const int n = half + 1;
    const float width = octave_;
    if (!(width > 1.0e-4f) || octCells_ < 2)
    {
      std::memcpy(pxOpen_.data(), src, sizeof(float) * static_cast<size_t>(n));
      return;
    }
    std::fill(cellPx_.begin(), cellPx_.begin() + octCells_, 0.f);
    for (int k = 1; k <= half; ++k)
    {
      const int c = binCell_[static_cast<size_t>(k)];
      if (c < 0 || c >= octCells_)
        continue;
      float& cell = cellPx_[static_cast<size_t>(c)];
      const float p = src[k];
      if (p > cell)
        cell = p;
    }
    const float cells = static_cast<float>(kOctCellsPerOct);
    const int rad = std::max(
      1, static_cast<int>(std::ceil(width * cells)));
    for (int c = 0; c < octCells_; ++c)
    {
      float best = cellPx_[static_cast<size_t>(c)];
      for (int d = 1; d <= rad; ++d)
      {
        const float oct = static_cast<float>(d) / cells;
        if (oct >= width)
          break;
        const float w =
          0.5f * (1.f + std::cos(static_cast<float>(M_PI) * oct / width));
        if (w <= 0.f)
          continue;
        if (c - d >= 0)
          best = std::max(best, cellPx_[static_cast<size_t>(c - d)] * w);
        if (c + d < octCells_)
          best = std::max(best, cellPx_[static_cast<size_t>(c + d)] * w);
      }
      cellOpen_[static_cast<size_t>(c)] = best;
    }
    pxOpen_[0] = src[0];
    for (int k = 1; k <= half; ++k)
    {
      const int c = binCell_[static_cast<size_t>(k)];
      float p = src[k];
      if (c >= 0 && c < octCells_)
        p = std::max(p, cellOpen_[static_cast<size_t>(c)]);
      pxOpen_[static_cast<size_t>(k)] = p;
    }
  }

  void processHop()
  {
    const int n = fftSize_;
    const int hop = hopSize_;
    const int half = n / 2;
    const float norm = 2.f / static_cast<float>(n);

    const int start = writePos_;
    const bool mono = mono_;
    for (int i = 0; i < n; ++i)
    {
      const int idx = (start + i) % n;
      const float w = window_[static_cast<size_t>(i)];
      reL_[static_cast<size_t>(i)] = inL_[static_cast<size_t>(idx)] * w;
      imL_[static_cast<size_t>(i)] = 0.f;
      if (!mono)
      {
        reR_[static_cast<size_t>(i)] = inR_[static_cast<size_t>(idx)] * w;
        imR_[static_cast<size_t>(i)] = 0.f;
      }
    }

    fftRadix2(reL_.data(), imL_.data(), n);
    if (!mono)
      fftRadix2(reR_.data(), imR_.data(), n);

    for (int k = 0; k <= half; ++k)
    {
      const float mL = fftBinMag(reL_.data(), imL_.data(), k);
      // Mono: |X|^2 of the one channel. Stereo: linked mid power.
      float mag = mL;
      if (!mono)
        mag = 0.5f * (mL + fftBinMag(reR_.data(), imR_.data(), k));
      px_[static_cast<size_t>(k)] = mag * mag;
    }

    if (vizActive_)
      updateDisplaySpectrum(norm);

    if (learning_)
    {
      for (int k = 0; k <= half; ++k)
        learnSum_[static_cast<size_t>(k)] += px_[static_cast<size_t>(k)];
      ++learnHops_;
      learnAccum_ += static_cast<double>(hop) / sampleRate_;
      // Finalize only via stopLearn() — Learn stays engaged until the UI releases.
    }

    // Captured before the blend can finish on this hop.
    const bool showProfile = morphing_;
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

    const bool profListen =
      listenSlot_ >= 0 && listenSlot_ < kNumProfiles
      && profiles_[listenSlot_].valid;

    if (profListen)
    {
      // Random-phase noise from the listened profile's Pn.
      copyProfileTo(scratchPn_, listenSlot_);
      reL_[0] = std::sqrt(std::max(0.f, scratchPn_[0]));
      imL_[0] = 0.f;
      if (!mono)
      {
        reR_[0] = reL_[0];
        imR_[0] = 0.f;
      }
      for (int k = 1; k < half; ++k)
      {
        const float mag =
          std::sqrt(std::max(0.f, scratchPn_[static_cast<size_t>(k)]));
        const float ph = nextPhase();
        const float c = std::cos(ph);
        const float s = std::sin(ph);
        reL_[static_cast<size_t>(k)] = mag * c;
        imL_[static_cast<size_t>(k)] = mag * s;
        const int mk = n - k;
        reL_[static_cast<size_t>(mk)] = mag * c;
        imL_[static_cast<size_t>(mk)] = -mag * s;
        if (!mono)
        {
          reR_[static_cast<size_t>(k)] = mag * c;
          imR_[static_cast<size_t>(k)] = mag * s;
          reR_[static_cast<size_t>(mk)] = mag * c;
          imR_[static_cast<size_t>(mk)] = -mag * s;
        }
      }
      {
        const float mag =
          std::sqrt(std::max(0.f, scratchPn_[static_cast<size_t>(half)]));
        reL_[static_cast<size_t>(half)] = mag;
        imL_[static_cast<size_t>(half)] = 0.f;
        if (!mono)
        {
          reR_[static_cast<size_t>(half)] = mag;
          imR_[static_cast<size_t>(half)] = 0.f;
        }
      }
      std::fill(gain_.begin(), gain_.begin() + half + 1, 0.f);
    }
    else
    {
      const bool denoise =
        !bypassActive_ && amount_ > 1.0e-6f
        && (profiles_[targetSlot_].valid || morphing_
            || pnActive_[1] > kEps);
      // gamma = 1 keeps +3 dB over the raised floor at −6 dB.
      const float gamma = 3.f / spanDb_;
      const float* det = px_.data();
      if (rms_)
      {
        followDetectorPower();
        det = pxDet_.data();
      }
      if (octave_ > 1.0e-4f)
      {
        widenOpening(det);
        det = pxOpen_.data();
      }

      for (int k = 0; k <= half; ++k)
      {
        float g = 1.f;
        if (denoise)
        {
          const float pn = pnActive_[static_cast<size_t>(k)] * offsetLin_;
          const float px = det[static_cast<size_t>(k)];
          const float ratio = (px + kEps) / (pn + kEps);
          if (ratio > 1.f)
          {
            g = 1.f - std::pow(ratio, -gamma);
            if (g < 0.f)
              g = 0.f;
          }
          else
            g = 0.f;
          g = std::max(g, floorLin_);
          // Scale the cut in dB by the pass-filter mask, so GR rises toward
          // 0 dB along the same roll-off the chart draws downward.
          float grDb = (g > 1.0e-12f) ? std::min(0.f, linToDb(g)) : -240.f;
          grDb *= amount_ * bandW_[static_cast<size_t>(k)];
          g = dbToLin(grDb);
        }
        gain_[static_cast<size_t>(k)] = std::clamp(g, 0.f, 1.f);
      }

      // Apply linked gain; keep Hermitian. Mono skips the right spectrum.
      {
        const float g0 = gain_[0];
        reL_[0] *= g0;
        if (!mono)
          reR_[0] *= g0;
      }
      for (int k = 1; k < half; ++k)
      {
        const float gLin = gain_[static_cast<size_t>(k)];
        reL_[static_cast<size_t>(k)] *= gLin;
        imL_[static_cast<size_t>(k)] *= gLin;
        const int mk = n - k;
        reL_[static_cast<size_t>(mk)] *= gLin;
        imL_[static_cast<size_t>(mk)] *= gLin;
        if (!mono)
        {
          reR_[static_cast<size_t>(k)] *= gLin;
          imR_[static_cast<size_t>(k)] *= gLin;
          reR_[static_cast<size_t>(mk)] *= gLin;
          imR_[static_cast<size_t>(mk)] *= gLin;
        }
      }
      {
        const float gN = gain_[static_cast<size_t>(half)];
        reL_[static_cast<size_t>(half)] *= gN;
        if (!mono)
          reR_[static_cast<size_t>(half)] *= gN;
      }
    }

    ifftRadix2(reL_.data(), imL_.data(), n);
    if (!mono)
      ifftRadix2(reR_.data(), imR_.data(), n);

    for (int i = 0; i < n; ++i)
    {
      const float w = window_[static_cast<size_t>(i)];
      olaL_[static_cast<size_t>(i)] += reL_[static_cast<size_t>(i)] * w;
      if (!mono)
        olaR_[static_cast<size_t>(i)] += reR_[static_cast<size_t>(i)] * w;
    }

    const int outMask = outMask_;
    for (int i = 0; i < hop; ++i)
    {
      float oL = olaL_[static_cast<size_t>(i)] * colaNorm_;
      sanitizeDenormal(oL);
      outL_[static_cast<size_t>(outWrite_)] = oL;
      if (!mono)
      {
        float oR = olaR_[static_cast<size_t>(i)] * colaNorm_;
        sanitizeDenormal(oR);
        outR_[static_cast<size_t>(outWrite_)] = oR;
      }
      outWrite_ = (outWrite_ + 1) & outMask;
    }

    const int keep = n - hop;
    std::memmove(olaL_.data(), olaL_.data() + hop,
                 sizeof(float) * static_cast<size_t>(keep));
    std::fill(olaL_.begin() + keep, olaL_.begin() + n, 0.f);
    if (!mono)
    {
      std::memmove(olaR_.data(), olaR_.data() + hop,
                   sizeof(float) * static_cast<size_t>(keep));
      std::fill(olaR_.begin() + keep, olaR_.begin() + n, 0.f);
    }

    if (vizActive_)
    {
      const bool refresh = displayDirty_.load(std::memory_order_relaxed);
      if (refresh || showProfile || learning_)
      {
        if (refresh || showProfile)
          updateDisplayProfile(norm);
        if (refresh || learning_)
          updateProfileSlotSpectra(norm, refresh);
        if (!morphing_ && !learning_)
          displayDirty_.store(false, std::memory_order_relaxed);
      }
      updateDisplayGr();
    }
  }

  void maybeRefreshProfiles()
  {
    if (!vizActive_ || learning_ || morphing_)
      return;
    if (!displayDirty_.load(std::memory_order_relaxed))
      return;
    const float norm = 2.f / static_cast<float>(std::max(4, fftSize_));
    updateDisplayProfile(norm);
    updateProfileSlotSpectra(norm, true);
    displayDirty_.store(false, std::memory_order_relaxed);
  }

  /** Keep delay rings moving through a stretch of silence without a hop. */
  void advanceQuiet(int n)
  {
    const int nFft = std::max(4, fftSize_);
    const int dryMask = dryMask_;
    const bool mono = mono_;
    for (int i = 0; i < n; ++i)
    {
      dryL_[static_cast<size_t>(dryWrite_)] = 0.f;
      if (!mono)
        dryR_[static_cast<size_t>(dryWrite_)] = 0.f;
      dryWrite_ = (dryWrite_ + 1) & dryMask;
      inL_[static_cast<size_t>(writePos_)] = 0.f;
      if (!mono)
        inR_[static_cast<size_t>(writePos_)] = 0.f;
      writePos_ = (writePos_ + 1) % nFft;
      outL_[static_cast<size_t>(outWrite_)] = 0.f;
      outR_[static_cast<size_t>(outWrite_)] = 0.f;
      outWrite_ = (outWrite_ + 1) & outMask_;
      outRead_ = (outRead_ + 1) & outMask_;
    }
    quietRun_ = std::min(quietRun_ + n, nFft * 4);
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
        peakL = std::max(peakL, fftBinMag(reL_.data(), imL_.data(), k));
      if (!mono_)
      {
        for (int k = lo; k < hi; ++k)
          peakR = std::max(peakR, fftBinMag(reR_.data(), imR_.data(), k));
      }
      const float dL = magToDb(peakL, norm);
      // Mono has one spectrum. Averaging it with a silent right channel
      // would sit halfway to the −120 dB floor.
      const float dR = mono_ ? dL : magToDb(peakR, norm);
      const float dA = mono_ ? dL : 0.5f * (dL + dR);
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

  /** Stored fingerprints onto the same display slots as the live spectrum. */
  void updateProfileSlotSpectra(float norm, bool refreshStored)
  {
    const int n = bins_;
    if (n < 2)
      return;
    const int half = fftSize_ / 2;
    for (int s = 0; s < kNumProfiles; ++s)
    {
      const bool learningThis = learning_ && learnSlot_ == s && learnHops_ > 0;
      if (!learningThis && !refreshStored && slotShown_[s])
        continue;

      auto& dst = slotProf_[s];
      if (static_cast<int>(dst.size()) != n)
        dst.assign(static_cast<size_t>(n), kFloorDb);
      if (!learningThis && !profiles_[s].valid)
      {
        slotShown_[s] = false;
        std::fill(dst.begin(), dst.end(), kFloorDb);
        continue;
      }
      slotShown_[s] = true;

      if (learningThis)
      {
        const float inv = 1.f / static_cast<float>(learnHops_);
        std::fill(scratchPn_.begin(), scratchPn_.begin() + half + 1, 0.f);
        for (int k = 0; k <= half; ++k)
          scratchPn_[static_cast<size_t>(k)] =
            learnSum_[static_cast<size_t>(k)] * inv;
        reducePowerToSlots(scratchPn_.data(), dst.data(), n, norm);
      }
      else
      {
        // Stored fingerprint only. The blend lives in pnActive_ / the overlay.
        fillProfilePower(scratchPn_.data(), s);
        reducePowerToSlots(scratchPn_.data(), dst.data(), n, norm);
      }
    }
  }

  void reducePowerToSlots(const float* power, float* dst, int n, float norm) const
  {
    const int limit = fftSize_ / 2 + 1;
    for (int i = 0; i < n; ++i)
    {
      if (!binValid_[static_cast<size_t>(i)])
      {
        dst[i] = kFloorDb;
        continue;
      }
      int lo = binLo_[static_cast<size_t>(i)];
      int hi = binHi_[static_cast<size_t>(i)];
      if (lo < 0)
        lo = 0;
      if (hi > limit)
        hi = limit;
      double sum = 0.0;
      int count = 0;
      for (int k = lo; k < hi; ++k)
      {
        sum += static_cast<double>(std::max(0.f, power[k]));
        ++count;
      }
      const float mean = count > 0 ? static_cast<float>(sum / count) : 0.f;
      dst[i] = magToDb(std::sqrt(mean), norm);
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
  int displayWidth_ = 128;
  int profileUiBins_ = 0;
  int profileUiWidth_ = 0;
  bool bypassActive_ = false;
  bool mono_ = false;
  bool vizActive_ = false;
  bool bandDirty_ = true;
  bool skipLatched_ = false;
  int quietRun_ = 0;
  int resumeSamples_ = 0;
  int enterFade_ = 0;
  int fadeLen_ = 128;

  float fLoHz_ = 20.f;
  float fHiHz_ = 160.f;
  int loSlope_ = 2;
  int hiSlope_ = 2;
  float amount_ = 1.f;
  float floorDb_ = -20.f;
  float spanDb_ = 12.f;
  float offsetDb_ = 0.f;
  float offsetLin_ = 1.f;
  bool rms_ = false;
  bool rmsWarm_ = false;
  float rmsA_ = 1.f;
  float octave_ = 0.f;
  int octCells_ = 0;
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
  std::atomic<bool> displayDirty_ {true};

  Profile profiles_[kNumProfiles];

  std::vector<float> inL_, inR_, olaL_, olaR_, dryL_, dryR_, outL_, outR_, window_;
  std::vector<float> reL_, imL_, reR_, imR_;
  std::vector<float> px_, pxDet_, pxOpen_, pnActive_, pnFrom_, pnTo_, gain_,
    bandW_, learnSum_, scratchPn_;
  std::vector<float> cellPx_, cellOpen_;
  std::vector<int> binCell_;
  std::vector<float> avgDb_, maxDb_, lDb_, rDb_, grDisp_, profDisp_;
  std::vector<float> slotProf_[kNumProfiles];
  bool slotShown_[kNumProfiles] {};
  std::vector<float> pubAvg_, pubMax_, pubL_, pubR_, pubGr_, pubProf_, pubT_;
  std::vector<float> pubSlotProf_[kNumProfiles];
  bool pubSlotShown_[kNumProfiles] {};
  std::vector<float> slotT_;
  std::vector<int> binLo_, binHi_, binValid_;
  std::vector<int> profileUiLo_, profileUiHi_, profileUiValid_;
  std::vector<float> profileUiT_;
  std::mutex mutex_;
};

} // namespace Dsp
} // namespace calfNXT
