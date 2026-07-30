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
 *   {t:"viz", id:"comp", kind:"gr", v:[grDb]}       // gain reduction ≤0 dB
 *   {t:"viz", id:"comp", kind:"point", v:[inDb,outDb]} // transfer operating point
 *   {t:"viz", id:"comp", kind:"envelope", v:[…]}   // history: audio, GR (2×slots + phase)
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

  /** Gain reduction in dB (≤0). Returns 1 if available, else 0. */
  virtual int takeGainReductionDb(float* out, int maxOut)
  {
    (void)out;
    (void)maxOut;
    return 0;
  }

  /** Dynamics transfer operating point: [inDb, outDb]. Returns 2 if available. */
  virtual int takeDynamicsPoint(float* out, int maxOut)
  {
    (void)out;
    (void)maxOut;
    return 0;
  }

  /** Stream id for input levels (e.g. "in"). */
  virtual const char* vizInputLevelsId() const { return "in"; }
  /** Stream id for output levels (e.g. "out"). */
  virtual const char* vizOutputLevelsId() const { return "out"; }
  /** Stream id for EQ band gains (e.g. "eq"). */
  virtual const char* vizBandGainsId() const { return "eq"; }
  /** Stream id for stereo field (correlation + gonio). */
  virtual const char* vizStereoFieldId() const { return "stereo"; }
  /** Stream id for compressor GR + transfer point. */
  virtual const char* vizDynamicsId() const { return "comp"; }

  /** Envelope display buffer (transient shaper: input, output, envelope,
   *  attack, release — 5 floats per slot, N slots), plus a trailing scroll
   *  phase in [0,1] for sub-slot interpolation.
   *  Returns total float count written (slots * 5 + 1), or 0 if unavailable. */
  virtual int takeEnvelopeDisplay(float* out, int maxOut)
  {
    (void)out;
    (void)maxOut;
    return 0;
  }

  /** Stream id for envelope display. */
  virtual const char* vizEnvelopeId() const { return "env"; }

  /** Optional UI→DSP viz sizing/config, e.g. visible chart bins/points. */
  virtual void configureVizBins(const char* id, int bins)
  {
    (void)id;
    (void)bins;
  }
};

} // namespace Ui
} // namespace calfNXT
