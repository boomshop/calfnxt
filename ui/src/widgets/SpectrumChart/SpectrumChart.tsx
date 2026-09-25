import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import type { Bindings } from '@deutschesoft/awml/src/bindings.js';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { bindAuxOptions } from '../../utils/aux_bindings';
import { postToHost } from '../../utils/bridge';
import { useChartGradient } from '../../hooks/useChartGradient';
import { themeColors$ } from '../../theme/themeColors';
import {
  SPECTRUM_MAX_BINS,
  SPECTRUM_MIN_BINS,
} from '../../utils/spectrum_bins';
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
  const lines: { pos: number; label?: string; class?: string }[] = [];
  const start = Math.ceil(min / step) * step;
  for (let db = start; db <= max; db += step) {
    const major = db % labelStep === 0;
    const base = db === 0;
    const cls = '' + (major ? 'major ' : '') + (base ? 'base' : '');
    lines.push({
      pos: db,
      label: major ? `${db}` : undefined,
      class: cls,
    });
  }
  return lines;
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
};

export function parseSpectrumPayload(
  v: number[] | null | undefined,
): SpectrumPayload | null {
  if (!v || v.length < 2) return null;
  const bins = Math.max(1, Math.min(SPECTRUM_MAX_BINS, Math.round(v[0] ?? 0)));
  const need = 2 + 4 * bins;
  if (v.length < need) return null;
  return {
    bins,
    hold: (v[1] ?? 0) >= 0.5,
    avg: Float32Array.from(v.slice(2, 2 + bins)),
    max: Float32Array.from(v.slice(2 + bins, 2 + 2 * bins)),
    L: Float32Array.from(v.slice(2 + 2 * bins, 2 + 3 * bins)),
    R: Float32Array.from(v.slice(2 + 3 * bins, 2 + 4 * bins)),
    rms:
      v.length >= 2 + 5 * bins
        ? Float32Array.from(v.slice(2 + 4 * bins, 2 + 5 * bins))
        : null,
  };
}

/** Extra bin-units past [0, bins] so mode=bottom vertical closers are clipped. */
const SERIES_EDGE_PAD = 1.25;

/**
 * Display-only soften of log-bin stairs.
 *
 * Chart X is linear in bin index (= log-Hz). A 3/5-tap pass mixes neighbours.
 * Passes nest from a wide light polish down into a heavy LF zone. Fractions are
 * true log-Hz cuts (0.22 ≈ 90 Hz — not 700 Hz); the old “22 %” nest never
 * reached the 100…800 Hz stairs.
 *
 * `hz` unused (API stable for call sites).
 */
