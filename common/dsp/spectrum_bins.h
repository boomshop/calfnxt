#pragma once

// Shared log-spectrum viz bin limits (SpectrumTap, SpectralTamer, WebEditor).
// Keep in sync with ui/src/utils/spectrum_bins.ts.

namespace calfNXT {
namespace Dsp {

inline constexpr int kMaxSpectrumBins = 512;
inline constexpr int kMinSpectrumBins = 32;

} // namespace Dsp
} // namespace calfNXT
