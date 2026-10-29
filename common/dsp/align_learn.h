#pragma once

// One-shot multi-lane TDOA vs a mono anchor (Aligner).
// Analysis-band filtering is applied by the caller before feed().
//
// On each transient of the anchor, estimate a signed lead for every lane:
//   lead > 0  → lane arrives earlier than the anchor
//   lead < 0  → lane arrives later
// Delays to apply: delay[i] = lead[i] - min(lead)  (latest mic gets 0).
//
// Heavy NCC is amortized: feed() only writes the ring / arms a job;
// tickWork() scores one lane per audio block so the callback never stalls.

#include "dsp_math.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstring>

namespace calfNXT {
namespace Dsp {

class AlignLearn
{
public:
  static constexpr int kMaxLanes = 8;
  static constexpr int kMaxHits = 16;
  static constexpr float kConfidenceGate = 0.35f;
  /** Attack window for TDOA (ms). Long windows lock onto resonant cycles. */
  static constexpr float kAttackMs = 12.f;
  static constexpr int kHitsNeeded = 8;
  /** Lanes scored per tickWork() call (keep ≤2 on the audio thread). */
  static constexpr int kLanesPerTick = 1;

  enum class State : uint8_t
  {
    Idle = 0,
    Learning,
    Ready,
  };

  void prepare(double sampleRate, float maxLagMs)
  {
    sr_ = sampleRate > 1.0 ? sampleRate : 48000.0;
    maxLag_ = std::clamp(static_cast<int>(std::ceil(maxLagMs * 0.001 * sr_)), 64, 4096);
    window_ = std::clamp(static_cast<int>(std::ceil(kAttackMs * 0.001 * sr_)), 128, 2048);
    reset();
  }

  void reset()
  {
    state_ = State::Idle;
    write_ = 0;
    filled_ = 0;
    hitCount_ = 0;
    cooldown_ = 0;
    env_ = 0.f;
    pending_ = false;
    pendingEnd_ = 0;
    pendingWait_ = 0;
    prevA_ = 0.f;
    prev2A_ = 0.f;
    job_ = Job{};
    for (int l = 0; l < kMaxLanes; ++l)
    {
      lagMs_[l] = 0.f;
      confidence_[l] = 0.f;
      phaseInv_[l] = false;
      hitLag_[l].fill(0);
      hitConf_[l].fill(0.f);
      hitInv_[l].fill(false);
      hitN_[l] = 0;
    }
    std::memset(ring_, 0, sizeof(ring_));
  }

  void start()
  {
    reset();
    state_ = State::Learning;
  }

  State state() const { return state_; }
  int hitCount() const { return hitCount_; }
  bool busy() const { return pending_ || job_.active; }

  /** Signed lead vs anchor (ms): positive = earlier than anchor. */
  float lagMs(int lane) const
  {
    return (lane >= 0 && lane < kMaxLanes) ? lagMs_[lane] : 0.f;
  }
  float confidence(int lane) const
  {
    return (lane >= 0 && lane < kMaxLanes) ? confidence_[lane] : 0.f;
  }
  bool phaseInvert(int lane) const
  {
    return (lane >= 0 && lane < kMaxLanes) && phaseInv_[lane];
  }
  bool confident(int lane) const { return confidence(lane) >= kConfidenceGate; }

  /** Span of leads among confident lanes (ms) — equals max applied delay. */
  float maxConfidentLagMs() const
  {
    float lo = 0.f;
    float hi = 0.f;
    bool any = false;
    for (int l = 0; l < kMaxLanes; ++l)
    {
      if (!confident(l))
        continue;
      const float v = lagMs_[l];
      if (!any)
      {
        lo = hi = v;
        any = true;
      }
      else
      {
        lo = std::min(lo, v);
        hi = std::max(hi, v);
      }
    }
    return any ? (hi - lo) : 0.f;
  }

