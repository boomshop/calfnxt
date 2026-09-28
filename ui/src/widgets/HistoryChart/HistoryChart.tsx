import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import { DynamicValue } from '@deutschesoft/awml';
import type { Bindings } from '@deutschesoft/awml/src/bindings.js';
import {
  componentFromWidget,
  useDynamicValueReadonly,
} from '@deutschesoft/use-aux-widgets';
import { bindAuxOptions } from '../../utils/aux_bindings';
import { postToHost } from '../../utils/bridge';
import { useChartGradient } from '../../hooks/useChartGradient';
import { addGraphClasses } from '../../styles/graphStyles';
import {
  AUTO_SCALE_HARD_MIN,
  ChartYAutoScale,
} from '../../utils/chartAutoScale';
import { Toggle } from '../Toggle';
import './HistoryChart.scss';

export {
  HISTORY_STYLE,
  GRAPH_STYLE,
  addGraphClasses,
} from '../../styles/graphStyles';

const DB_MAX = 0;
/** Default fixed range when `autoScale` is off (Analyzer / …). */
const DB_MIN = -48;
const DB_GRID = 6;
const DB_LABEL = 12;

/** Fixed history window (ms) — keep in sync with DSP history display. */
export const HISTORY_CHART_MS = 10000;
const HISTORY_GRID_STEP_MS = 1000;

/** AUX Graph drawing modes (see aux-widgets Graph `options.mode`). */
export type HistoryGraphMode =
  | 'line'
  | 'bottom'
  | 'top'
  | 'center'
  | 'base'
  | 'fill';

/** One announced series on the interleaved history blob. */
export type HistorySeries = {
  /** Stable key (reconcile / legend). */
  id: string;
  /** Full label (tip / a11y). */
  name: string;
  /** Short legend / toggle label. */
  short: string;
  /** Channel index in `data$` (`[ch0…chN] × slots` + optional phase). */
  channel: number;
  /**
   * Optional second amplitude channel: closed fill between `transform(channel)`
   * (upper) and `transform(diffChannel)` (lower) — “cut tips” (input − output).
   * Ignored when `diffGrChannel` is set.
   */
  diffChannel?: number;
  /**
   * Optional GR (linear) channel paired with `channel`:
   * - `attenuate` (default): upper = channel, lower = channel × gr
   * - `expand`: upper = channel / gr, lower = channel
   *   (channel = post-GR peak without makeup/mix; tip height = GR in dB)
   */
  diffGrChannel?: number;
  diffGrMode?: 'attenuate' | 'expand';
  /**
   * Single-envelope GR scale (not cut tips). With `mode: 'bottom'` this plots
   * the full pre/post level: expand → channel/gr, attenuate → channel×gr.
   * Mutually exclusive with `diffChannel` / `diffGrChannel`.
   */
  scaleGrChannel?: number;
  scaleGrMode?: 'attenuate' | 'expand';
  /**
   * Graph utility classes from `styles/graph.scss`, e.g.
   * `"stroke-thin stroke-accent fill-faint"`.
   */
  className?: string;
  /** AUX path mode. Default `bottom`. Cut-tips series should use `fill`. */
  mode?: HistoryGraphMode;
  /** Map blob sample → plot Y (default: linear amplitude → dB). */
  transform?: (value: number) => number;
  /** Raise this series after attach. */
  toFront?: boolean;
  /**
   * Install the vertical accent→warn paint server on the chart SVG.
   * Also implied when `className` contains `stroke-gradient` / `fill-gradient`
   * / `*-grad-light` (non-inv). Style the path with those utilities.
   */
  gradient?: boolean;
  /**
   * When false, series is out of the current context — no path, no toggle.
   * Default: always listed.
   */
  listed$?: DynamicValue<boolean>;
  /**
   * User / host visibility within a listed series. Default: visible.
   * Toggle chrome (when `toggle`) writes this value.
   */
  visible$?: DynamicValue<boolean>;
  /** Show a legend chip that toggles `visible$`. */
  toggle?: boolean;
  /**
   * When set to a finite number, draw a horizontal line at that dB and ignore
   * the blob channel (e.g. Inv threshold while on an Inv panel). `null` /
   * undefined → normal channel transform.
   */
  flatDb$?: DynamicValue<number | null>;
};

