#pragma once

// Parameter inertia (finite-time ramps) — ported from Calf Studio Gear inertia.h.

#include <cmath>

namespace calfNXT {
namespace Dsp {

/** Constant-time linear ramp. */
class LinearRamp
{
public:
  int rampLen = 1;
  float mul = 1.f;
  float delta = 0.f;

  explicit LinearRamp(int len = 64) { setLength(len); }

  void setLength(int len)
  {
    rampLen = len > 0 ? len : 1;
    mul = 1.f / static_cast<float>(rampLen);
  }

  int length() const { return rampLen; }

  void startRamp(float start, float end) { delta = mul * (end - start); }

  float ramp(float value) const { return value + delta; }

  float rampMany(float value, int count) const
  {
    return value + delta * static_cast<float>(count);
  }
};

/** Constant-time exponential ramp (ratio root). */
class ExponentialRamp
{
public:
  int rampLen = 1;
  float root = 1.f;
  float delta = 1.f;

  explicit ExponentialRamp(int len = 128) { setLength(len); }

  void setLength(int len)
  {
    rampLen = len > 0 ? len : 1;
    root = 1.f / static_cast<float>(rampLen);
  }

  int length() const { return rampLen; }

  void startRamp(float start, float end)
  {
    if (!(std::fabs(start) > 1.0e-30f))
      start = (end >= 0.f) ? 1.0e-30f : -1.0e-30f;
    delta = std::pow(end / start, root);
  }

  float ramp(float value) const { return value * delta; }

  float rampMany(float value, float count) const
  {
    return value * std::pow(delta, count);
  }
};

/** Smooth discrete parameter changes with a finite ramp length. */
template <class Ramp>
class Inertia
{
public:
  float oldValue = 0.f;
  float value = 0.f;
  unsigned int count = 0;
  Ramp ramp;

  explicit Inertia(const Ramp& r = Ramp(), float init = 0.f)
  : oldValue(init)
  , value(init)
  , ramp(r)
  {
  }

  void setNow(float v)
  {
    value = oldValue = v;
    count = 0;
  }

  void setInertia(float source)
  {
    if (source != oldValue)
    {
      ramp.startRamp(value, source);
      count = static_cast<unsigned int>(ramp.length());
      oldValue = source;
    }
  }

  float get(float source)
  {
    setInertia(source);
    return get();
  }

  float get()
  {
    if (!count)
      return oldValue;
    value = ramp.ramp(value);
    --count;
    if (!count)
      value = oldValue;
    return value;
  }

  void step()
  {
    if (!count)
      return;
    value = ramp.ramp(value);
    --count;
    if (!count)
      value = oldValue;
  }

  float getLast() const { return value; }

  bool active() const { return count > 0; }
};

using ExpInertia = Inertia<ExponentialRamp>;

} // namespace Dsp
} // namespace calfNXT
