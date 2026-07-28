#pragma once

#include <algorithm>
#include <cmath>
#include <cstring>

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