export interface HistoryChartProps {
  data$: DynamicValue<Float32Array | null>;
  /**
   * Full announcement of every series the blob can drive. Visibility is
   * controlled per series via `listed$` / `visible$` — do not remount for
   * panel switches.
   */
  series: HistorySeries[];
  /** Host vizcfg / envelope stream id (e.g. `"comp"`, `"deess"`). */
  vizId: string;
  windowMs?: number;
  /**
   * When the blob still spans a longer capture than `windowMs` (legacy DSP /
   * fixtures), keep only the newest `windowMs/sourceWindowMs` fraction of
   * slots and stretch that across the axis — right-aligned clip.
   */
  sourceWindowMs?: number;
  /**
   * Fixed spacing between samples. Partial buffers then sit at “now”
   * (the right edge) instead of being stretched across `windowMs`.
   */
  slotMs?: number;
  /**
   * Plot range in dB when `autoScale` is off.
   * Defaults to −48…0 (peaks and gain reduction).
   */
  dbMin?: number;
  dbMax?: number;
  /**
   * Follow all series Y values with a floor envelope (fast down, slow up),
   * snapped to 6 dB steps within −60…−12. Ready for Limiter / Mbcomp / …
   */
  autoScale?: boolean;
  className?: string;
}

function buildDbGridY(min: number, max: number, step: number, labelStep: number) {
  const lines: { pos: number; label?: string; class?: string }[] = [];
  const start = Math.ceil(min / step) * step;
  for (let db = start; db <= max; db += step) {
    const major = db % labelStep === 0;
    lines.push({
      pos: db,
      label: major ? `${db}` : undefined,
      class: major ? 'major' : undefined,
    });
  }
  return lines;
}

function buildTimeGridX(displayMs: number) {
  const step = HISTORY_GRID_STEP_MS;
  const lines: { pos: number; label?: string; class?: string }[] = [];
  for (let t = displayMs; t >= -1e-9; t -= step) {
    const pos = Math.round(t);
    const major = pos === 0 || pos === displayMs || pos % (step * 2) === 0;
    lines.push({
      pos,
      label: major ? (pos >= 1000 ? `${pos / 1000}s` : `${pos}`) : undefined,
      class: major ? 'major' : undefined,
    });
  }
  return lines;
}

/** Default: linear amplitude → dB (peaks and GR lin). Hard floor −60. */
export function historyLinToDb(lin: number): number {
  if (!(lin > 1e-12)) return AUTO_SCALE_HARD_MIN;
  return Math.max(
    AUTO_SCALE_HARD_MIN,
    Math.min(DB_MAX, 20 * Math.log10(lin)),
  );
}

function wantsGradient(spec: HistorySeries): boolean {
  if (spec.gradient) return true;
  const cls = spec.className ?? '';
  return (
    /\bstroke-gradient\b/.test(cls) ||
    /\bfill-gradient\b/.test(cls) ||
    /\bstroke-grad-light\b/.test(cls) ||
    /\bfill-grad-light\b/.test(cls)
  );
}

/** Inline stroke paint targets — fill grads use CSS vars only. */
function wantsStrokeGradientPaint(spec: HistorySeries): boolean {
  const cls = spec.className ?? '';
  return (
    /\bstroke-gradient\b/.test(cls) || /\bstroke-grad-light\b/.test(cls)
  );
}

function isCutTipsSeries(spec: HistorySeries): boolean {
  return spec.diffChannel != null || spec.diffGrChannel != null;
}

/**
 * Deepest plotted Y across all listed+visible series (cut tips: both edges).
 *
 * Returns `null` when there is no buffer yet (studio / first paint) so the
 * floor envelope does not lock onto −60 and then crawl up via slow release.
 *
 * Near-zero lin maps to HARD_MIN (−60) for drawing; those silence sentinels are
 * skipped for auto-scale when any real sample exists — otherwise sparse zeros
 * in the 10 s window yank the floor with nothing visible in a zoomed range.
 * All-silence buffer → HARD_MIN.
 */
