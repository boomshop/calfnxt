import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import type { Bindings } from '@deutschesoft/awml/src/bindings.js';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { bindAuxOptions } from '../../utils/aux_bindings';
import { postToHost } from '../../utils/bridge';
import { useChartGradient } from '../../hooks/useChartGradient';
import {
  ANALYZER_SPECTRUM_TOGGLES,
  persistedHistoryVisible$,
} from '../../prefs/historySeriesVisible';
import { themeMode$ } from '../../prefs/theme';
import {
  themeColors$,
  themeGradientStops,
  type GradientStop,
} from '../../theme/themeColors';
import { Toggle } from '../Toggle';
import {
  SPECTRUM_MAX_BINS,
  SPECTRUM_MIN_BINS,
} from '../../utils/spectrum_bins';
import { buildDbGridY as buildDbGridYBase } from '../../utils/chartGrid';
import './SpectrumChart.scss';

export {
  SPECTRUM_MAX_BINS,
  SPECTRUM_MIN_BINS,
} from '../../utils/spectrum_bins';

/** Stable empty default — never inline `[]` in hook deps / subscribe fallbacks. */
const EMPTY_SPECTRUM: number[] = [];

/** Chart display range (visible). DSP floor is lower (−120) for tilt footroom. */
export const SPECTRUM_DB_MIN = -96;
export const SPECTRUM_DB_MAX = 0;
/** Matches SpectrumTap::kFloorDb — silence sits below the chart after tilt. */
const SPECTRUM_DSP_FLOOR_DB = -120;
export const SPECTRUM_VIZ_ID = 'fft';

/** Analyzer display modes — keep in sync with DSP `mode` param. */
export const SPECTRUM_MODE = {
  Average: 0,
  Max: 1,
  Stereo: 2,
  Difference: 3,
  Spectralizer: 4,
} as const;

/** Display scale — keep in sync with DSP `scale` param. */
export const SPECTRUM_SCALE = {
  Linear: 0,
  Pink3: 1,
  Modern45: 2,
} as const;

export type SpectrumMode = (typeof SPECTRUM_MODE)[keyof typeof SPECTRUM_MODE];

type SpectrumTraceId = keyof typeof ANALYZER_SPECTRUM_TOGGLES;

const SPECTRUM_TRACE_CHIPS: ReadonlyArray<{
  id: SpectrumTraceId;
  short: string;
  name: string;
}> = [
  { id: 'l', short: 'L', name: 'Left' },
  { id: 'r', short: 'R', name: 'Right' },
  { id: 'rms', short: 'RMS', name: 'RMS' },
  { id: 'hold', short: 'Hold', name: 'Peak hold' },
];

const DB_GRID = 6;
const DB_LABEL = 12;
const F_MIN = 20;
const F_MAX = 20000;
const CORRIDOR_HALF_DB = 9;
/**
 * Extra UI smooth on L−R. L/R are already DSP-EMA'd (~100 ms); this adds a
 * light calm on the bipolar balance curve (~120 ms at ~30 Hz viz).
 * Retention a: y = a·y + (1−a)·x  with a = exp(−1/(τ·fps)).
 */
const DIFF_EMA = Math.exp(-1 / (0.12 * 30));

function slopeDbPerOct(scale: number): number {
  const s = Math.round(scale);
  if (s === SPECTRUM_SCALE.Pink3) return 3;
  if (s === SPECTRUM_SCALE.Modern45) return 4.5;
  return 0;
}

/** Analyzer / Multiband / Tamer display tilt → dB/oct (pivoted at 1 kHz). */
export function spectrumScaleSlope(scale: number): number {
  return slopeDbPerOct(scale);
}

/** Log-bin index → Hz (matches DSP binning 20…20k). */
export function binToHz(i: number, bins: number): number {
  const t = (i + 0.5) / Math.max(1, bins);
  return F_MIN * Math.pow(F_MAX / F_MIN, t);
}

/** Hz → log-bin index (inverse of binToHz centre mapping). */
export function hzToBin(hz: number, bins: number): number {
  const n = Math.max(1, bins);
  if (!(hz > 0)) return 0;
  const t =
    Math.log(Math.min(F_MAX, Math.max(F_MIN, hz)) / F_MIN) /
    Math.log(F_MAX / F_MIN);
  return Math.max(0, Math.min(n - 1, Math.floor(t * n)));
}

/**
 * Upsample a polyline with smoothstep Y (legacy). Prefer `catmullRomDensify`
 * for spectrum — densifying past ~1 px/segment + AUX SVGRound wrinkles steep
 * flanks (the old “Krigel” look).
 */
