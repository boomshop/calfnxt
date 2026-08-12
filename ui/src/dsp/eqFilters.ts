/**
 * RBJ biquad transforms matching `common/dsp/biquad.h` (Calf/RBJ).
 * Used as AUX EqBand `type` factories so chart curves track the DSP.
 *
 * Coeff naming here follows AUX/RBJ (b* feedforward, a* feedback).
 * C++ BiquadCoeffs uses a* for feedforward and b1/b2 for feedback — same math.
 */
import { biquadFilter } from '@deutschesoft/aux-widgets/src/utils/biquad.js';

export type EqFilterOpts = {
  freq: number;
  q: number;
  sample_rate: number;
  gain?: number;
};

/** Drawing / warping sample rate (typical DAW). Curve ≠ audio SR is fine for EQ UI.
 *  Forced in factories — EqBand does not forward `sample_rate` to Filter. */
export const EQ_DRAW_SAMPLE_RATE = 48000;

function withDrawSr(trafo: (O: EqFilterOpts) => Record<string, number>) {
  return (O: EqFilterOpts) => trafo({ ...O, sample_rate: EQ_DRAW_SAMPLE_RATE });
}

function dbToLin(db: number): number {
  return Math.pow(10, db * 0.05);
}

/** Peaking EQ — matches BiquadCoeffs::setPeakeqRbj (peak = linear). */
export function peakingRbj(O: EqFilterOpts) {
  const A = Math.pow(10, (O.gain ?? 0) / 40);
  const w0 = (2 * Math.PI * O.freq) / O.sample_rate;
  const alpha = Math.sin(w0) / (2 * O.q);
  const cw = Math.cos(w0);
  return {
    b0: 1 + alpha * A,
    b1: -2 * cw,
    b2: 1 - alpha * A,
    a0: 1 + alpha / A,
    a1: -2 * cw,
    a2: 1 - alpha / A,
    sample_rate: O.sample_rate,
  };
}

/** Low shelf — matches setLowshelfRbj. */
export function lowShelfRbj(O: EqFilterOpts) {
  const A = Math.pow(10, (O.gain ?? 0) / 40);
  const w0 = (2 * Math.PI * O.freq) / O.sample_rate;
  const alpha = Math.sin(w0) / (2 * O.q);
  const cw = Math.cos(w0);
  const tmp = 2 * Math.sqrt(A) * alpha;
  return {
    b0: A * (A + 1 - (A - 1) * cw + tmp),
    b1: 2 * A * (A - 1 - (A + 1) * cw),
    b2: A * (A + 1 - (A - 1) * cw - tmp),
    a0: A + 1 + (A - 1) * cw + tmp,
    a1: -2 * (A - 1 + (A + 1) * cw),
    a2: A + 1 + (A - 1) * cw - tmp,
    sample_rate: O.sample_rate,
  };
}

/** High shelf — matches setHighshelfRbj. */
export function highShelfRbj(O: EqFilterOpts) {
  const A = Math.pow(10, (O.gain ?? 0) / 40);
  const w0 = (2 * Math.PI * O.freq) / O.sample_rate;
  const alpha = Math.sin(w0) / (2 * O.q);
  const cw = Math.cos(w0);
  const tmp = 2 * Math.sqrt(A) * alpha;
  return {
    b0: A * (A + 1 + (A - 1) * cw + tmp),
    b1: -2 * A * (A - 1 + (A + 1) * cw),
    b2: A * (A + 1 + (A - 1) * cw - tmp),
    a0: A + 1 - (A - 1) * cw + tmp,
    a1: 2 * (A - 1 - (A + 1) * cw),
    a2: A + 1 - (A - 1) * cw - tmp,
    sample_rate: O.sample_rate,
  };
}

/** Low-pass — matches setLpRbj (unity gain). */
export function lowPassRbj(O: EqFilterOpts) {
  const w0 = (2 * Math.PI * O.freq) / O.sample_rate;
  const alpha = Math.sin(w0) / (2 * O.q);
  const cw = Math.cos(w0);
  return {
    b0: (1 - cw) / 2,
    b1: 1 - cw,
    b2: (1 - cw) / 2,
    a0: 1 + alpha,
    a1: -2 * cw,
    a2: 1 - alpha,
    sample_rate: O.sample_rate,
  };
}

/** High-pass — matches setHpRbj (unity gain). EQ pass bands ignore gain. */
export function highPassRbj(O: EqFilterOpts) {
  const w0 = (2 * Math.PI * O.freq) / O.sample_rate;
  const alpha = Math.sin(w0) / (2 * O.q);
  const cw = Math.cos(w0);
  return {
    b0: (1 + cw) / 2,
    b1: -(1 + cw),
    b2: (1 + cw) / 2,
    a0: 1 + alpha,
    a1: -2 * cw,
    a2: 1 - alpha,
    sample_rate: O.sample_rate,
  };
}

/**
 * Constant-skirt band-pass — matches setBpRbj.
 * Gain (dB) scales peak amplitude like the DSP `peak` argument.
 */