export function smoothSeriesY(
  ys: number[],
  _hz?: readonly number[],
  pxPerBin = 1,
): number[] {
  if (ys.length < 3) return ys;
  // ~1 DSP log-bin per CSS pixel → keep values as published.
  if (!(pxPerBin > 1.05)) return ys;

  const n = ys.length;
  const logSpan = Math.log(F_MAX / F_MIN);
  const fracAt = (hz: number) =>
    Math.log(Math.min(F_MAX, Math.max(F_MIN, hz)) / F_MIN) / logSpan;

  // Heavy zone through the visible bass stairs (~20…~1 kHz).
  const lfEnd = Math.max(8, Math.round(n * fracAt(1000)));
  // Light polish up into the lower highs (~6 kHz); leave HF needles alone.
  const midEnd = Math.max(lfEnd + 4, Math.round(n * fracAt(6000)));

  let cur = ys.slice();

  // --- A: break LF plateaus (needs many full-weight rounds + wider tap) ---
  const lfPasses = Math.min(12, Math.max(5, Math.round(pxPerBin * 4)));
  const lfW = Math.min(1, 0.82 + 0.12 * Math.min(1, pxPerBin - 1));
  const lfFade = Math.max(6, Math.round(lfEnd * 0.18));
  for (let p = 0; p < lfPasses; ++p) {
    const next = cur.slice();
    const wide = p >= 2;
    for (let i = 1; i < n - 1; ++i) {
      if (i >= lfEnd) continue;
      let w = lfW;
      if (i > lfEnd - lfFade) {
        w *= 1 - (i - (lfEnd - lfFade)) / lfFade;
      }
      // Stronger toward DC.
      const t = i / lfEnd;
      w *= 1 - 0.35 * t * t;
      if (!(w > 0.04)) continue;
      let avg: number;
      if (wide && i >= 2 && i < n - 2) {
        avg =
          (cur[i - 2]! +
            4 * cur[i - 1]! +
            6 * cur[i]! +
            4 * cur[i + 1]! +
            cur[i + 2]!) /
          16;
      } else {
        avg = 0.25 * cur[i - 1]! + 0.5 * cur[i]! + 0.25 * cur[i + 1]!;
      }
      next[i] = cur[i]! * (1 - w) + avg * w;
    }
    cur = next;
  }

  // --- B: light mid polish (stairs between ~1…6 kHz) ---
  const midPasses = Math.min(4, Math.max(1, Math.round(pxPerBin)));
  const midW = Math.min(0.55, 0.28 + 0.12 * pxPerBin);
  for (let p = 0; p < midPasses; ++p) {
    const next = cur.slice();
    for (let i = 1; i < n - 1; ++i) {
      if (i >= midEnd) continue;
      const t = i / midEnd;
      const w = midW * (1 - t * t);
      if (!(w > 0.04)) continue;
      const avg = 0.25 * cur[i - 1]! + 0.5 * cur[i]! + 0.25 * cur[i + 1]!;
      next[i] = cur[i]! * (1 - w) + avg * w;
    }
    cur = next;
  }

  return cur;
}

/** CSS pixels per DSP log-bin (1 = pixel-accurate). */
export function spectrumPxPerBin(cssWidth: number, bins: number): number {
  const n = Math.max(1, bins);
  const w = Math.max(1, cssWidth);
  // Pre-layout stubs (chartWidthRef init 128 while bins already 512) yield
  // px/bin ≪ 1 → smoothSeriesY + catmullRomDensify both no-op. Until the
  // ResizeObserver measures, assume the design editor width (~1024 CSS px).
  if (w * 1.15 < n) return 1024 / n;
  return w / n;
}

export function seriesDots(
  data: Float32Array,
  bins: number,
  yMin = SPECTRUM_DB_MIN,
  yMax = SPECTRUM_DB_MAX,
  slope = 0,
  pxPerBin = 1,
): { x: number; y: number }[] {
  if (bins < 1) return [];
  const ys: number[] = [];
  const hz: number[] = [];
  for (let i = 0; i < bins; ++i) {
    const f = binToHz(i, bins);
    const raw = data[i] ?? SPECTRUM_DSP_FLOOR_DB;
    const y = tiltDb(raw, f, slope);
    hz.push(f);
    ys.push(Math.min(yMax, Math.max(yMin, y)));
  }
  const smoothed = smoothSeriesY(ys, hz, pxPerBin);
  const first = smoothed[0]!;
  const last = smoothed[bins - 1]!;
  const mid: { x: number; y: number }[] = [];
  for (let i = 0; i < bins; ++i) mid.push({ x: i + 0.5, y: smoothed[i]! });
  // CR in bin-index space; density ≤ ~1 pt/CSS-px (see catmullRomDensify).
  const curved = catmullRomDensify(mid, pxPerBin * bins, 'linear');
  return [
    { x: -SERIES_EDGE_PAD, y: first },
    ...curved,
    { x: bins + SERIES_EDGE_PAD, y: last },
  ];
}