export function densifyPolyline(
  pts: { x: number; y: number }[],
  subdivisions = 4,
  xSpace: 'linear' | 'log' = 'linear',
): { x: number; y: number }[] {
  if (pts.length < 2 || subdivisions < 2) return pts;
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < pts.length - 1; ++i) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    out.push(a);
    const useLog = xSpace === 'log' && a.x > 0 && b.x > 0;
    const x0 = useLog ? Math.log(a.x) : a.x;
    const x1 = useLog ? Math.log(b.x) : b.x;
    for (let s = 1; s < subdivisions; ++s) {
      const u = s / subdivisions;
      const uu = u * u * (3 - 2 * u); // smoothstep on Y
      const x = x0 + (x1 - x0) * u;
      out.push({
        x: useLog ? Math.exp(x) : x,
        y: a.y + (b.y - a.y) * uu,
      });
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/** Uniform Catmull-Rom sample between p1→p2 (t in 0…1). */
function catmullRomPoint(
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  t: number,
): { x: number; y: number } {
  const t2 = t * t;
  const t3 = t2 * t;
  const x =
    0.5 *
    (2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  const y =
    0.5 *
    (2 * p1.y +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  return { x, y };
}

/**
 * Interpolating Catmull-Rom through bin centres, then draw with AUX `type:"L"`.
 *
 * Unlike Graph `T`/`H` (SVG Bézier + SVGRound on every command), we stay on
 * straight segments between *our* samples. Density is capped at ~1 point per
 * CSS pixel — more than that + SVGRound is what produced the flank “Krigel”.
 *
 * `xSpace:"log"` evaluates the spline in log(x) (Hz charts).
 */
export function catmullRomDensify(
  pts: { x: number; y: number }[],
  cssWidthPx: number,
  xSpace: 'linear' | 'log' = 'linear',
): { x: number; y: number }[] {
  if (pts.length < 3) return pts;
  const maxPts = Math.max(pts.length, Math.floor(Math.max(1, cssWidthPx)) + 1);
  if (pts.length >= maxPts) return pts;

  const useLog = xSpace === 'log';
  const work = useLog
    ? pts.map((p) => ({
        x: p.x > 0 ? Math.log(p.x) : Number.NEGATIVE_INFINITY,
        y: p.y,
      }))
    : pts;
  if (useLog && work.some((p) => !Number.isFinite(p.x))) return pts;

  const n = work.length;
  const spans = n - 1;
  // Extra samples per span so total ≈ maxPts (never denser than ~1/px).
  const segs = Math.max(1, Math.min(4, Math.ceil((maxPts - 1) / spans)));
  if (segs <= 1) return pts;

  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < spans; ++i) {
    const p0 = work[Math.max(0, i - 1)]!;
    const p1 = work[i]!;
    const p2 = work[i + 1]!;
    const p3 = work[Math.min(n - 1, i + 2)]!;
    if (i === 0) {
      out.push(useLog ? { x: Math.exp(p1.x), y: p1.y } : { x: p1.x, y: p1.y });
    }
    for (let s = 1; s < segs; ++s) {
      const p = catmullRomPoint(p0, p1, p2, p3, s / segs);
      out.push(useLog ? { x: Math.exp(p.x), y: p.y } : p);
    }
    out.push(useLog ? { x: Math.exp(p2.x), y: p2.y } : { x: p2.x, y: p2.y });
  }
  return out;
}

/** SPAN-style tilt: add slope·log2(f/1k) so pink looks flat. */
export function tiltDb(
  db: number,
  freqHz: number,
  slopePerOct: number,
): number {
  if (!(slopePerOct > 0) || !(freqHz > 0)) return db;
  return db + slopePerOct * Math.log2(freqHz / 1000);
}

export function buildDbGridY(
  min: number,
  max: number,
  step: number,
  labelStep: number,
) {
  return buildDbGridYBase(min, max, step, labelStep, {
    majorClass: 'major',
    zeroClass: 'base',
  });
}

/** Vertical freq lines — same decade marks as AUX Equalizer / FrequencyResponse. */
const FREQ_GRID_MARKS: { hz: number; label?: string }[] = [
  { hz: 20, label: '20Hz' },
  { hz: 30 },
  { hz: 40 },
  { hz: 50 },
  { hz: 60 },
  { hz: 70 },
  { hz: 80 },
  { hz: 90 },
  { hz: 100, label: '100Hz' },
  { hz: 200 },
  { hz: 300 },
  { hz: 400 },
  { hz: 500 },
  { hz: 600 },
  { hz: 700 },
  { hz: 800 },
  { hz: 900 },
  { hz: 1000, label: '1kHz' },
  { hz: 2000 },
  { hz: 3000 },
  { hz: 4000 },
  { hz: 5000 },
  { hz: 6000 },
  { hz: 7000 },
  { hz: 8000 },
  { hz: 9000 },
  { hz: 10000, label: '10kHz' },
  { hz: 20000, label: '20kHz' },
];

export function buildFreqGridX(bins: number) {
  const lines: { pos: number; label?: string; class?: string }[] = [];
  for (const mark of FREQ_GRID_MARKS) {
    if (mark.hz < F_MIN || mark.hz > F_MAX) continue;
    const t = Math.log(mark.hz / F_MIN) / Math.log(F_MAX / F_MIN);
    lines.push({
      pos: t * bins,
      label: mark.label,
      class: mark.label ? 'major' : undefined,
    });
  }
  return lines;
}

const ChartBindings = {};
const ChartOptions = {
  auto_size: true,
  show_grid: true,
  label: false,
  range_x: { min: 0, max: 128 },
  range_y: { min: SPECTRUM_DB_MIN, max: SPECTRUM_DB_MAX },
  grid_x: buildFreqGridX(128),
  grid_y: buildDbGridY(SPECTRUM_DB_MIN, SPECTRUM_DB_MAX, DB_GRID, DB_LABEL),
};

const ChartWidget = componentFromWidget(
  AuxChart,
  ChartBindings,
  ChartOptions,
  'SpectrumChart',
);

type AuxGraph = {
  set: (k: string, v: unknown) => void;
  element?: SVGElement;
  toFront?: () => void;
};

type AuxChartInstance = {
  isDestructed?: () => boolean;
  element?: Element;
  svg?: SVGSVGElement;
  set: (k: string, v: unknown) => void;
  addGraph: (opts: unknown) => AuxGraph;
  removeGraph: (g: AuxGraph) => void;
};

export type SpectrumPayload = {
  bins: number;
  hold: boolean;
  avg: Float32Array;
  max: Float32Array;
  L: Float32Array;
  R: Float32Array;
  /** ~1 s power-mean body. Absent on older 4-series payloads. */
  rms: Float32Array | null;
  /**
   * Log fraction 0…1 of each slot center (20 Hz…20 kHz).
   * Absent on older uniform log-bin payloads.
   */
  t: Float32Array | null;
};

/** Log fraction → Hz. Inverse of the DSP display-slot center. */
export function tToHz(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  return F_MIN * Math.pow(F_MAX / F_MIN, u);
}

export function parseSpectrumPayload(
  v: ArrayLike<number> | null | undefined,
): SpectrumPayload | null {
  if (!v || v.length < 2) return null;
  const bins = Math.max(1, Math.min(SPECTRUM_MAX_BINS, Math.round(v[0] ?? 0)));
  const need = 2 + 4 * bins;
  if (v.length < need) return null;
  const at = (from: number, count: number) => {
    const out = new Float32Array(count);
    for (let i = 0; i < count; ++i) out[i] = v[from + i] ?? 0;
    return out;
  };
  const hasRms = v.length >= 2 + 5 * bins;
  const hasT = v.length >= 2 + 6 * bins;
  return {
    bins,
    hold: (v[1] ?? 0) >= 0.5,
    avg: at(2, bins),
    max: at(2 + bins, bins),
    L: at(2 + 2 * bins, bins),
    R: at(2 + 3 * bins, bins),
    rms: hasRms ? at(2 + 4 * bins, bins) : null,
    t: hasT ? at(2 + 5 * bins, bins) : null,
  };
}

/**
 * Log fractions for a 4-series spectrum (avg, max, L, R, then t).
 * Uniform centers when the DSP snapshot has no t tail.
 */
export function readSeriesT(
  v: ArrayLike<number>,
  bins: number,
  series: number,
): Float32Array | null {
  if (v.length < 2 + (series + 1) * bins) return null;
  const off = 2 + series * bins;
  const t = new Float32Array(bins);
  for (let i = 0; i < bins; ++i) t[i] = v[off + i] ?? (i + 0.5) / bins;
  return t;
}

/** Share of a slot each flank may use. The middle stays on the measured level. */
const FLANK_OF_BIN = 0.42;

/**
 * Flank in pixel space. `d` runs across the span. Each end is a circular
 * shoulder; the middle is a straight slant. A short rise is one cosine.
 * The span is already the flank; this does not shorten it.
 */
function flankPixels(d: number, span: number, y0: number, y1: number): number {
  const dy = y1 - y0;
  if (!(span > 0)) return y1;
  const sign = dy >= 0 ? 1 : -1;
  const radius = Math.min(span * 0.42, Math.abs(dy) * 0.48, span * 0.49);
  if (radius < 1.2 || Math.abs(dy) < 2) return y0 + dy * (d / span);
  if (Math.abs(dy) <= 2 * radius + 1) {
    const u = d / span;
    const s = (1 - Math.cos(Math.PI * u)) / 2;
    return y0 + dy * s;
  }
  const straight = span - 2 * radius;
  const yStraight = dy - 2 * sign * radius;
  if (d <= radius) {
    const u = d / radius;
    return y0 + sign * radius * (1 - Math.sqrt(Math.max(0, 1 - u * u)));
  }
  if (d >= span - radius) {
    const u = (span - d) / radius;
    return y1 - sign * radius * (1 - Math.sqrt(Math.max(0, 1 - u * u)));
  }
  return y0 + sign * radius + yStraight * ((d - radius) / straight);
}

/**
 * One pass. Each slot is a plateau as wide as its pixels. Both flanks take
 * the same share of that width, whether the step is a hairline or a wall.
 * A slot of about one pixel keeps a flank shorter than a pixel, so the raw
 * contour stays. Levels are not averaged.
 * `pxPerY` is chart pixels per data-y unit. `xAtT` maps a log fraction to
 * the chart's x (fraction, or Hz).
 */
export function spectrumFlankDots(
  ys: readonly number[],
  tIn: ArrayLike<number> | null,
  cssWidth: number,
  xAtT: (t: number) => number,
  pxPerY = 0,
): { x: number; y: number }[] {
  const n = ys.length;
  if (n < 1) return [];
  const w = cssWidth > 8 ? cssWidth : Math.max(8, n);
  const scale = pxPerY > 0 ? pxPerY : 1;
  const tOf = (i: number) => {
    const raw = tIn && i < tIn.length ? tIn[i] : undefined;
    return typeof raw === 'number' && Number.isFinite(raw)
      ? Math.min(1, Math.max(0, raw))
      : (i + 0.5) / n;
  };
  const px = (i: number) => tOf(i) * w;

  const edge = new Float64Array(n + 1);
  edge[0] = 0;
  for (let i = 1; i < n; ++i) {
    const mid = 0.5 * (px(i - 1) + px(i));
    edge[i] = Math.min(w, Math.max(edge[i - 1]!, mid));
  }
  edge[n] = Math.max(edge[n - 1]!, w);

  const coreL = new Float64Array(n);
  const coreR = new Float64Array(n);
  for (let i = 0; i < n; ++i) {
    const width = edge[i + 1]! - edge[i]!;
    let flankL = i === 0 ? 0 : width * FLANK_OF_BIN;
    let flankR = i === n - 1 ? 0 : width * FLANK_OF_BIN;
    if (flankL + flankR > width * 0.9 && flankL + flankR > 0) {
      const fit = (width * 0.9) / (flankL + flankR);
      flankL *= fit;
      flankR *= fit;
    }
    coreL[i] = edge[i]! + flankL;
    coreR[i] = edge[i + 1]! - flankR;
  }

  const out: { x: number; y: number }[] = [];
  const push = (pixel: number, dataY: number) => {
    const x = xAtT(Math.min(1, Math.max(0, pixel / w)));
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.x - x) < 1e-5 && Math.abs(prev.y - dataY) < 1e-4)
      return;
    out.push({ x, y: dataY });
  };

  for (let i = 0; i < n; ++i) {
    if (i > 0) {
      const span = coreL[i]! - coreR[i - 1]!;
      const y0 = ys[i - 1]! * scale;
      const y1 = ys[i]! * scale;
      const stepsN = Math.max(2, Math.round(Math.abs(span)));
      if (span > 0.5) {
        for (let k = 1; k <= stepsN; ++k) {
          const d = (span * k) / stepsN;
          push(coreR[i - 1]! + d, flankPixels(d, span, y0, y1) / scale);
        }
      }
    }
    push(coreL[i]!, ys[i]!);
    if (coreR[i]! > coreL[i]! + 0.5) push(coreR[i]!, ys[i]!);
  }
  return out;
}