  /**
   * Feed one sample (analysis-filtered). Only ring I/O + trigger — no NCC.
   * Call tickWork() once per audio block to progress analysis.
   */
  void feed(const float* samples, const bool* active, int nLanes, int anchor, float triggerThresh)
  {
    if (state_ != State::Learning || !samples || !active || nLanes < 1)
      return;
    nLanes = std::min(nLanes, kMaxLanes);
    anchor = std::clamp(anchor, 0, nLanes - 1);

    for (int l = 0; l < nLanes; ++l)
      ring_[l][write_] = active[l] ? samples[l] : 0.f;
    const int now = write_;
    write_ = (write_ + 1) & kRingMask;
    if (filled_ < kRingSize)
      ++filled_;

    if (pending_)
    {
      if (pendingWait_ > 0)
        --pendingWait_;
      if (pendingWait_ == 0 && !job_.active)
      {
        pending_ = false;
        startJob(nLanes, anchor, pendingEnd_, active);
      }
    }

    const float a = std::fabs(active[anchor] ? samples[anchor] : 0.f);
    env_ = std::max(a, env_ * 0.995f);
    const bool peak =
      prevA_ > prev2A_ && prevA_ >= a && prevA_ > triggerThresh && prevA_ > env_ * 0.55f
      && prevA_ > 1.0e-4f;
    prev2A_ = prevA_;
    prevA_ = a;

    if (cooldown_ > 0)
    {
      --cooldown_;
      return;
    }
    if (pending_ || job_.active)
      return;
    if (filled_ < window_ + maxLag_ + 8)
      return;
    if (!peak)
      return;

    pending_ = true;
    pendingEnd_ = (now - 1 + kRingSize) & kRingMask;
    pendingWait_ = maxLag_;
    cooldown_ = maxLag_ + static_cast<int>(0.15 * sr_);
  }

  /**
   * Progress deferred NCC. Call once per process() block while Learning.
   * Returns true when state becomes Ready.
   */
  bool tickWork(int lanesToScore = kLanesPerTick)
  {
    if (state_ != State::Learning || !job_.active)
      return false;

    lanesToScore = std::max(1, lanesToScore);
    for (int n = 0; n < lanesToScore && job_.active; ++n)
      scoreNextLane();

    if (job_.active)
      return false;

    ++hitCount_;
    if (hitCount_ >= kHitsNeeded)
    {
      finalize(job_.nLanes, job_.anchor);
      state_ = State::Ready;
      return true;
    }
    return false;
  }

private:
  static constexpr int kRingSize = 32768;
  static constexpr int kRingMask = kRingSize - 1;
  static constexpr int kScratchMax = 2048 + 2 * 4096; // window + ±maxLag

  struct Job
  {
    bool active = false;
    int end = 0;
    int anchor = 0;
    int nLanes = 0;
    int nextLane = 0;
    uint8_t activeMask = 0;
  };

  float ringAt(int lane, int end, int age) const
  {
    return ring_[lane][(end - age + kRingSize) & kRingMask];
  }

  void startJob(int nLanes, int anchor, int end, const bool* active)
  {
    job_.active = true;
    job_.end = end;
    job_.anchor = anchor;
    job_.nLanes = nLanes;
    job_.nextLane = 0;
    job_.activeMask = 0;
    for (int l = 0; l < nLanes; ++l)
    {
      if (active[l])
        job_.activeMask = static_cast<uint8_t>(job_.activeMask | (1u << l));
    }
  }

  void scoreNextLane()
  {
    while (job_.nextLane < job_.nLanes)
    {
      const int l = job_.nextLane++;
      if (((job_.activeMask >> l) & 1) == 0)
        continue;

      int bestLag = 0;
      float bestScore = 0.f;
      bool bestInv = false;
      estimateLead(job_.anchor, l, job_.end, bestLag, bestScore, bestInv);

      const int slot = hitN_[l] % kMaxHits;
      hitLag_[l][slot] = bestLag;
      hitConf_[l][slot] = std::clamp(bestScore, 0.f, 1.f);
      hitInv_[l][slot] = bestInv;
      hitN_[l] = std::min(hitN_[l] + 1, kMaxHits);
      break;
    }
    if (job_.nextLane >= job_.nLanes)
      job_.active = false;
  }

  /**
   * Contiguous-buffer NCC. lag > 0 → lane earlier; lag < 0 → lookahead.
   */
  void estimateLead(int anchor, int lane, int end, int& outLag, float& outScore, bool& outInv)
  {
    outLag = 0;
    outScore = 0.f;
    outInv = false;

    if (lane == anchor)
    {
      outScore = 1.f;
      return;
    }

    const int win = window_;
    const int maxLag = maxLag_;
    // Anchor ages 0…win-1; lane ages −maxLag … win-1+maxLag.
    for (int i = 0; i < win; ++i)
      scratchA_[i] = ringAt(anchor, end, i);

    const int laneSpan = win + 2 * maxLag;
    for (int age = -maxLag; age < win + maxLag; ++age)
      scratchB_[age + maxLag] = ringAt(lane, end, age);

    auto scoreLag = [&](int lag, float sign) -> float {
      const float* b = scratchB_ + (maxLag + lag);
      float num = 0.f, eA = 0.f, eB = 0.f;
      for (int i = 0; i < win; ++i)
      {
        const float xa = scratchA_[i];
        const float xb = b[i] * sign;
        num += xa * xb;
        eA += xa * xa;
        eB += xb * xb;
      }
      return num / (std::sqrt(eA * eB) + 1.0e-20f);
    };

    float bestScore = -1.f;
    int bestLag = 0;
    bool bestInv = false;
    constexpr int kCoarse = 8;
    for (int inv = 0; inv < 2; ++inv)
    {
      const float sign = inv ? -1.f : 1.f;
      for (int lag = -maxLag; lag <= maxLag; lag += kCoarse)
      {
        const float sc = scoreLag(lag, sign);
        if (sc > bestScore)
        {
          bestScore = sc;
          bestLag = lag;
          bestInv = inv != 0;
        }
      }
    }
    {
      const float sign = bestInv ? -1.f : 1.f;
      const int lo = std::max(-maxLag, bestLag - kCoarse);
      const int hi = std::min(maxLag, bestLag + kCoarse);
      for (int lag = lo; lag <= hi; ++lag)
      {
        const float sc = scoreLag(lag, sign);
        if (sc > bestScore)
        {
          bestScore = sc;
          bestLag = lag;
        }
      }
    }

    outLag = bestLag;
    outScore = std::clamp(bestScore, 0.f, 1.f);
    outInv = bestInv;
    (void)laneSpan;
  }

