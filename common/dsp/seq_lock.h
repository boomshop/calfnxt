#pragma once

#include <atomic>
#include <cstdint>

namespace calfNXT {
namespace Dsp {

/** Odd/even seqlock for audio→UI history snapshots. */
class SeqLock
{
public:
  void beginWrite() noexcept
  {
    seq_.fetch_add(1, std::memory_order_release);
  }

  void endWrite() noexcept
  {
    seq_.fetch_add(1, std::memory_order_release);
  }

  bool tryBeginRead(uint32_t& seqOut) const noexcept
  {
    seqOut = seq_.load(std::memory_order_acquire);
    return (seqOut & 1u) == 0u;
  }

  bool tryEndRead(uint32_t seq0) const noexcept
  {
    return seq0 == seq_.load(std::memory_order_acquire);
  }

private:
  std::atomic<uint32_t> seq_ {0};
};

} // namespace Dsp
} // namespace calfNXT
