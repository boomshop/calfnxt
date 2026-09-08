#pragma once

// Gain-reduction snapshot for viz (Compressor, Expander, DeEsser, Limiter,
// Mbcomp, Mblimiter).
// Audio thread: process() peak-holds the deepest GR since the last take.
// UI thread: takeDb() returns ≤0 dB and clears the hold.
// No falling ballistics — the meter follows the real GR.

#include <atomic>
#include <cmath>

namespace calfNXT {
namespace Dsp {

class GrMeter
{
public:
  void reset(float /*sampleRate*/ = 44100.f)
  {
    holdAmt_.store(0.f, std::memory_order_relaxed);
  }

  /** Feed linear GR (1 = none, →0 = more reduction). Audio thread only. */
  void process(float grLin)
  {
    float amt = -linToDbSafe(grLin);
    if (!(amt > 0.f) || !std::isfinite(amt))
      amt = 0.f;
    else if (amt > 60.f)
      amt = 60.f;

    float cur = holdAmt_.load(std::memory_order_relaxed);
    while (amt > cur
           && !holdAmt_.compare_exchange_weak(cur, amt, std::memory_order_relaxed))
    {
    }
  }

  /** Instant clear (bypass). Audio thread only. */
  void forceZero()
  {
    holdAmt_.store(0.f, std::memory_order_relaxed);
  }

  /** ≤0 dB for viz; resets the hold so the next window starts fresh. */
  float takeDb()
  {
    return -holdAmt_.exchange(0.f, std::memory_order_acq_rel);
  }

private:
  static float linToDbSafe(float lin)
  {
    if (!(lin > 1.0e-12f))
      return -96.f;
    return 20.f * std::log10(lin);
  }

  std::atomic<float> holdAmt_ {0.f};
};

} // namespace Dsp
} // namespace calfNXT