  void finalize(int nLanes, int anchor)
  {
    for (int l = 0; l < nLanes; ++l)
    {
      if (l == anchor || hitN_[l] < 1)
      {
        lagMs_[l] = 0.f;
        confidence_[l] = (l == anchor) ? 1.f : 0.f;
        phaseInv_[l] = false;
        continue;
      }
      const int n = hitN_[l];
      int lags[kMaxHits];
      float confs[kMaxHits];
      int invVotes = 0;
      for (int i = 0; i < n; ++i)
      {
        lags[i] = hitLag_[l][i];
        confs[i] = hitConf_[l][i];
        if (hitInv_[l][i])
          ++invVotes;
      }

      // Drop lag outliers (MAD) so one wrong peak cannot shift the median.
      std::sort(lags, lags + n);
      const int rawMed = lags[n / 2];
      int kept = 0;
      int keptLags[kMaxHits];
      float keptConfs[kMaxHits];
      int keptInv = 0;
      // ~1 ms at 48 k, scale with sr; at least 16 samples.
      const int madGate = std::max(16, static_cast<int>(0.001 * sr_ * 8.0));
      for (int i = 0; i < n; ++i)
      {
        if (std::abs(hitLag_[l][i] - rawMed) > madGate)
          continue;
        keptLags[kept] = hitLag_[l][i];
        keptConfs[kept] = hitConf_[l][i];
        if (hitInv_[l][i])
          ++keptInv;
        ++kept;
      }
      if (kept < 1)
      {
        // All outliers — fall back to raw median, mark unconfident.
        lagMs_[l] = static_cast<float>(rawMed) * 1000.f / static_cast<float>(sr_);
        confidence_[l] = 0.f;
        phaseInv_[l] = false;
        continue;
      }
      std::sort(keptLags, keptLags + kept);
      std::sort(keptConfs, keptConfs + kept);
      const int medLag = keptLags[kept / 2];
      lagMs_[l] = static_cast<float>(medLag) * 1000.f / static_cast<float>(sr_);
      confidence_[l] = keptConfs[kept / 2];
      // Polarity: only flip when almost every kept hit agrees. Beater mics
      // often disagree hit-to-hit with shell/sub mics; a 50% vote destroys the mix.
      phaseInv_[l] = (confidence_[l] >= 0.6f) && (keptInv * 4 >= kept * 3);
      (void)invVotes;
    }
    lagMs_[anchor] = 0.f;
    confidence_[anchor] = 1.f;
    phaseInv_[anchor] = false;
  }

  State state_ = State::Idle;
  double sr_ = 48000.0;
  int maxLag_ = 2400;
  int window_ = 576;
  int write_ = 0;
  int filled_ = 0;
  int hitCount_ = 0;
  int cooldown_ = 0;
  float env_ = 0.f;
  bool pending_ = false;
  int pendingEnd_ = 0;
  int pendingWait_ = 0;
  float prevA_ = 0.f;
  float prev2A_ = 0.f;
  Job job_ {};

  float lagMs_[kMaxLanes] {};
  float confidence_[kMaxLanes] {};
  bool phaseInv_[kMaxLanes] {};

  std::array<int, kMaxHits> hitLag_[kMaxLanes] {};
  std::array<float, kMaxHits> hitConf_[kMaxLanes] {};
  std::array<bool, kMaxHits> hitInv_[kMaxLanes] {};
  int hitN_[kMaxLanes] {};

  float ring_[kMaxLanes][kRingSize] {};
  float scratchA_[2048] {};
  float scratchB_[kScratchMax] {};
};

} // namespace Dsp
} // namespace calfNXT
