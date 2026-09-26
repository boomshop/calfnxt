#pragma once

#include <algorithm>
#include <cmath>

namespace calfNXT {
namespace Dsp {

/** Per-band / per-slot channel routing for stereo processors. */
enum class ChannelMode : int
{
  Stereo = 0,
  Left = 1,
  Right = 2,
  Mid = 3,
  Side = 4,
};

inline ChannelMode channelModeFromPlain(float v)
{
  switch (static_cast<int>(std::lround(std::clamp(v, 0.f, 4.f))))
  {
    case 1:
      return ChannelMode::Left;
    case 2:
      return ChannelMode::Right;
    case 3:
      return ChannelMode::Mid;
    case 4:
      return ChannelMode::Side;
    default:
      return ChannelMode::Stereo;
  }
}

/** Encode L/R → Mid/Side (0.5 scaling, matches Stereo plugin). */
inline void encodeMs(float left, float right, float& mid, float& side)
{
  mid = 0.5f * (left + right);
  side = 0.5f * (left - right);
}

/** Decode Mid/Side → L/R. */
inline void decodeMs(float mid, float side, float& left, float& right)
{
  left = mid + side;
  right = mid - side;
}

} // namespace Dsp
} // namespace calfNXT