/** Midband mean (200 Hz…2 kHz) of tilted curve — corridor center. */
function midbandMean(data: Float32Array, bins: number, slope: number): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < bins; ++i) {
    const f = binToHz(i, bins);
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

/** Waterfall on black: −66 black, −54 accent, −32 warn, −18 white. */
const WF_BLACK_DB = -66;
const WF_ACCENT_DB = -54;
const WF_WARN_DB = -32;
const WF_WHITE_DB = -18;
const WF_BLACK: [number, number, number] = [0, 0, 0];
const WF_WHITE: [number, number, number] = [255, 255, 255];

function waterfallPixel(
  db: number,
  accent: [number, number, number],
  warn: [number, number, number],
): [number, number, number, number] {
  const mix = (
    a: [number, number, number],
    b: [number, number, number],
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
  if (db <= WF_BLACK_DB) return [0, 0, 0, 0];
  if (db >= WF_WHITE_DB) return [255, 255, 255, 255];
  if (db < WF_ACCENT_DB)
    return mix(WF_BLACK, accent, (db - WF_BLACK_DB) / (WF_ACCENT_DB - WF_BLACK_DB));
  if (db < WF_WARN_DB)
    return mix(accent, warn, (db - WF_ACCENT_DB) / (WF_WARN_DB - WF_ACCENT_DB));
  return mix(warn, WF_WHITE, (db - WF_WARN_DB) / (WF_WHITE_DB - WF_WARN_DB));
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
    const m = computed.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
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

  const chartRef = useRef<AuxChartInstance | null>(null);
  const graphsRef = useRef<AuxGraph[]>([]);
  const graphBindingsRef = useRef<Bindings | null>(null);
  const resizeRoRef = useRef<ResizeObserver | null>(null);
  // High-rate spectrum → AUX/canvas only (no React re-render from data$).
  const dataLatestRef = useRef<number[]>(EMPTY_SPECTRUM);
  const modeRef = useRef(mode);
  const holdRef = useRef(hold);
  const monitorRef = useRef(monitor);
  monitorRef.current = monitor;
  const scaleRef = useRef(scale);
  const binsRef = useRef(128);
  const chartWidthRef = useRef(0);
  const diffSmoothRef = useRef<Float32Array | null>(null);
  modeRef.current = mode;
  holdRef.current = hold;
  scaleRef.current = scale;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waterfallRef = useRef<ImageData | null>(null);

  const [chartSvg, setChartSvg] = useState<SVGSVGElement | null>(null);
  const [gradTargets, setGradTargets] = useState<SVGElement[]>([]);
  const [bins, setBins] = useState(128);
  binsRef.current = bins;
  const corridorElRef = useRef<HTMLDivElement | null>(null);
  const isSpectralizer = Math.round(mode) === SPECTRUM_MODE.Spectralizer;
  const isStereo = Math.round(mode) === SPECTRUM_MODE.Stereo;
  // Level hue gradient for Average/Max stroke; Stereo uses solid L/R colors.
  const useLevelGrad = !isSpectralizer && !isStereo;

  const reassert = useChartGradient({
    svg: chartSvg,
    enabled: useLevelGrad,
    targets: gradTargets,
    paint: 'stroke',
  });
  const reassertRef = useRef(reassert);
  reassertRef.current = reassert;

  const sendVizBins = useCallback(
    (el: Element) => {
      const width = Math.round(el.getBoundingClientRect().width);
      chartWidthRef.current = Math.max(1, width);
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

      const colors = themeColors$.value;
      const accent = parseCssColor(colors.accent);
      const warn = parseCssColor(colors.warn);
      const n = payload.bins;
      const y0 = (h - 1) * rowBytes;

      for (let x = 0; x < w; ++x) {
        const bin = Math.min(n - 1, Math.floor((x / w) * n));
        const raw = payload.avg[bin] ?? SPECTRUM_DSP_FLOOR_DB;
        const db = tiltDb(raw, binToHz(bin, n), slope);
        const [r, g, b, a] = waterfallPixel(db, accent, warn);
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
      const payload = parseSpectrumPayload(raw);
      if (!payload) return null;

      if (m === SPECTRUM_MODE.Spectralizer) {
        paintWaterfall(payload, slope);
        if (corridorElRef.current) corridorElRef.current.hidden = true;
        return null;
      }

      const chart = chartRef.current;
      const graphs = graphsRef.current;
      if (!chart || chart.isDestructed?.()) return null;

      if (payload.bins !== binsRef.current) {
        binsRef.current = payload.bins;
        setBins(payload.bins);
        chart.set('range_x', { min: 0, max: payload.bins });
        chart.set('grid_x', buildFreqGridX(payload.bins));
      }

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

      const [g0, g1, gHold, gPeak] = graphs;
      if (m !== SPECTRUM_MODE.Difference)
        (gPeak ?? gHold)?.element?.classList.remove('spec-diff');

      if (monitorRef.current && m !== SPECTRUM_MODE.Spectralizer) {
        chart.set('range_y', { min: SPECTRUM_DB_MIN, max: SPECTRUM_DB_MAX });
        chart.set(
          'grid_y',
          buildDbGridY(SPECTRUM_DB_MIN, SPECTRUM_DB_MAX, DB_GRID, DB_LABEL),
        );
        const px = spectrumPxPerBin(chartWidthRef.current, payload.bins);
        const dots = (data: Float32Array, s = slope) =>
          seriesDots(
            data,
            payload.bins,
            SPECTRUM_DB_MIN,
            SPECTRUM_DB_MAX,
            s,
            px,
          );
        const rms = payload.rms ?? payload.avg;
        g1?.set('dots', dots(payload.L, slope));
        gHold?.set('dots', dots(payload.R, slope));
        gPeak?.set('dots', dots(payload.max, slope));
        const band = corridorElRef.current;
        if (band && slope > 0) {
          const center = midbandMean(rms, payload.bins, slope);
          const st = corridorBandStyle(center, CORRIDOR_HALF_DB);
          band.hidden = false;
          band.style.top = st.top;
          band.style.height = st.height;
        } else if (band) {
          band.hidden = true;
        }
        gPeak?.toFront?.();
        reassertRef.current();
        return dots(rms, slope);
      }

      let primary: { x: number; y: number }[] | null = null;
      g1?.set('dots', null);
      gHold?.set('dots', null);

      const px = spectrumPxPerBin(chartWidthRef.current, payload.bins);
      const dots = (
        data: Float32Array,
        yMin = SPECTRUM_DB_MIN,
        yMax = SPECTRUM_DB_MAX,
        s = slope,
      ) => seriesDots(data, payload.bins, yMin, yMax, s, px);

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
        const center = midbandMean(src, payload.bins, slope);
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

      const b = binsRef.current;
      chart.set('range_x', { min: 0, max: b });
      chart.set('grid_x', buildFreqGridX(b));

      // Idempotent: use-aux-widgets re-calls widgetRef when the callback
      // identity changes, without nulling the old ref — never double-add.
      if (graphsRef.current.length === 0) {
        const specs = monitorRef.current
          ? [
              {
                className: 'spec-rms',
                mode: 'line' as const,
                gradient: false,
                type: 'L',
              },
              {
                className: 'spec-primary',
                mode: 'line' as const,
                gradient: false,
                type: 'L',
              },
              {
                className: 'spec-secondary',
                mode: 'line' as const,
                gradient: false,
                type: 'L',
              },
              {
                className: 'spec-hold',
                mode: 'line' as const,
                gradient: false,
                type: 'L',
              },
            ]
          : [
              // L + Y-smooth + densify. AUX T (quadratic Bézier) grain/rings on dense dots.
              {
                className: 'spec-primary',
                mode: 'bottom' as const,
                gradient: true,
                type: 'L',
              },
              {
                className: 'spec-secondary',
                mode: 'bottom' as const,
                gradient: false,
                type: 'L',
              },
              {
                className: 'spec-hold',
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
            class: spec.className,
          });
          g.element?.classList.add(spec.className);
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
    const b = binsRef.current;
    chart.set('range_x', { min: 0, max: b });
    chart.set('grid_x', buildFreqGridX(b));
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