function seriesDeepestDb(
  buf: Float32Array | null,
  specs: HistorySeries[],
  nCh: number,
): number | null {
  if (!buf || nCh < 1 || buf.length < nCh) return null;

  let data = buf;
  if (buf.length % nCh === 1) data = buf.subarray(0, buf.length - 1);
  const slots = Math.floor(data.length / nCh);
  if (slots < 1) return null;

  let deepest = Infinity;
  let sawReal = false;

  const consider = (y: number) => {
    // Silence sentinel from historyLinToDb(≈0) — ignore unless buffer is empty of content.
    if (!(y > AUTO_SCALE_HARD_MIN)) return;
    sawReal = true;
    if (y < deepest) deepest = y;
  };

  for (const spec of specs) {
    const listed = spec.listed$ ? !!spec.listed$.value : true;
    const visible = spec.visible$ ? !!spec.visible$.value : true;
    if (!listed || !visible) continue;

    const transform = spec.transform ?? historyLinToDb;
    if (isCutTipsSeries(spec)) {
      const grCh = spec.diffGrChannel;
      const diffCh = spec.diffChannel;
      const grMode = spec.diffGrMode ?? 'attenuate';
      for (let i = 0; i < slots; ++i) {
        const baseLin = data[i * nCh + spec.channel] ?? 0;
        let inLin: number;
        let outLin: number;
        if (grCh != null) {
          const gr = Math.min(1, Math.max(1e-6, data[i * nCh + grCh] ?? 1));
          if (grMode === 'expand') {
            outLin = baseLin;
            inLin = baseLin / gr;
          } else {
            inLin = baseLin;
            outLin = baseLin * gr;
          }
        } else {
          inLin = baseLin;
          outLin = data[i * nCh + (diffCh as number)] ?? 0;
        }
        let yHi = transform(inLin);
        let yLo = transform(outLin);
        if (yLo > yHi) yLo = yHi;
        consider(yHi);
        consider(yLo);
      }
    } else if (spec.scaleGrChannel != null) {
      const grCh = spec.scaleGrChannel;
      const grMode = spec.scaleGrMode ?? 'attenuate';
      for (let i = 0; i < slots; ++i) {
        const baseLin = data[i * nCh + spec.channel] ?? 0;
        const gr = Math.min(1, Math.max(1e-6, data[i * nCh + grCh] ?? 1));
        const lin =
          grMode === 'expand' ? baseLin / gr : baseLin * gr;
        consider(transform(lin));
      }
    } else {
      const flat = spec.flatDb$?.value;
      if (typeof flat === 'number' && Number.isFinite(flat)) {
        consider(flat);
        continue;
      }
      for (let i = 0; i < slots; ++i) {
        consider(transform(data[i * nCh + spec.channel] ?? 0));
      }
    }
  }

  if (!sawReal || !(deepest < Infinity)) return AUTO_SCALE_HARD_MIN;
  return deepest;
}

function seriesKey(series: HistorySeries[]): string {
  return series
    .map(
      (s) =>
        [
          s.id,
          s.channel,
          s.diffChannel ?? '',
          s.diffGrChannel ?? '',
          s.diffGrMode ?? '',
          s.scaleGrChannel ?? '',
          s.scaleGrMode ?? '',
          s.className ?? '',
          s.mode ?? 'bottom',
          wantsGradient(s) ? 1 : 0,
          s.toggle ? 1 : 0,
          s.listed$ ? 1 : 0,
          s.visible$ ? 1 : 0,
          s.flatDb$ ? 1 : 0,
        ].join(':'),
    )
    .join('|');
}

