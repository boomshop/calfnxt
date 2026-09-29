#pragma once

#include "pluginterfaces/vst/ivstaudioprocessor.h"

#include <algorithm>
#include <vector>

namespace calfNXT {
namespace Dsp {

/** Float workspace for plugins whose DSP is float32.
 *
 * EffectBase accepts kSample64, and IoStage already copies either format.
 * channelBuffers32 and channelBuffers64 are a union, so a non-null 32-bit
 * pointer does not mean the block is float — check symbolicSampleSize.
 *
 * Allocate in setupProcessing: max(64, maxSamplesPerBlock) frames × 2
 * (left, then right). The audio thread never grows it. 32-bit blocks stay
 * in place. 64-bit blocks are converted in chunks of capacity(), the float
 * DSP runs, and the doubles are written back.
 */
class Sample64Scratch
{
public:
  void prepare(Steinberg::int32 maxSamplesPerBlock)
  {
    const Steinberg::int32 block = maxSamplesPerBlock > 0 ? maxSamplesPerBlock : 64;
    cap_ = std::max<Steinberg::int32>(64, block);
    buf_.assign(static_cast<size_t>(cap_) * 2, 0.f);
  }

  Steinberg::int32 capacity() const { return cap_; }

  /** Copy doubles into the scratch, call fn(left, rightOrNull, n), write back.
   *  right64 may be null (mono). False when the scratch was not prepared. */
  template <typename Fn>
  bool process(double* left64, double* right64, Steinberg::int32 nFrames, Fn&& fn)
  {
    if (!left64 || nFrames <= 0 || cap_ <= 0 || buf_.size() < static_cast<size_t>(cap_) * 2)
      return false;

    float* dstL = buf_.data();
    float* dstR = right64 ? buf_.data() + cap_ : nullptr;
    for (Steinberg::int32 off = 0; off < nFrames;)
    {
      const Steinberg::int32 n = std::min(cap_, nFrames - off);
      for (Steinberg::int32 i = 0; i < n; ++i)
        dstL[i] = static_cast<float>(left64[off + i]);
      if (dstR)
      {
        for (Steinberg::int32 i = 0; i < n; ++i)
          dstR[i] = static_cast<float>(right64[off + i]);
      }
      fn(dstL, dstR, n);
      for (Steinberg::int32 i = 0; i < n; ++i)
        left64[off + i] = static_cast<double>(dstL[i]);
      if (dstR)
      {
        for (Steinberg::int32 i = 0; i < n; ++i)
          right64[off + i] = static_cast<double>(dstR[i]);
      }
      off += n;
    }
    return true;
  }

private:
  Steinberg::int32 cap_ = 0;
  std::vector<float> buf_;
};

} // namespace Dsp
} // namespace calfNXT