export function bandPassRbj(O: EqFilterOpts) {
  const w0 = (2 * Math.PI * O.freq) / O.sample_rate;
  const alpha = Math.sin(w0) / (2 * O.q);
  const g = dbToLin(O.gain ?? 0);
  return {
    b0: g * alpha,
    b1: 0,
    b2: -g * alpha,
    a0: 1 + alpha,
    a1: -2 * Math.cos(w0),
    a2: 1 - alpha,
    sample_rate: O.sample_rate,
  };
}

/**
 * Frequency-independent gain stage (b0 = lin gain, all else neutral).
 * Cascaded with pass filters so a band curve can carry an offset in dB —
 * RBJ LP/HP are unity gain and ignore `gain` on their own.
 */
export function flatGainRbj(O: EqFilterOpts) {
  return {
    b0: dbToLin(O.gain ?? 0),
    b1: 0,
    b2: 0,
    a0: 1,
    a1: 0,
    a2: 0,
    sample_rate: O.sample_rate,
  };
}

export const auxPeaking = biquadFilter(withDrawSr(peakingRbj));
export const auxLowShelf = biquadFilter(withDrawSr(lowShelfRbj));
export const auxHighShelf = biquadFilter(withDrawSr(highShelfRbj));
export const auxBandPass = biquadFilter(withDrawSr(bandPassRbj));
export const auxLowpass12 = biquadFilter(withDrawSr(lowPassRbj));
export const auxLowpass24 = biquadFilter(withDrawSr(lowPassRbj), withDrawSr(lowPassRbj));
export const auxLowpass36 = biquadFilter(
  withDrawSr(lowPassRbj),
  withDrawSr(lowPassRbj),
  withDrawSr(lowPassRbj),
);
export const auxHighpass12 = biquadFilter(withDrawSr(highPassRbj));
export const auxHighpass24 = biquadFilter(
  withDrawSr(highPassRbj),
  withDrawSr(highPassRbj),
);
export const auxHighpass36 = biquadFilter(
  withDrawSr(highPassRbj),
  withDrawSr(highPassRbj),
  withDrawSr(highPassRbj),
);
export const auxHighpass48 = biquadFilter(
  withDrawSr(highPassRbj),
  withDrawSr(highPassRbj),
  withDrawSr(highPassRbj),
  withDrawSr(highPassRbj),
);

export const auxLowpass48 = biquadFilter(
  withDrawSr(lowPassRbj),
  withDrawSr(lowPassRbj),
  withDrawSr(lowPassRbj),
  withDrawSr(lowPassRbj),
);

/** Crossover shapes with a dB offset — multiband band curves (gain = GR).
 *  Stage Qs match `BandSplitter` (Linkwitz-Riley = Butterworth²). Cascading the
 *  same Q=0.707 N times is NOT LR for N>2 and looks too soft near fc. */
const LR2_Q = [0.5] as const;
const LR4_Q = [0.7071067811865476, 0.7071067811865476] as const;
const LR8_Q = [
  0.541196100146197, 1.306562964876376, 0.541196100146197, 1.306562964876376,
] as const;
const LR16_Q = [
  0.509795579, 0.601344886, 0.899976223, 2.562915447,
  0.509795579, 0.601344886, 0.899976223, 2.562915447,
] as const;

function lpStage(q: number) {
  return withDrawSr((O: EqFilterOpts) => lowPassRbj({ ...O, q }));
}
function hpStage(q: number) {
  return withDrawSr((O: EqFilterOpts) => highPassRbj({ ...O, q }));
}

/**
 * Clamp freq→dB just below the typical chart floor (−60).
 * Slightly under y_min keeps Graph mode=bottom closing strokes off-canvas.
 */
function clampMbGain(
  factory: (O: EqFilterOpts) => (f: number) => number,
  minDb = -66,
  maxDb = 12,
) {
  return (O: EqFilterOpts) => {
    const fn = factory(O);
    return (f: number) => {
      const g = fn(f);
      if (!Number.isFinite(g)) return minDb;
      return Math.max(minDb, Math.min(maxDb, g));
    };
  };
}

export const auxLowpassGain12 = clampMbGain(
  biquadFilter(withDrawSr(flatGainRbj), ...LR2_Q.map(lpStage)),
);
export const auxLowpassGain24 = clampMbGain(
  biquadFilter(withDrawSr(flatGainRbj), ...LR4_Q.map(lpStage)),
);
export const auxLowpassGain48 = clampMbGain(
  biquadFilter(withDrawSr(flatGainRbj), ...LR8_Q.map(lpStage)),
);
export const auxLowpassGain96 = clampMbGain(
  biquadFilter(withDrawSr(flatGainRbj), ...LR16_Q.map(lpStage)),
);
export const auxHighpassGain12 = clampMbGain(
  biquadFilter(withDrawSr(flatGainRbj), ...LR2_Q.map(hpStage)),
);
export const auxHighpassGain24 = clampMbGain(
  biquadFilter(withDrawSr(flatGainRbj), ...LR4_Q.map(hpStage)),
);
export const auxHighpassGain48 = clampMbGain(
  biquadFilter(withDrawSr(flatGainRbj), ...LR8_Q.map(hpStage)),
);
export const auxHighpassGain96 = clampMbGain(
  biquadFilter(withDrawSr(flatGainRbj), ...LR16_Q.map(hpStage)),
);