/** Extra fraction past [0, 1] so mode=bottom vertical closers are clipped. */
const SERIES_EDGE_PAD = 0.012;

export function seriesDots(
  data: Float32Array,
  slotT: Float32Array | null,
  bins: number,
  yMin = SPECTRUM_DB_MIN,
  yMax = SPECTRUM_DB_MAX,
  slope = 0,
  cssWidth = 0,
  pxPerY = 0,
): { x: number; y: number }[] {
  if (bins < 1) return [];
  const ys: number[] = [];
  for (let i = 0; i < bins; ++i) {
    const f = slotT ? tToHz(slotT[i] ?? 0) : binToHz(i, bins);
    const raw = data[i] ?? SPECTRUM_DSP_FLOOR_DB;
    const y = tiltDb(raw, f, slope);
    ys.push(Math.min(yMax, Math.max(yMin, y)));
  }
  const curved = spectrumFlankDots(ys, slotT, cssWidth, (t) => t, pxPerY);
  const first = curved[0]?.y ?? ys[0]!;
  const last = curved[curved.length - 1]?.y ?? ys[ys.length - 1]!;
  return [
    { x: -SERIES_EDGE_PAD, y: first },
    ...curved,
    { x: 1 + SERIES_EDGE_PAD, y: last },
  ];
}

