#pragma once

namespace calfNXT {
namespace Ui {

/** Optional DSP→editor telemetry (meters now; spectrum arrays later).
 *
 * Not VST3 parameters — high-rate display data only.
 * Protocol (host→UI JSON via __calfnxtOnHost):
 *   {t:"io", ch:N}                         // bus channel count (WebEditor)
 *   {t:"viz", id:"in"|"out", kind:"levels", v:[...dBFS]}
 *   {t:"viz", id:"eq", kind:"gains", v:[...dB]}  // per-band applied gain (EQ)
 *   {t:"viz", id:"stereo", kind:"corr", v:[c]}   // correlation −1…1
 *   {t:"viz", id:"stereo", kind:"gonio", v:[l,r,…]} // interleaved L/R
 * Future:
 *   {t:"viz", id:"fft", kind:"spectrum", v:[...]}
 *   UI→host {t:"vizcfg", id:"fft", bins:N} after measuring pixel width.
 */
class IVizSource
{
public:
  virtual ~IVizSource() = default;

  /** Input peak-hold exchange: fill out[] with dBFS, reset DSP holds. Returns ch count. */
  virtual int takeInputLevelsDb(float* out, int maxOut)
  {
    (void)out;
    (void)maxOut;
    return 0;
  }

  /** Output peak-hold exchange: fill out[] with dBFS, reset DSP holds. Returns ch count. */
  virtual int takeOutputLevelsDb(float* out, int maxOut)
  {
    (void)out;
    (void)maxOut;
    return 0;
  }

  /** Per-band applied EQ gains in dB (static or dyn). Returns band count. */
  virtual int takeBandGainsDb(float* out, int maxOut)
  {
    (void)out;
    (void)maxOut;
    return 0;
  }

  /** Stereo correlation −1…1 (single value). Returns 1 if available, else 0. */
  virtual int takeCorrelation(float* out, int maxOut)
  {
    (void)out;
    (void)maxOut;
    return 0;
  }

  /** Goniometer interleaved L/R samples (envelope-scaled).
   *  Returns float count (>=0). Return -1 if this plugin has no gonio stream
   *  (so the editor does not flush an empty clear for unrelated plugins). */
  virtual int takeGonio(float* out, int maxOut)
  {
    (void)out;
    (void)maxOut;
    return -1;
  }

  /** Stream id for input levels (e.g. "in"). */
  virtual const char* vizInputLevelsId() const { return "in"; }
  /** Stream id for output levels (e.g. "out"). */
  virtual const char* vizOutputLevelsId() const { return "out"; }
  /** Stream id for EQ band gains (e.g. "eq"). */
  virtual const char* vizBandGainsId() const { return "eq"; }
  /** Stream id for stereo field (correlation + gonio). */
  virtual const char* vizStereoFieldId() const { return "stereo"; }
};

} // namespace Ui
} // namespace calfNXT