function channelCountOf(series: HistorySeries[]): number {
  let n = 0;
  for (const s of series) {
    n = Math.max(n, s.channel + 1);
    if (s.diffChannel != null) n = Math.max(n, s.diffChannel + 1);
    if (s.diffGrChannel != null) n = Math.max(n, s.diffGrChannel + 1);
    if (s.scaleGrChannel != null) n = Math.max(n, s.scaleGrChannel + 1);
  }
  return n;
}

const ChartBindings = {};
const ChartOptions = {
  auto_size: true,
  show_grid: true,
  label: false,
  range_x: { min: 0, max: HISTORY_CHART_MS, reverse: true },
  range_y: { min: DB_MIN, max: DB_MAX },
  grid_x: buildTimeGridX(HISTORY_CHART_MS),
  grid_y: buildDbGridY(DB_MIN, DB_MAX, DB_GRID, DB_LABEL),
};

const ChartWidget = componentFromWidget(
  AuxChart,
  ChartBindings,
  ChartOptions,
  'HistoryChart-chart',
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
  /** SVG group `.aux-graphs` (AUX Chart private, used as DOM sweep fallback). */
  _graphs?: Element;
  set: (k: string, v: unknown) => void;
  addGraph: (opts: unknown) => AuxGraph;
  removeGraph: (g: AuxGraph) => void;
  getGraphs?: () => AuxGraph[];
};

type HistDot = { x: number; y: number };

/**
 * Drop older slots so the remaining span matches `windowMs` of a blob that was
 * recorded over `sourceWindowMs`. Phase sample (trailing float) is preserved.
 */
function clipHistoryBuf(
  buf: Float32Array | null,
  nCh: number,
  windowMs: number,
  sourceWindowMs: number | undefined,
): Float32Array | null {
  if (!buf || nCh < 1 || buf.length < nCh) return buf;
  if (
    sourceWindowMs == null ||
    !(sourceWindowMs > windowMs) ||
    !(windowMs > 0)
  )
    return buf;

  let phase: number | null = null;
  let data = buf;
  if (buf.length % nCh === 1) {
    phase = buf[buf.length - 1] ?? 0;
    data = buf.subarray(0, buf.length - 1);
  }
  const slots = Math.floor(data.length / nCh);
  if (slots < 2) return buf;

  const keep = Math.max(
    1,
    Math.min(slots, Math.round((slots * windowMs) / sourceWindowMs)),
  );
  if (keep >= slots) return buf;

  const start = (slots - keep) * nCh;
  const clipped = data.subarray(start, start + keep * nCh);
  if (phase == null) return clipped;

  const out = new Float32Array(clipped.length + 1);
  out.set(clipped);
  out[clipped.length] = phase;
  return out;
}

/** Build one channel’s AUX dots from the interleaved history buffer. */
function historyChannelDots(
  buf: Float32Array | null,
  channel: number,
  nCh: number,
  windowMs: number,
  transform: (v: number) => number,
  fixedSlotMs?: number,
  floorY?: number,
  scaleGr?: { channel: number; mode: 'attenuate' | 'expand' },
): HistDot[] | null {
  if (!buf || nCh < 1 || buf.length < nCh) return null;

  let phase = 0;
  let data = buf;
  if (buf.length % nCh === 1) {
    phase = buf[buf.length - 1] ?? 0;
    data = buf.subarray(0, buf.length - 1);
  }

  const slots = Math.floor(data.length / nCh);
  if (slots < 1) return null;

  const slotMs =
    fixedSlotMs != null && fixedSlotMs > 0
      ? fixedSlotMs
      : slots > 1
        ? windowMs / (slots - 1)
        : windowMs;
  const phaseShift = phase * slotMs;
  const pts: HistDot[] = [];
  for (let i = 0; i < slots; ++i) {
    const age = i === slots - 1 ? 0 : slotMs * (slots - 1 - i) + phaseShift;
    let y: number;
    if (floorY != null) {
      y = floorY;
    } else {
      let lin = data[i * nCh + channel] ?? 0;
      if (scaleGr) {
        const gr = Math.min(
          1,
          Math.max(1e-6, data[i * nCh + scaleGr.channel] ?? 1),
        );
        lin = scaleGr.mode === 'expand' ? lin / gr : lin * gr;
      }
      y = transform(lin);
    }
    pts.push({ x: age, y });
  }
  return pts;
}

