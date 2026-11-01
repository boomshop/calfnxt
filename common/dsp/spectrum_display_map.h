#pragma once

// Log-spectrum display slots for a known chart width.
//
// An FFT bin wider than one pixel (bass, at this width and FFT size) is one
// measurement. Bins narrower than a pixel are grouped until the group covers
// about one pixel. `t` is the log-fraction of that slot's frequency center
// on 20 Hz…20 kHz, so the UI can place the plateau middle on the measurement.

#include "spectrum_bins.h"

#include <algorithm>
#include <cmath>
#include <vector>

namespace calfNXT {
namespace Dsp {

inline constexpr float kSpecDisplayFMin = 20.f;
inline constexpr float kSpecDisplayFMax = 20000.f;

/**
 * Fill lo/hi (FFT bin range, hi exclusive) and t (log center, 0…1).
 * Returns the slot count. `widthPx` is the UI pixel budget (clamped by the caller).
 */
inline int buildSpectrumDisplayMap(double sampleRate, int fftSize, int widthPx,
                                   std::vector<int>& lo, std::vector<int>& hi,
                                   std::vector<float>& t)
{
  lo.clear();
  hi.clear();
  t.clear();
  if (!(sampleRate > 0.0) || fftSize < 4 || widthPx < 2)
    return 0;

  const int half = fftSize / 2;
  const float binHz = static_cast<float>(sampleRate / static_cast<double>(fftSize));
  const float nyquist = static_cast<float>(sampleRate * 0.5);
  const float fTop = std::min(kSpecDisplayFMax, nyquist);
  const float lnSpan = std::log(kSpecDisplayFMax / kSpecDisplayFMin);
  const float width = static_cast<float>(widthPx);
  const int maxSlots = kMaxSpectrumBins;

  auto logT = [&](float f) {
    f = std::clamp(f, kSpecDisplayFMin, kSpecDisplayFMax);
    return std::log(f / kSpecDisplayFMin) / lnSpan;
  };

  int runLo = -1;
  int runHi = -1;
  float runA = 0.f;
  float runB = 0.f;
  float runPx = 0.f;

  auto emit = [&](int blo, int bhi, float a, float b) {
    if (blo < 0 || bhi <= blo || !(b > a))
      return;
    if (static_cast<int>(lo.size()) >= maxSlots)
    {
      const size_t last = lo.size() - 1;
      hi[last] = bhi;
      const float center = std::sqrt(std::max(a, kSpecDisplayFMin) * b);
      t[last] = std::clamp(logT(center), 0.f, 1.f);
      return;
    }
    const float center = std::sqrt(a * b);
    lo.push_back(blo);
    hi.push_back(bhi);
    t.push_back(std::clamp(logT(center), 0.f, 1.f));
  };

  auto closeRun = [&]() {
    if (runLo < 0)
      return;
    emit(runLo, runHi, runA, runB);
    runLo = -1;
    runPx = 0.f;
  };

  for (int k = 1; k < half; ++k)
  {
    const float f0 = static_cast<float>(k) * binHz;
    const float f1 = static_cast<float>(k + 1) * binHz;
    if (f1 <= kSpecDisplayFMin)
      continue;
    if (f0 >= fTop)
      break;
    const float a = std::max(f0, kSpecDisplayFMin);
    const float b = std::min(f1, fTop);
    if (!(b > a))
      continue;
    const float px = width * std::log(b / a) / lnSpan;

    // One FFT bin already covers a pixel or more: its own slot.
    if (px >= 1.f)
    {
      closeRun();
      emit(k, k + 1, a, b);
      continue;
    }

    if (runLo < 0)
    {
      runLo = k;
      runHi = k + 1;
      runA = a;
      runB = b;
      runPx = px;
    }
    else
    {
      runHi = k + 1;
      runB = b;
      runPx += px;
    }
    if (runPx >= 1.f)
      closeRun();
  }
  closeRun();
  return static_cast<int>(lo.size());
}

} // namespace Dsp
} // namespace calfNXT
