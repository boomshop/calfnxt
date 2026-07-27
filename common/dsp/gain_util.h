#pragma once

#include <cmath>

namespace calfNXT {
namespace Dsp {

/** Convert dB to linear amplitude. */
inline float dbToLin(float db)
{
  return std::pow(10.f, db * 0.05f);
}

/** Convert linear amplitude to dB. */
inline float linToDb(float lin)
{
  return 20.f * std::log10(std::max(lin, 1.0e-20f));
}

} // namespace Dsp
} // namespace calfNXT
