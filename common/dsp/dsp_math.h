#pragma once

#include <algorithm>
#include <cmath>
#include <cstring>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace calfNXT {
namespace Dsp {

template <typename T>
inline constexpr T smallValue();

template <>
inline constexpr float smallValue<float>()
{
  return 1.0e-15f;
}

template <>
inline constexpr double smallValue<double>()
{
  return 1.0e-50;
}

template <typename T>
inline void zero(T& v)
{
  v = T(0);
}

inline void sanitize(float& value)
{
  if (std::abs(value) < smallValue<float>())
    value = 0.f;
  const int bits = *reinterpret_cast<const int*>(&value);
  if ((bits & 0x7F800000) == 0 && (bits & 0x007FFFFF) != 0)
    value = 0.f;
}

inline void sanitize(double& value)
{
  if (std::abs(value) < smallValue<double>())
    value = 0.0;
}

inline void sanitizeDenormal(float& value)
{
  if (!std::isnormal(value))
    value = 0.f;
}

inline void sanitizeDenormal(double& value)
{
  if (!std::isnormal(value))
    value = 0.0;
}

/**
 * Fast sine for LFO / modulation (turns 0…1 → −1…1).
 * 256-point table + linear interp — enough for chorus/flanger/reverb mod.
 */
inline float sineTurns(float turns)
{
  static float table[257];
  static bool ready = false;
  if (!ready)
  {
    for (int i = 0; i <= 256; ++i)
      table[i] = std::sin(float(i) * (2.f * float(M_PI) / 256.f));
    ready = true;
  }
  turns -= std::floor(turns);
  const float x = turns * 256.f;
  const int i0 = int(x);
  const float frac = x - float(i0);
  return table[i0] + (table[i0 + 1] - table[i0]) * frac;
}

/**
 * Block-rate approach in log space (~40% of remaining gap).
 * Used by EQ bands and BandSplitter to avoid zipper noise on Hz params.
 */
inline float glideTowardLog(float value, float target, bool& keepGliding)
{
  constexpr float kEps = 1.0e-6f;
  if (value == target)
    return value;
  const float a = std::max(kEps, value);
  const float b = std::max(kEps, target);
  if (std::fabs(a - b) <= 0.001f * std::max(a, b))
    return target;
  keepGliding = true;
  const float logN = std::log(a) + (std::log(b) - std::log(a)) * 0.4f;
  const float out = std::exp(logN);
  if ((target > value && out >= target) || (target < value && out <= target))
    return target;
  return out;
}

} // namespace Dsp
} // namespace calfNXT
