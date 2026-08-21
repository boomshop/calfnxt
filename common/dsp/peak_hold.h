#pragma once

#include <atomic>
#include <cmath>
#include <cstddef>

namespace calfNXT {
namespace Viz {

/** Per-channel absolute peak hold for UI meters.
 *
 * Audio thread: accumulate() keeps the max |sample| since the last take.
 * UI thread: takeDb() reads the hold, converts to dB, and resets to 0 so the
 * next window starts fresh. Frontend widgets own the falling animation.
 */
class LevelPeakHold
{
public:
  static constexpr int kMaxChannels = 8;
  static constexpr float kSilenceDb = -96.f;

  explicit LevelPeakHold(int channels = 2)
  : channels_(channels < 1 ? 1 : (channels > kMaxChannels ? kMaxChannels : channels))
  {
    reset();
  }

  int channels() const { return channels_; }

  void reset()
  {
    for (int i = 0; i < kMaxChannels; ++i)
      holdLin_[i].store(0.f, std::memory_order_relaxed);
  }

  /** Audio-thread: raise hold to |sample| if larger. */
  void accumulate(int ch, float sample)
  {
    if (ch < 0 || ch >= channels_)
      return;
    const float a = sample < 0.f ? -sample : sample;
    float cur = holdLin_[ch].load(std::memory_order_relaxed);
    while (a > cur
           && !holdLin_[ch].compare_exchange_weak(cur, a, std::memory_order_relaxed))
    {
    }
  }

  /** UI-thread: copy peaks as dBFS into out[0..n), reset holds to 0.
   *  Returns channel count written (≤ maxOut). */
  int takeDb(float* out, int maxOut)
  {
    if (!out || maxOut <= 0)
      return 0;
    const int n = channels_ < maxOut ? channels_ : maxOut;
    for (int i = 0; i < n; ++i)
    {
      const float lin = holdLin_[i].exchange(0.f, std::memory_order_relaxed);
      out[i] = linToDb(lin);
    }
    return n;
  }

  void setChannels(int channels)
  {
    channels_ = channels < 1 ? 1 : (channels > kMaxChannels ? kMaxChannels : channels);
    reset();
  }

  static float linToDb(float lin)
  {
    if (!std::isfinite(lin) || !(lin > 1.0e-9f))
      return kSilenceDb;
    const float db = 20.f * std::log10(lin);
    return std::isfinite(db) ? db : kSilenceDb;
  }

private:
  int channels_ = 2;
  std::atomic<float> holdLin_[kMaxChannels] {};
};

} // namespace Viz
} // namespace calfNXT
