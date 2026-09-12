#include "viz_hz.h"

#include <cstdlib>
#include <mutex>

namespace calfNXT {
namespace Ui {

void VizHzRuntime::initFromEnv() noexcept
{
  if (const char* s = std::getenv("CALFNXT_VIZ_HZ"))
  {
    char* end = nullptr;
    const long v = std::strtol(s, &end, 10);
    if (end != s && v >= 5 && v <= 60)
      hz.store(static_cast<int>(v), std::memory_order_relaxed);
  }
}

VizHzRuntime& vizHzRuntime() noexcept
{
  static VizHzRuntime flags;
  static std::once_flag once;
  std::call_once(once, [] { flags.initFromEnv(); });
  return flags;
}

} // namespace Ui
} // namespace calfNXT