/** Midband mean (200 Hz…2 kHz) of tilted curve — corridor center. */
function midbandMean(
  data: Float32Array,
  slotT: Float32Array | null,
  bins: number,
  slope: number,
): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < bins; ++i) {
    const f = slotT ? tToHz(slotT[i] ?? 0) : binToHz(i, bins);
    if (f < 200 || f > 2000) continue;
    sum += tiltDb(data[i] ?? SPECTRUM_DSP_FLOOR_DB, f, slope);
    n += 1;
  }
  return n > 0 ? sum / n : -24;
}

function corridorBandStyle(
  centerDb: number,
  half: number,
): { top: string; height: string } {
  const yLo = Math.max(SPECTRUM_DB_MIN, centerDb - half);
  const yHi = Math.min(SPECTRUM_DB_MAX, centerDb + half);
  const range = SPECTRUM_DB_MAX - SPECTRUM_DB_MIN;
  const top = ((SPECTRUM_DB_MAX - yHi) / range) * 100;
  const height = ((yHi - yLo) / range) * 100;
  return { top: `${top}%`, height: `${Math.max(0.5, height)}%` };
}

function lerpByte(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/**
 * Same dB anchors either theme. Night field is black, day field is white.
 * Theme stops map onto LO…HI (offset 0 → LO, 1 → HI). Day flips the ramp
 * so louder still darkens: white → hot→cold → black.
 */
const WF_FLOOR_DB = -66;
const WF_LO_DB = -54;
const WF_HI_DB = -32;
const WF_PEAK_DB = -18;
const WF_BLACK: [number, number, number] = [0, 0, 0];
const WF_WHITE: [number, number, number] = [255, 255, 255];

type WfRgb = [number, number, number];

function waterfallPixel(
  db: number,
  theme: GradientStop[],
  day: boolean,
): [number, number, number, number] {
  const mix = (
    a: WfRgb,
    b: WfRgb,
    t: number,
  ): [number, number, number, number] => {
    const u = Math.min(1, Math.max(0, t));
    return [
      lerpByte(a[0], b[0], u),
      lerpByte(a[1], b[1], u),
      lerpByte(a[2], b[2], u),
      255,
    ];
  };
  const floor = day ? WF_WHITE : WF_BLACK;
  const peak = day ? WF_BLACK : WF_WHITE;
  const span = WF_HI_DB - WF_LO_DB;
  const ramp: { db: number; rgb: WfRgb }[] = [
    { db: WF_FLOOR_DB, rgb: floor },
  ];
  for (const s of theme) {
    const t = day ? 1 - s.offset : s.offset;
    ramp.push({
      db: WF_LO_DB + t * span,
      rgb: parseCssColor(s.color),
    });
  }
  ramp.sort((a, b) => a.db - b.db);
  ramp.push({ db: WF_PEAK_DB, rgb: peak });

  if (db <= WF_FLOOR_DB) return [floor[0], floor[1], floor[2], 0];
  if (db >= WF_PEAK_DB) return [peak[0], peak[1], peak[2], 255];

  let i = 0;
  while (i < ramp.length - 1 && ramp[i + 1]!.db < db) i++;
  const a = ramp[i]!;
  const b = ramp[Math.min(i + 1, ramp.length - 1)]!;
  const seg = b.db - a.db;
  return mix(a.rgb, b.rgb, seg <= 1e-9 ? 0 : (db - a.db) / seg);
}

function parseCssColor(c: string): [number, number, number] {
  const raw = c.trim();
  if (raw.startsWith('#') && (raw.length === 7 || raw.length === 4)) {
    const s = raw.slice(1);
    if (s.length === 3) {
      return [
        parseInt(s[0] + s[0], 16),
        parseInt(s[1] + s[1], 16),
        parseInt(s[2] + s[2], 16),
      ];
    }
    return [
      parseInt(s.slice(0, 2), 16),
      parseInt(s.slice(2, 4), 16),
      parseInt(s.slice(4, 6), 16),
    ];
  }
  const rgb = raw.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  // Theme accents are often hsl(); getPropertyValue does not resolve them.
  if (typeof document !== 'undefined') {
    const probe = document.createElement('span');
    probe.style.color = raw;
    document.documentElement.appendChild(probe);
    const computed = getComputedStyle(probe).color;
    probe.remove();
    const m = computed.match(
      /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i,
    );
    if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  return [0, 102, 255];
}

export interface SpectrumChartProps {
  data$: DynamicValue<number[]>;
  /** 0…4 — Average / Max / Stereo / Difference / Spectralizer */
  mode: number;
  /** 0 Linear / 1 −3 dB/oct / 2 −4.5 dB/oct */
  scale?: number;
  hold: boolean;
  /**
   * Monitor layout: L, R, slow RMS and latched peak together.
   * Waterfall still uses `mode === Spectralizer`.
   */
  monitor?: boolean;
  vizId?: string;
  className?: string;
}

/**
 * Spectrum analyzer chart. Curve modes use AUX Chart; Spectralizer is a
 * scrolling canvas waterfall (freq → x, time scrolls up).
 */
export function SpectrumChart(props: SpectrumChartProps) {
  const {
    data$,
    mode,
    scale = 0,
    hold,
    monitor = false,
    vizId = SPECTRUM_VIZ_ID,
    className,
  } = props;

  const specVis = useMemo(() => {
    const vis = {} as Record<
      SpectrumTraceId,
      ReturnType<typeof persistedHistoryVisible$>
    >;
    for (const id of Object.keys(
      ANALYZER_SPECTRUM_TOGGLES,
    ) as SpectrumTraceId[]) {
      vis[id] = persistedHistoryVisible$(
        'analyzer',
        id,
        ANALYZER_SPECTRUM_TOGGLES[id],
      );
    }
    return vis;
  }, []);
  const specVisRef = useRef(specVis);
  specVisRef.current = specVis;

  const chartRef = useRef<AuxChartInstance | null>(null);
  const graphsRef = useRef<AuxGraph[]>([]);
  const graphBindingsRef = useRef<Bindings | null>(null);
  const resizeRoRef = useRef<ResizeObserver | null>(null);
  // High-rate spectrum → AUX/canvas only (no React re-render from data$).
  const dataLatestRef = useRef<number[]>(EMPTY_SPECTRUM);
  /** Rim understroke follows L at night and R in day. */
  const themeModeRef = useRef(themeMode$.value);
  const modeRef = useRef(mode);
  const holdRef = useRef(hold);
  const monitorRef = useRef(monitor);
  monitorRef.current = monitor;
  const scaleRef = useRef(scale);
  const chartWidthRef = useRef(0);
  const chartHeightRef = useRef(0);
  const diffSmoothRef = useRef<Float32Array | null>(null);
  modeRef.current = mode;
  holdRef.current = hold;
  scaleRef.current = scale;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waterfallRef = useRef<ImageData | null>(null);

  const [chartSvg, setChartSvg] = useState<SVGSVGElement | null>(null);
  const [gradTargets, setGradTargets] = useState<SVGElement[]>([]);
  const corridorElRef = useRef<HTMLDivElement | null>(null);
  const isSpectralizer = Math.round(mode) === SPECTRUM_MODE.Spectralizer;
  const isStereo = Math.round(mode) === SPECTRUM_MODE.Stereo;
  // Average/Max (+ monitor RMS body): level hue. Stereo L/R stay solid accent/warn.
  // Analyzer uses monitor+Stereo — still need CSS vars for the RMS fill/stroke.
  const useLevelGrad = !isSpectralizer && (!isStereo || monitor);

  const reassert = useChartGradient({
    svg: chartSvg,
    enabled: useLevelGrad,
    // Both paints: fill-gradient + stroke-gradient (CSS + inline on targets).
    targets: gradTargets,
    paint: 'fill',
  });
  const reassertRef = useRef(reassert);
  reassertRef.current = reassert;

  const sendVizBins = useCallback(
    (el: Element) => {
      const box = el.getBoundingClientRect();
      const width = Math.round(box.width);
      chartWidthRef.current = Math.max(1, width);
      chartHeightRef.current = Math.max(1, Math.round(box.height));
      const next = Math.max(
        SPECTRUM_MIN_BINS,
        Math.min(SPECTRUM_MAX_BINS, width),
      );
      postToHost({ t: 'vizcfg', id: vizId, bins: next });
    },
    [vizId],
  );

  const paintWaterfall = useCallback(
    (payload: SpectrumPayload, slope: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const cssW = Math.max(1, Math.floor(canvas.clientWidth));
      const cssH = Math.max(1, Math.floor(canvas.clientHeight));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(cssW * dpr));
      const h = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        waterfallRef.current = null;
      }

      let img = waterfallRef.current;
      if (!img || img.width !== w || img.height !== h) {
        img = ctx.createImageData(w, h);
        waterfallRef.current = img;
      }

      // Scroll existing pixels up by 1 row.
      const rowBytes = w * 4;
      img.data.copyWithin(0, rowBytes);
      // Clear bottom row (will fill with new spectrum).
      img.data.fill(0, (h - 1) * rowBytes);

      const theme = themeGradientStops(themeColors$.value);
      const day = themeModeRef.current === 'day';
      const n = payload.bins;
      const y0 = (h - 1) * rowBytes;
      const slotT = payload.t;

      for (let x = 0; x < w; ++x) {
        const frac = x / w;
        let bin = Math.min(n - 1, Math.floor(frac * n));
        if (slotT && slotT.length === n) {
          let lo = 0;
          let hi = n - 1;
          while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if ((slotT[mid] ?? 1) <= frac) lo = mid;
            else hi = mid - 1;
          }
          bin = lo;
        }
        const raw = payload.avg[bin] ?? SPECTRUM_DSP_FLOOR_DB;
        const db = tiltDb(
          raw,
          slotT ? tToHz(slotT[bin] ?? 0) : binToHz(bin, n),
          slope,
        );
        const [r, g, b, a] = waterfallPixel(db, theme, day);
        const i = y0 + x * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = a;
      }

      ctx.putImageData(img, 0, 0);
    },
    [],
  );

  const buildPoints = useCallback(
    (raw: number[]): { x: number; y: number }[] | null => {
      const m = Math.round(modeRef.current);
      const slope = slopeDbPerOct(scaleRef.current);
      const graphs = graphsRef.current;
      const dvs = specVisRef.current;
      const vis = {
        l: !!dvs.l.value,
        r: !!dvs.r.value,
        rms: !!dvs.rms.value,
        hold: !!dvs.hold.value,
      };
      if (monitorRef.current && graphs.length >= 5) {
        const [gRms, gLRim, gL, gR, gMax] = graphs;
        const rimOnR = themeModeRef.current === 'day';
        gRms?.element?.classList.toggle('spec-hidden', !vis.rms);
        gLRim?.element?.classList.toggle(
          'spec-hidden',
          rimOnR ? !vis.r : !vis.l,
        );
        gL?.element?.classList.toggle('spec-hidden', !vis.l);
        gR?.element?.classList.toggle('spec-hidden', !vis.r);
        gMax?.element?.classList.toggle('spec-hidden', !vis.hold);
      }
      const payload = parseSpectrumPayload(raw);
      if (!payload) return null;

      if (m === SPECTRUM_MODE.Spectralizer) {
        paintWaterfall(payload, slope);
        if (corridorElRef.current) corridorElRef.current.hidden = true;
        return null;
      }

      const chart = chartRef.current;
      if (!chart || chart.isDestructed?.()) return null;

      chart.set('range_x', { min: 0, max: 1 });
      chart.set('grid_x', buildFreqGridX(1));

      const showHold = holdRef.current || payload.hold;

      if (m === SPECTRUM_MODE.Difference) {
        chart.set('range_y', { min: -24, max: 24 });
        chart.set('grid_y', buildDbGridY(-24, 24, 6, 12));
      } else {
        chart.set('range_y', { min: SPECTRUM_DB_MIN, max: SPECTRUM_DB_MAX });
        chart.set(
          'grid_y',
          buildDbGridY(SPECTRUM_DB_MIN, SPECTRUM_DB_MAX, DB_GRID, DB_LABEL),
        );
      }

      if (monitorRef.current && m !== SPECTRUM_MODE.Spectralizer) {
        // [rms, rim, L, R, max] — same understroke; L dots at night, R dots in day.
        const [gRms, gLRim, gL, gR, gMax] = graphs;
        gMax?.element?.classList.remove('spec-diff');
        chart.set('range_y', { min: SPECTRUM_DB_MIN, max: SPECTRUM_DB_MAX });
        chart.set(
          'grid_y',
          buildDbGridY(SPECTRUM_DB_MIN, SPECTRUM_DB_MAX, DB_GRID, DB_LABEL),
        );
        const width = chartWidthRef.current;
        const pxPerY =
          chartHeightRef.current > 8
            ? chartHeightRef.current / (SPECTRUM_DB_MAX - SPECTRUM_DB_MIN)
            : 0;
        const dots = (data: Float32Array, s = slope) =>
          seriesDots(
            data,
            payload.t,
            payload.bins,
            SPECTRUM_DB_MIN,
            SPECTRUM_DB_MAX,
            s,
            width,
            pxPerY,
          );
        const show = (
          g: AuxGraph | undefined,
          on: boolean,
          pts: ReturnType<typeof dots> | null,
        ) => {
          g?.set('dots', on ? pts : null);
          g?.element?.classList.toggle('spec-hidden', !on);
        };
        const rms = payload.rms ?? payload.avg;
        const lDots = vis.l ? dots(payload.L, slope) : null;
        const rDots = vis.r ? dots(payload.R, slope) : null;
        const rmsDots = vis.rms ? dots(rms, slope) : null;
        const rimOnR = themeModeRef.current === 'day';
        show(gLRim, rimOnR ? vis.r : vis.l, rimOnR ? rDots : lDots);
        show(gL, vis.l, lDots);
        show(gR, vis.r, rDots);
        show(gMax, vis.hold, vis.hold ? dots(payload.max, slope) : null);
        show(gRms, vis.rms, rmsDots);
        const band = corridorElRef.current;
        if (band && slope > 0) {
          const center = midbandMean(rms, payload.t, payload.bins, slope);
          const st = corridorBandStyle(center, CORRIDOR_HALF_DB);
          band.hidden = false;
          band.style.top = st.top;
          band.style.height = st.height;
        } else if (band) {
          band.hidden = true;
        }
        if (vis.hold) gMax?.toFront?.();
        reassertRef.current();
        return rmsDots;
      }

      const [g0, g1, gHold, gPeak] = graphs;
      if (m !== SPECTRUM_MODE.Difference)
        (gPeak ?? gHold)?.element?.classList.remove('spec-diff');

      let primary: { x: number; y: number }[] | null = null;
      g1?.set('dots', null);
      gHold?.set('dots', null);

      const width = chartWidthRef.current;
      const dots = (
        data: Float32Array,
        yMin = SPECTRUM_DB_MIN,
        yMax = SPECTRUM_DB_MAX,
        s = slope,
      ) =>
        seriesDots(
          data,
          payload.t,
          payload.bins,
          yMin,
          yMax,
          s,
          width,
          chartHeightRef.current > 8 && yMax > yMin
            ? chartHeightRef.current / (yMax - yMin)
            : 0,
        );

      if (m === SPECTRUM_MODE.Average) {
        primary = dots(payload.avg);
        if (showHold) gHold?.set('dots', dots(payload.max));
      } else if (m === SPECTRUM_MODE.Max) {
        primary = dots(payload.max);
      } else if (m === SPECTRUM_MODE.Stereo) {
        primary = dots(payload.L);
        g1?.set('dots', dots(payload.R));
        if (showHold) gHold?.set('dots', dots(payload.max));
      } else if (m === SPECTRUM_MODE.Difference) {
        let smooth = diffSmoothRef.current;
        if (!smooth || smooth.length !== payload.bins) {
          smooth = new Float32Array(payload.bins);
          diffSmoothRef.current = smooth;
        }
        for (let i = 0; i < payload.bins; ++i) {
          const d =
            (payload.L[i] ?? SPECTRUM_DSP_FLOOR_DB) -
            (payload.R[i] ?? SPECTRUM_DSP_FLOOR_DB);
          smooth[i] = DIFF_EMA * smooth[i]! + (1 - DIFF_EMA) * d;
        }
        gHold?.set('dots', dots(smooth, -24, 24, 0));
        gHold?.element?.classList.add('spec-diff');
        primary = null;
      }

      // Filled midband corridor in tilted Average/Max/Stereo views.
      const band = corridorElRef.current;
      if (
        band &&
        slope > 0 &&
        (m === SPECTRUM_MODE.Average ||
          m === SPECTRUM_MODE.Max ||
          m === SPECTRUM_MODE.Stereo)
      ) {
        const src = m === SPECTRUM_MODE.Max ? payload.max : payload.avg;
        const center = midbandMean(src, payload.t, payload.bins, slope);
        const st = corridorBandStyle(center, CORRIDOR_HALF_DB);
        band.hidden = false;
        band.style.top = st.top;
        band.style.height = st.height;
      } else if (band) {
        band.hidden = true;
      }

      gHold?.toFront?.();
      reassertRef.current();
      // Silence unused — Binding drives g0.dots from the return value.
      void g0;
      return primary;
    },
    [paintWaterfall],
  );

  const disposeBindings = useCallback(() => {
    graphBindingsRef.current?.dispose();
    graphBindingsRef.current = null;
  }, []);

  const attachBindings = useCallback(() => {
    disposeBindings();
    const g0 = graphsRef.current[0];
    if (!g0) return;
    // Primary Binding: returns g0 dots; siblings / waterfall / corridor via buildPoints.
    graphBindingsRef.current = bindAuxOptions(g0, [
      {
        name: 'dots',
        backendValue: data$,
        readonly: true,
        transformReceive: (raw: unknown) => {
          const next =
            Array.isArray(raw) && raw.length
              ? (raw as number[])
              : EMPTY_SPECTRUM;
          dataLatestRef.current = next;
          return buildPoints(next);
        },
      },
    ]);
  }, [data$, buildPoints, disposeBindings]);

  const detach = useCallback(() => {
    resizeRoRef.current?.disconnect();
    resizeRoRef.current = null;
    disposeBindings();
    const chart = chartRef.current;
    const graphs = graphsRef.current;
    graphsRef.current = [];
    chartRef.current = null;
    setChartSvg(null);
    setGradTargets([]);
    if (!chart || chart.isDestructed?.()) return;
    for (const g of graphs) chart.removeGraph(g);
  }, [disposeBindings]);

  const attach = useCallback(
    (chart: AuxChartInstance) => {
      chartRef.current = chart;
      if (chart.isDestructed?.()) return;

      chart.set('range_x', { min: 0, max: 1 });
      chart.set('grid_x', buildFreqGridX(1));

      // Idempotent: use-aux-widgets re-calls widgetRef when the callback
      // identity changes, without nulling the old ref — never double-add.
      if (graphsRef.current.length === 0) {
        const specs = monitorRef.current
          ? [
              {
                className:
                  'spec-rms fill-gradient fill-soft stroke-rich stroke-thinner',
                mode: 'bottom' as const,
                gradient: true,
                type: 'L',
              },
              // Same understroke style. Night feeds L dots, day feeds R dots.
              {
                className: 'spec-lr-rim fill-none',
                mode: 'line' as const,
                gradient: false,
                type: 'L',
              },
              {
                className: 'spec-primary fill-none stroke-accent stroke-medium',
                mode: 'line' as const,
                gradient: false,
                type: 'L',
              },
              {
                className: 'spec-secondary fill-none stroke-warn stroke-medium',
                mode: 'line' as const,
                gradient: false,
                type: 'L',
              },
              {
                className:
                  'spec-hold fill-none stroke-color stroke-soft stroke-thicker',
                mode: 'line' as const,
                gradient: false,
                type: 'L',
              },
            ]
          : [
              // L + Y-smooth + densify. AUX T (quadratic Bézier) grain/rings on dense dots.
              {
                className:
                  'spec-primary fill-gradient fill-ghost stroke-gradient',
                mode: 'bottom' as const,
                gradient: true,
                type: 'L',
              },
              {
                className: 'spec-secondary fill-color fill-ghost stroke-color',
                mode: 'bottom' as const,
                gradient: false,
                type: 'L',
              },
              {
                className:
                  'spec-hold fill-none stroke-color stroke-thinner stroke-full stroke-dashed',
                mode: 'line' as const,
                gradient: false,
                type: 'L',
              },
            ];
        const aux: AuxGraph[] = [];
        const grads: SVGElement[] = [];
        for (const spec of specs) {
          const g = chart.addGraph({
            dots: null,
            type: spec.type,
            mode: spec.mode,
            class: spec.className.split(/\s+/)[0] ?? '',
          });
          g.element?.classList.add(
            ...spec.className.split(/\s+/).filter(Boolean),
          );
          if (spec.gradient && g.element) grads.push(g.element);
          aux.push(g);
        }
        graphsRef.current = aux;
        setGradTargets(grads);
      }

      setChartSvg(chart.svg ?? null);
      attachBindings();

      if (!resizeRoRef.current) {
        const el = chart.element ?? chart.svg;
        if (el) {
          sendVizBins(el);
          let raf = 0;
          const ro = new ResizeObserver(() => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => sendVizBins(el));
          });
          ro.observe(el);
          resizeRoRef.current = ro;
        }
      }
    },
    [attachBindings, sendVizBins],
  );

  /** Spectralizer: AUX Chart used only as frequency/dB grid overlay. */
  const gridAttach = useCallback((chart: AuxChartInstance) => {
    if (chart.isDestructed?.()) return;
    chart.set('range_x', { min: 0, max: 1 });
    chart.set('grid_x', buildFreqGridX(1));
    chart.set('range_y', { min: SPECTRUM_DB_MIN, max: SPECTRUM_DB_MAX });
    chart.set(
      'grid_y',
      buildDbGridY(SPECTRUM_DB_MIN, SPECTRUM_DB_MAX, DB_GRID, DB_LABEL),
    );
    chart.set('show_grid', true);
  }, []);

  const gridWidgetRef = useCallback(
    (chart: AuxChartInstance | null) => {
      if (chart) gridAttach(chart);
    },
    [gridAttach],
  );

  const widgetRef = useCallback(
    (chart: AuxChartInstance | null) => {
      if (!chart) {
        detach();
        return;
      }
      attach(chart);
    },
    [attach, detach],
  );

  // Mode / hold / scale: re-paint last buffer (Binding only fires on data$).
  useEffect(() => {
    buildPoints(dataLatestRef.current);
  }, [mode, hold, scale, buildPoints]);

  // Rim follows L at night and R in day — repaint without a React render.
  useEffect(() => {
    const unsub = themeMode$.subscribe((mode) => {
      themeModeRef.current = mode;
      buildPoints(dataLatestRef.current);
    });
    return unsub;
  }, [buildPoints]);

  // Monitor trace chips — AWML DVs, no React re-render on toggle.
  useEffect(() => {
    if (!monitor) return;
    const unsubs = SPECTRUM_TRACE_CHIPS.map(({ id }) =>
      specVis[id].subscribe(() => {
        buildPoints(dataLatestRef.current);
      }),
    );
    return () => {
      for (const u of unsubs) u();
    };
  }, [monitor, specVis, buildPoints]);

  // Re-attach Binding when data$ / paint identity changes (curve modes only).
  useEffect(() => {
    if (isSpectralizer || !graphsRef.current[0]) return;
    attachBindings();
  }, [attachBindings, isSpectralizer]);

  // Spectralizer: canvas only — no AUX graph for Bindings; subscribe → paint.
  useEffect(() => {
    if (!isSpectralizer) return;
    disposeBindings();
    let raf = 0;
    const unsub = data$.subscribe((raw: number[]) => {
      const next = Array.isArray(raw) && raw.length ? raw : EMPTY_SPECTRUM;
      dataLatestRef.current = next;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        buildPoints(dataLatestRef.current);
      });
    }, true);
    return () => {
      unsub();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isSpectralizer, data$, buildPoints, disposeBindings]);

  useEffect(() => () => detach(), [detach]);

  // Waterfall: also listen for canvas size / theme and request bins from canvas.
  useEffect(() => {
    if (!isSpectralizer) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    sendVizBins(canvas);
    const ro = new ResizeObserver(() => {
      waterfallRef.current = null;
      sendVizBins(canvas);
      buildPoints(dataLatestRef.current);
    });
    ro.observe(canvas);
    const unsubTheme = themeColors$.subscribe(() => {
      waterfallRef.current = null;
    });
    return () => {
      ro.disconnect();
      unsubTheme();
    };
  }, [isSpectralizer, sendVizBins, buildPoints]);

  const viewClass = useMemo(() => {
    const m = Math.round(mode);
    if (monitor && m !== SPECTRUM_MODE.Spectralizer) return 'view-monitor';
    if (m === SPECTRUM_MODE.Stereo) return 'view-stereo';
    if (m === SPECTRUM_MODE.Difference) return 'view-difference';
    if (m === SPECTRUM_MODE.Spectralizer) return 'view-spectralizer';
    // Average + Max: one primary curve
    return 'view-single';
  }, [mode, monitor]);

  const modeClass = useMemo(() => {
    switch (Math.round(mode)) {
      case SPECTRUM_MODE.Max:
        return 'mode-max';
      case SPECTRUM_MODE.Stereo:
        return 'mode-stereo';
      case SPECTRUM_MODE.Difference:
        return 'mode-difference';
      case SPECTRUM_MODE.Spectralizer:
        return 'mode-spectralizer';
      case SPECTRUM_MODE.Average:
      default:
        return 'mode-average';
    }
  }, [mode]);

  const cls = useMemo(
    () =>
      ['SpectrumChart', viewClass, modeClass, className ?? '']
        .filter(Boolean)
        .join(' '),
    [className, modeClass, viewClass],
  );

  return (
    <div className={cls}>
      {!isSpectralizer && (
        <>
          <ChartWidget className="SpectrumChart-aux" widgetRef={widgetRef} />
          <div
            ref={corridorElRef}
            className="spec-corridor-fill"
            hidden
            aria-hidden
          />
          <div className="spectrum-toggles">
            {SPECTRUM_TRACE_CHIPS.map((chip) => (
              <Toggle
                key={chip.id}
                state$={specVis[chip.id]}
                label={chip.short}
                title={chip.name}
              />
            ))}
          </div>
        </>
      )}
      {isSpectralizer && (
        <>
          <canvas
            ref={canvasRef}
            className="SpectrumChart-waterfall"
            aria-label="Spectralizer"
          />
          <ChartWidget
            className="SpectrumChart-gridOverlay"
            widgetRef={gridWidgetRef}
          />
        </>
      )}
    </div>
  );
}
