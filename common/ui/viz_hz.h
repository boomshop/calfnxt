#pragma once

#include <atomic>

namespace calfNXT {
namespace Ui {

/**
 * Editor viz flush rate (meters / spectrum / gains CNXV).
 * - `{t:"vizhz",hz:N}` from UI (Header prefs)
 * - optional env: CALFNXT_VIZ_HZ (startup default before UI sync)
 */
struct VizHzRuntime
{
  /** Shipping default 30 Hz. */
  std::atomic<int> hz{30};

  void initFromEnv() noexcept;
};

VizHzRuntime& vizHzRuntime() noexcept;

} // namespace Ui
} // namespace calfNXT
