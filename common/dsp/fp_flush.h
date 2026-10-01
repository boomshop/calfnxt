#pragma once

// Flush denormal floats to zero for one audio callback, then restore.
//
// Reaper on Apple Silicon (mattcph macOS port) processes kSample64 and leaves
// FPCR.FZ clear. Feedback state that is not scrubbed every sample — reverb
// allpasses, STFT bins, multiband-limiter rings — then stalls the realtime
// thread and the host looks frozen. Lighter plugins stay inside the deadline.
// x86 hosts get the same MXCSR FTZ+DAZ pair so denormal inputs are flushed
// before the op, not only denormal results.

#include <cstdint>

#if defined(__x86_64__) || defined(_M_X64) || defined(__i386__) || defined(_M_IX86)
#include <pmmintrin.h>
#endif

namespace calfNXT {
namespace Dsp {

class ScopedFlushDenormals
{
public:
  ScopedFlushDenormals() noexcept { arm(); }
  ~ScopedFlushDenormals() noexcept { disarm(); }

  ScopedFlushDenormals(const ScopedFlushDenormals&) = delete;
  ScopedFlushDenormals& operator=(const ScopedFlushDenormals&) = delete;

private:
  void arm() noexcept
  {
#if defined(__aarch64__)
    uint64_t fpcr = 0;
    asm volatile("mrs %0, fpcr" : "=r"(fpcr));
    saved_ = fpcr;
    // FPCR.FZ (bit 24): flush denormal inputs and outputs.
    const uint64_t next = fpcr | (1ull << 24);
    if (next != fpcr)
      asm volatile("msr fpcr, %0" ::"r"(next));
    armed_ = true;
#elif defined(__x86_64__) || defined(_M_X64) || defined(__i386__) || defined(_M_IX86)
    saved_ = _mm_getcsr();
    _mm_setcsr(saved_ | _MM_FLUSH_ZERO_ON | _MM_DENORMALS_ZERO_ON);
    armed_ = true;
#endif
  }

  void disarm() noexcept
  {
    if (!armed_)
      return;
#if defined(__aarch64__)
    asm volatile("msr fpcr, %0" ::"r"(saved_));
#elif defined(__x86_64__) || defined(_M_X64) || defined(__i386__) || defined(_M_IX86)
    _mm_setcsr(saved_);
#endif
    armed_ = false;
  }

#if defined(__aarch64__)
  uint64_t saved_ = 0;
#elif defined(__x86_64__) || defined(_M_X64) || defined(__i386__) || defined(_M_IX86)
  unsigned saved_ = 0;
#endif
  bool armed_ = false;
};

} // namespace Dsp
} // namespace calfNXT