/**
 * Closed polygon between an upper and lower envelope — the “cut tips”
 * shaved by gain reduction.
 *
 * - `diffChannel`: upper = channel, lower = diffChannel
 * - `diffGrChannel` + attenuate: upper = channel, lower = channel × gr
 * - `diffGrChannel` + expand: upper = channel / gr, lower = channel
 */
function historyCutTipsDots(
  buf: Float32Array | null,
  upperCh: number,
  diffCh: number | undefined,
  grCh: number | undefined,
  grMode: 'attenuate' | 'expand',
  nCh: number,
  windowMs: number,
  transform: (v: number) => number,
  fixedSlotMs?: number,
  floorY?: number,
): HistDot[] | null {
  if (!buf || nCh < 1 || buf.length < nCh) return null;
  if (diffCh == null && grCh == null) return null;

  let phase = 0;
  let data = buf;
  if (buf.length % nCh === 1) {
    phase = buf[buf.length - 1] ?? 0;
    data = buf.subarray(0, buf.length - 1);
  }

  const slots = Math.floor(data.length / nCh);
  if (slots < 1) return null;

  const slotMs =
    fixedSlotMs != null && fixedSlotMs > 0
      ? fixedSlotMs
      : slots > 1
        ? windowMs / (slots - 1)
        : windowMs;
  const phaseShift = phase * slotMs;
  const upper: HistDot[] = [];
  const lower: HistDot[] = [];
  for (let i = 0; i < slots; ++i) {
    const age = i === slots - 1 ? 0 : slotMs * (slots - 1 - i) + phaseShift;
    if (floorY != null) {
      upper.push({ x: age, y: floorY });
      lower.push({ x: age, y: floorY });
      continue;
    }
    const baseLin = data[i * nCh + upperCh] ?? 0;
    let inLin: number;
    let outLin: number;
    if (grCh != null) {
      const gr = Math.min(1, Math.max(1e-6, data[i * nCh + grCh] ?? 1));
      if (grMode === 'expand') {
        // `channel` is post-GR peak → reconstruct pre-GR tip.
        outLin = baseLin;
        inLin = baseLin / gr;
      } else {
        inLin = baseLin;
        outLin = baseLin * gr;
      }
    } else {
      inLin = baseLin;
      outLin = data[i * nCh + (diffCh as number)] ?? 0;
    }
    let yHi = transform(inLin);
    let yLo = transform(outLin);
    // Makeup / boost: no tip. Collapse to a zero-height edge.
    if (yLo > yHi) yLo = yHi;
    upper.push({ x: age, y: yHi });
    lower.push({ x: age, y: yLo });
  }
  return upper.concat(lower.reverse());
}

const alwaysTrue$ = DynamicValue.fromConstant(true);

function SeriesToggle(props: { series: HistorySeries }) {
  const { series } = props;
  const listed = useDynamicValueReadonly(series.listed$ ?? alwaysTrue$);
  if (!series.toggle || !listed || !series.visible$) return null;

  return (
    <Toggle
      state$={series.visible$}
      label={series.short}
      title={series.name}
      className="history-toggle"
    />
  );
}

/**
 * Scrolling multi-series history chart.
 * Paint via AWML Bindings → AUX `dots` (no React re-render on viz ticks).
 */
