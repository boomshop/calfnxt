#pragma once

#include <atomic>
#include <cstdint>

namespace calfNXT {
namespace Dsp {

/**
 * Odd/even seqlock for audio→UI history snapshots.
 *
 * Writer (audio): beginWrite → copy/mutate publish buffer → endWrite.
 * Reader (UI tick): tryRead retries while seq is odd or changes mid-copy.
 */
class SeqLock
{
public:
  void beginWrite() noexcept
  {
    seq_.fetch_add(1, std::memory_order_release); // odd: write in progress
  }

  void endWrite() noexcept
  {
    seq_.fetch_add(1, std::memory_order_release); // even: stable
  }

  /** Load seq; returns false if a write is in progress (odd). */
  bool tryBeginRead(uint32_t& seqOut) const noexcept
  {
    seqOut = seq_.load(std::memory_order_acquire);
    return (seqOut & 1u) == 0u;
  }

  /** True if seq is unchanged since tryBeginRead. */
  bool tryEndRead(uint32_t seq0) const noexcept
  {
    const uint32_t seq1 = seq_.load(std::memory_order_acquire);
    return seq0 == seq1;
  }

  /**
   * Run `fn` under a consistent snapshot. Returns true on success.
   * `fn` should only read the published data (no side effects on fail path).
   */
  template <typename Fn>
  bool tryRead(Fn&& fn, int attempts = 8) const noexcept
  {
    for (int attempt = 0; attempt < attempts; ++attempt)
    {
      uint32_t s0 = 0;
      if (!tryBeginRead(s0))
        continue;
      fn();
      if (tryEndRead(s0))
        return true;
    }
    return false;
  }

private:
  std::atomic<uint32_t> seq_ {0};
};

} // namespace Dsp
} // namespace calfNXT
