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
 *   {t:"viz", id:"fft", kind:"spectrum", v:[bins,hold,avg…,max…,L…,R…]}
 *   {t:"viz", id:"filt", kind:"hz", v:[fcHz]}       // live filter cutoff
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

  /** Gain reduction in dB (≤0). Returns count written (1…N for multiband). */
  virtual int takeGainReductionDb(float* out, int maxOut)
  {
    (void)out;
    (void)maxOut;
    return 0;
  }

  /**
   * Per-band peak meters: interleaved [inDb, outDb] × bands (mono peak).
   * Returns float count (2×bands), or 0 if unused.
   */
  virtual int takeBandIoLevelsDb(float* out, int maxOut)
  {
    (void)out;
    (void)maxOut;
    return 0;
  }

  /** Stream id for band I/O levels (nullptr = do not flush). */
  virtual const char* vizBandIoLevelsId() const { return nullptr; }

  /** Dynamics transfer operating point(s): [inDb, outDb] or per-band
   *  [in0, out0, in1, out1, …]. Returns float count written (2 or 2×N). */
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

  /**
   * Spectrum snapshot: v[0]=N, v[1]=hold, then avg[N], max[N], L[N], R[N] (dBFS).
   * Returns float count (2+4*N), or 0 if unused / unavailable.
   */
  virtual int takeSpectrum(float* out, int maxOut)
  {
    (void)out;
    (void)maxOut;
    return 0;
  }

  /** Stream id for spectrum (nullptr = do not flush). */
  virtual const char* vizSpectrumId() const { return nullptr; }

  /** Optional UI→DSP viz sizing/config, e.g. visible chart bins/points. */
  virtual void configureVizBins(const char* id, int bins)
  {
    (void)id;
    (void)bins;
  }

  /** Host tempo: out[0]=valid(0/1), out[1]=bpm. Returns 2, or 0 if unused. */
  virtual int takeHostTempo(float* out, int maxOut)
  {
    (void)out;
    (void)maxOut;
    return 0;
  }

  /** Stream id for host tempo (nullptr = do not flush). */
  virtual const char* vizTempoId() const { return nullptr; }

  /**
   * Waveshaper viz: out[0] = active-zone amplitude 0…1 (|send| envelope),
   * out[1…] = density bins along input x ∈ [−1, 1] (soft histogram, 0…1).
   * Returns 1 + binCount, or 0 if unused.
   */
  virtual int takeShapePoint(float* out, int maxOut)
  {
    (void)out;
    (void)maxOut;
    return 0;
  }

  /** Stream id for shape viz (nullptr = do not flush). */
  virtual const char* vizShapeId() const { return nullptr; }

  /**
   * Live filter cutoff in Hz (envelope / inertia). Returns 1 if available.
   * Flushed as {t:"viz", id, kind:"hz", v:[fc]}.
   */
  virtual int takeFilterCutoffHz(float* out, int maxOut)
  {
    (void)out;
    (void)maxOut;
    return 0;
  }

  /** Stream id for filter cutoff (nullptr = do not flush). */
  virtual const char* vizFilterCutoffId() const { return nullptr; }

  /**
   * LFO activity LEDs 0…1 (e.g. ringmod). Returns count written (typically 2).
   * Flushed as {t:"viz", id, kind:"levels", v:[…]}.
   */
  virtual int takeLfoActivity(float* out, int maxOut)
  {
    (void)out;
    (void)maxOut;
    return 0;
  }

  /** Stream id for LFO activity (nullptr = do not flush). */
  virtual const char* vizLfoActivityId() const { return nullptr; }

  /**
   * Effective modulated controls while LFO routes override knobs.
   * Writes [modFreqHz, modDetuneCents, modAmount, lfo1FreqHz]; returns count (4).
   * Flushed as {t:"viz", id, kind:"ctrl", v:[…]}.
   */
  virtual int takeRingmodEffective(float* out, int maxOut)
  {
    (void)out;
    (void)maxOut;
    return 0;
  }

  /** Stream id for ringmod effective controls (nullptr = do not flush). */
  virtual const char* vizRingmodEffectiveId() const { return nullptr; }
};

} // namespace Ui
} // namespace calfNXT