export function HistoryChart(props: HistoryChartProps) {
  const {
    data$,
    series,
    vizId,
    windowMs = HISTORY_CHART_MS,
    sourceWindowMs,
    slotMs,
    dbMin = DB_MIN,
    dbMax = DB_MAX,
    autoScale = false,
    className,
  } = props;

  const layoutKey = seriesKey(series);
  const seriesRef = useRef(series);
  seriesRef.current = series;
  const windowMsRef = useRef(windowMs);
  windowMsRef.current = windowMs;
  const sourceWindowMsRef = useRef(sourceWindowMs);
  sourceWindowMsRef.current = sourceWindowMs;
  const slotMsRef = useRef(slotMs);
  slotMsRef.current = slotMs;
  const dbMinRef = useRef(dbMin);
  // When auto-scaling, `dbMinRef` tracks the live floor — do not stomp it from props
  // (Analyzer re-renders often from meters and would reset the glide).
  if (!autoScale) dbMinRef.current = dbMin;
  const dbMaxRef = useRef(dbMax);
  dbMaxRef.current = dbMax;
  const autoScaleRef = useRef(autoScale);
  autoScaleRef.current = autoScale;
  const yAutoScaleRef = useRef(new ChartYAutoScale());
  yAutoScaleRef.current.onRangeMin = (min) => {
    dbMinRef.current = min;
  };
  const autoScaleUnsubRef = useRef<(() => void) | null>(null);
  const chartRef = useRef<AuxChartInstance | null>(null);
  const auxGraphsRef = useRef<AuxGraph[]>([]);
  const graphBindingsRef = useRef<Bindings[]>([]);
  const visibleUnsubsRef = useRef<Array<() => void>>([]);
  const resizeRoRef = useRef<ResizeObserver | null>(null);
  /** Bumps on every attach/detach so interleaved rebuilds cannot double-add. */
  const attachGenRef = useRef(0);
  const [chartSvg, setChartSvg] = useState<SVGSVGElement | null>(null);
  const [gradTargets, setGradTargets] = useState<SVGElement[]>([]);
  const [gradEnabled, setGradEnabled] = useState(false);

  const hasToggleChrome = useMemo(
    () => series.some((s) => s.toggle),
    [series],
  );

  const reassertGradStroke = useChartGradient({
    svg: chartSvg,
    // CSS vars for fill-gradient even when no stroke targets.
    enabled: !!chartSvg && gradEnabled,
    targets: gradTargets,
    // Stroke only — fill uses `.fill-grad-light` / `.fill-gradient` CSS vars
    // so inline paint cannot stomp the wash / stroke-none.
    paint: 'stroke',
    reverse: false,
  });
  const reassertRef = useRef(reassertGradStroke);
  reassertRef.current = reassertGradStroke;

  const sendVizBins = useCallback(
    (el: Element) => {
      const width = Math.round(el.getBoundingClientRect().width);
      const bins = Math.max(48, Math.min(512, width));
      postToHost({ t: 'vizcfg', id: vizId, bins });
    },
    [vizId],
  );

  /** Drop every Graph on the chart — tracked list can miss orphans after races. */
  const sweepGraphs = useCallback((chart: AuxChartInstance) => {
    if (chart.isDestructed?.()) return;
    const known = auxGraphsRef.current;
    auxGraphsRef.current = [];
    const all =
      typeof chart.getGraphs === 'function'
        ? (chart.getGraphs() as AuxGraph[])
        : known;
    const seen = new Set<AuxGraph>();
    for (const g of [...all, ...known]) {
      if (!g || seen.has(g)) continue;
      seen.add(g);
      try {
        g.set('dots', null);
      } catch {
        /* already gone */
      }
      try {
        chart.removeGraph(g);
      } catch {
        /* already gone */
      }
    }
    // DOM fallback if AUX list and our ref both missed a node.
    const host = chart._graphs ?? chart.svg?.querySelector(':scope > .aux-graphs');
    if (host) {
      for (const node of [...host.querySelectorAll(':scope > .aux-graph')]) {
        node.remove();
      }
    }
  }, []);

  const detach = useCallback(
    (clearChartRef = true) => {
      attachGenRef.current += 1;
      resizeRoRef.current?.disconnect();
      resizeRoRef.current = null;
      yAutoScaleRef.current.cancelAnim();
      autoScaleUnsubRef.current?.();
      autoScaleUnsubRef.current = null;
      for (const u of visibleUnsubsRef.current) u();
      visibleUnsubsRef.current = [];
      for (const b of graphBindingsRef.current) b.dispose();
      graphBindingsRef.current = [];
      const chart = chartRef.current;
      if (clearChartRef) chartRef.current = null;
      setChartSvg(null);
      setGradTargets([]);
      setGradEnabled(false);
      if (!chart || chart.isDestructed?.()) {
        auxGraphsRef.current = [];
        return;
      }
      sweepGraphs(chart);
    },
    [sweepGraphs],
  );

  const applyAutoScale = useCallback(
    (chart: AuxChartInstance, buf: Float32Array | null) => {
      if (!autoScaleRef.current) return;
      const specs = seriesRef.current;
      const nCh = channelCountOf(specs);
      const clipped = clipHistoryBuf(
        buf,
        nCh,
        windowMsRef.current,
        sourceWindowMsRef.current,
      );
      const deepest = seriesDeepestDb(clipped, specs, nCh);
      const yMax = dbMaxRef.current;
      yAutoScaleRef.current.apply(chart, deepest, yMax, (min) => {
        chart.set('grid_y', buildDbGridY(min, yMax, DB_GRID, DB_LABEL));
      });
    },
    [],
  );

  const attach = useCallback(
    (chart: AuxChartInstance) => {
      if (chart.isDestructed?.()) return;
      // Always own the chart ref before sweeping — rebuild paths pass the same
      // instance without going through widgetRef(null).
      chartRef.current = chart;
      // Kill orphans from a previous attach that lost its tracking set.
      sweepGraphs(chart);

      const gen = (attachGenRef.current += 1);
      const scaler = yAutoScaleRef.current;
      scaler.setEnabled(!!autoScale);

      const yMin = autoScale ? scaler.rangeMin : dbMin;
      const yMax = dbMax;
      if (!autoScale) {
        dbMinRef.current = dbMin;
      } else {
        dbMinRef.current = scaler.rangeMin;
      }

      chart.set('range_x', { min: 0, max: windowMs, reverse: true });
      chart.set('grid_x', buildTimeGridX(windowMs));
      chart.set('range_y', { min: yMin, max: yMax, reverse: true });
      chart.set('grid_y', buildDbGridY(yMin, yMax, DB_GRID, DB_LABEL));

      const specs = seriesRef.current;
      const nCh = channelCountOf(specs);
      const aux: AuxGraph[] = [];
      const grads: SVGElement[] = [];
      const bindingsList: Bindings[] = [];
      const visibleUnsubs: Array<() => void> = [];

      for (const spec of specs) {
        if (attachGenRef.current !== gen) break;
        const seriesClass = `history-${spec.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
        const g = chart.addGraph({
          dots: null,
          type: 'L',
          mode: spec.mode ?? (isCutTipsSeries(spec) ? 'fill' : 'bottom'),
          class: seriesClass,
        });
        addGraphClasses(g.element, spec.className);
        if (g.element) {
          g.element.setAttribute('data-history', spec.id);
          g.element.setAttribute('data-history-name', spec.name);
        }
        if (wantsStrokeGradientPaint(spec) && g.element) grads.push(g.element);
        aux.push(g);

        const channel = spec.channel;
        const diffChannel = spec.diffChannel;
        const diffGrChannel = spec.diffGrChannel;
        const diffGrMode = spec.diffGrMode ?? 'attenuate';
        const scaleGrChannel = spec.scaleGrChannel;
        const scaleGrMode = spec.scaleGrMode ?? 'attenuate';
        const cutTips = isCutTipsSeries(spec);
        const transform = spec.transform ?? historyLinToDb;
        const listed$ = spec.listed$;
        const visible$ = spec.visible$;
        const flatDb$ = spec.flatDb$;

        const isShown = () => {
          const listed = listed$ ? !!listed$.value : true;
          const visible = visible$ ? !!visible$.value : true;
          return listed && visible;
        };

        const dotsFromBuf = (buf: unknown): HistDot[] | null => {
          const shown = isShown();
          g.element?.classList.toggle('history-hidden', !shown);
          const floor = shown ? undefined : dbMinRef.current;
          const raw = buf as Float32Array | null;
          const clipped = clipHistoryBuf(
            raw,
            nCh,
            windowMsRef.current,
            sourceWindowMsRef.current,
          );
          if (cutTips) {
            return historyCutTipsDots(
              clipped,
              channel,
              diffChannel,
              diffGrChannel,
              diffGrMode,
              nCh,
              windowMsRef.current,
              transform,
              slotMsRef.current,
              floor,
            );
          }
          const flat = flatDb$?.value;
          const yTransform =
            typeof flat === 'number' && Number.isFinite(flat)
              ? () => flat
              : transform;
          return historyChannelDots(
            clipped,
            channel,
            nCh,
            windowMsRef.current,
            yTransform,
            slotMsRef.current,
            floor,
            scaleGrChannel != null
              ? { channel: scaleGrChannel, mode: scaleGrMode }
              : undefined,
          );
        };

        const safeDots = (buf: unknown) => {
          const dots = dotsFromBuf(buf);
          return dots && dots.length > 0 ? dots : null;
        };

        const bindings = bindAuxOptions(g, [
          {
            name: 'dots',
            backendValue: data$,
            readonly: true,
            transformReceive: safeDots,
          },
        ]);
        bindingsList.push(bindings);

        const onVisibility = () => {
          g.set('dots', safeDots(data$.value));
          if (autoScaleRef.current) {
            applyAutoScale(chart, data$.value as Float32Array | null);
          }
        };
        if (listed$) visibleUnsubs.push(listed$.subscribe(onVisibility));
        if (visible$) visibleUnsubs.push(visible$.subscribe(onVisibility));
        if (flatDb$) visibleUnsubs.push(flatDb$.subscribe(onVisibility));
        g.element?.classList.toggle('history-hidden', !isShown());
      }

      if (attachGenRef.current !== gen) {
        // A newer detach/attach won the race — drop what we just created.
        for (const b of bindingsList) b.dispose();
        for (const u of visibleUnsubs) u();
        for (const g of aux) {
          try {
            g.set('dots', null);
            chart.removeGraph(g);
          } catch {
            /* ignore */
          }
        }
        return;
      }

      auxGraphsRef.current = aux;
      graphBindingsRef.current = bindingsList;
      visibleUnsubsRef.current = visibleUnsubs;
      for (let i = 0; i < specs.length; ++i) {
        if (specs[i]?.toFront) aux[i]?.toFront?.();
      }

      if (autoScale) {
        applyAutoScale(chart, data$.value as Float32Array | null);
        autoScaleUnsubRef.current?.();
        autoScaleUnsubRef.current = data$.subscribe((v) => {
          if (attachGenRef.current !== gen) return;
          applyAutoScale(chart, v as Float32Array | null);
        });
      }

      setChartSvg(chart.svg ?? null);
      setGradEnabled(specs.some(wantsGradient));
      setGradTargets(grads);
      queueMicrotask(() => {
        if (attachGenRef.current === gen) reassertRef.current();
      });

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
    },
    [
      applyAutoScale,
      autoScale,
      data$,
      dbMax,
      dbMin,
      sendVizBins,
      sweepGraphs,
      windowMs,
      layoutKey,
    ],
  );

  const widgetRef = useCallback(
    (chart: AuxChartInstance | null) => {
      if (!chart) {
        detach(true);
        return;
      }
      // Rebuild in place — keep chartRef, sweep inside attach.
      detach(false);
      attach(chart);
    },
    [attach, detach],
  );

  // Rebuild graphs when series layout / classes change.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDestructed?.()) return;
    detach(false);
    attach(chart);
  }, [attach, detach, layoutKey]);

  useEffect(() => () => detach(true), [detach]);

  const rootCls = ['HistoryChart', className ?? ''].filter(Boolean).join(' ');

  return (
    <div className={rootCls}>
      <ChartWidget className="HistoryChart-chart" widgetRef={widgetRef} />
      {hasToggleChrome ? (
        <div className="history-toggles">
          {series.map((s) => (
            <SeriesToggle key={s.id} series={s} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
