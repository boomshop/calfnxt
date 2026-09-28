#pragma once

#include "seq_lock.h"

#include <algorithm>
#include <cmath>
#include <cstring>

namespace calfNXT {
namespace Dsp {

/**
 * Interleaved history ring + seqlock snapshot for scrolling viz.
 * Plugins write the current slot, call endSample() to advance, publish(),
 * and take() with a per-slot copy callback.
 */
template <int Channels, int MaxSlots = 512>
class VizHistoryRing
{
public:
  static constexpr int kChannels = Channels;
  static constexpr int kMaxSlots = MaxSlots;
  static constexpr int kMinSlots = 48;
  static constexpr int kBufSize = MaxSlots * Channels;

  void reset() noexcept
  {
    std::memset(buf_, 0, sizeof(buf_));
    pos_ = 0;
    sampleCount_ = 0;
    samplesPerSlot_ = 1;
    visibleSlots_ = 160;
    lock_.beginWrite();
    std::memset(snapshot_, 0, sizeof(snapshot_));
    snapshotPos_ = 0;
    snapshotSampleCount_ = 0;
    snapshotSamplesPerSlot_ = 1;
    lock_.endWrite();
  }

  void setVisibleSlots(int bins) noexcept
  {
    visibleSlots_ = std::max(kMinSlots, std::min(kMaxSlots, bins));
  }

  void setDisplayWindow(double sampleRate, float displayMs) noexcept
  {
    const int slots = std::max(kMinSlots, std::min(kMaxSlots, visibleSlots_));
    samplesPerSlot_ = std::max(
      1, static_cast<int>(std::lround(
           sampleRate * (static_cast<double>(displayMs) * 0.001) /
           static_cast<double>(slots))));
  }

  int visibleSlots() const noexcept { return visibleSlots_; }
  int samplesPerSlot() const noexcept { return samplesPerSlot_; }
  int sampleCount() const noexcept { return sampleCount_; }
  int pos() const noexcept { return pos_; }

  float* slot() noexcept { return buf_ + pos_; }
  const float* slot() const noexcept { return buf_ + pos_; }

  /** After writing into slot(); advances and seeds the next slot when full. */
  void endSample(const float seedNext[Channels]) noexcept
  {
    sampleCount_ += 1;
    if (sampleCount_ < samplesPerSlot_)
      return;
    pos_ = (pos_ + Channels) % kBufSize;
    sampleCount_ = 0;
    for (int c = 0; c < Channels; ++c)
      buf_[pos_ + c] = seedNext[c];
  }

  void publish() noexcept
  {
    lock_.beginWrite();
    std::memcpy(snapshot_, buf_, sizeof(buf_));
    snapshotPos_ = pos_;
    snapshotSampleCount_ = sampleCount_;
    snapshotSamplesPerSlot_ = samplesPerSlot_;
    lock_.endWrite();
  }

  /**
   * Chronological unwrap into out[slots*Channels] + phase.
   * copySlot(src, dst) fills one slot. Returns length or 0 if contended.
   */
  template <typename CopySlot>
  int take(float* out, int maxOut, CopySlot&& copySlot) const noexcept
  {
    const int slots = std::max(kMinSlots, std::min(kMaxSlots, visibleSlots_));
    const int outCount = slots * Channels;
    if (!out || maxOut < outCount + 1)
      return 0;

    float phase = 0.f;
    for (int attempt = 0; attempt < 8; ++attempt)
    {
      uint32_t s0 = 0;
      if (!lock_.tryBeginRead(s0))
        continue;
      const int startPos =
        (kBufSize + snapshotPos_ - (slots - 1) * Channels) % kBufSize;
      const int sps = std::max(1, snapshotSamplesPerSlot_);
      phase = static_cast<float>(snapshotSampleCount_) / static_cast<float>(sps);
      for (int i = 0; i < slots; ++i)
      {
        const int srcIdx = (startPos + i * Channels) % kBufSize;
        copySlot(snapshot_ + srcIdx, out + i * Channels);
      }
      if (lock_.tryEndRead(s0))
      {
        out[outCount] = std::clamp(phase, 0.f, 1.f);
        return outCount + 1;
      }
    }
    return 0;
  }

private:
  float buf_[kBufSize] {};
  float snapshot_[kBufSize] {};
  mutable SeqLock lock_;
  int pos_ = 0;
  int sampleCount_ = 0;
  int samplesPerSlot_ = 1;
  int snapshotPos_ = 0;
  int snapshotSampleCount_ = 0;
  int snapshotSamplesPerSlot_ = 1;
  int visibleSlots_ = 160;
};

} // namespace Dsp
} // namespace calfNXT
