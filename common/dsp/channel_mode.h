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

/**
 * Listen imaging for a detector (or solo) feed.
 * Left/Right stay on that channel; Mid = mono centre; Side = L/−R;
 * Stereo keeps independent L/R.
 */
inline void listenImage(ChannelMode mode, float detL, float detR, float& outL, float& outR)
{
  switch (mode)
  {
    case ChannelMode::Left:
      outL = detL;
      outR = 0.f;
      break;
    case ChannelMode::Right:
      outL = 0.f;
      outR = detL; // routed modes duplicate the selected path into detL/detR
      break;
    case ChannelMode::Side:
      outL = detL;
      outR = -detL;
      break;
    case ChannelMode::Mid:
      outL = detL;
      outR = detL;
      break;
    case ChannelMode::Stereo:
    default:
      outL = detL;
      outR = detR;
      break;
  }
}

/** One-pole coeff for soft bypass crossfades (~ms to settle). */
inline float bypassFadeCoeff(float sampleRate, float ms = 5.f)
{
  const float n = std::max(1.e-3f, ms * 0.001f * std::max(1.f, sampleRate));
  return 1.f - std::exp(-1.f / n);
}

inline float slewToward(float current, float target, float coeff)
{
  current += coeff * (target - current);
  if (current < 1.0e-5f)
    return 0.f;
  if (current > 1.f - 1.0e-5f)
    return 1.f;
  return current;
}

} // namespace Dsp
} // namespace calfNXT
