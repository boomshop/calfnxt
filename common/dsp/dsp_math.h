#pragma once

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

} // namespace Dsp
} // namespace calfNXT
