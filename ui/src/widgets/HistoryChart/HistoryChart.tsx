import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import { DynamicValue } from '@deutschesoft/awml';
import type { Bindings } from '@deutschesoft/awml/src/bindings.js';
import {
  componentFromWidget,
  useDynamicValueReadonly,
} from '@deutschesoft/use-aux-widgets';
import { bindAuxOptions } from '../../utils/aux_bindings';
import {
  AUTO_SCALE_HARD_MIN,
  AUTO_SCALE_RELEASE_TAU_S,
  ChartYAutoScale,
} from '../../utils/chartAutoScale';
import { buildDbGridY, buildTimeGridX } from '../../utils/chartGrid';
import { observeVizBins } from '../../utils/vizBins';
import { useChartGradient } from '../../hooks/useChartGradient';
import { addGraphClasses } from '../../styles/graphStyles';
import { attachPersistedHistoryToggles } from '../../prefs/historySeriesVisible';
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

/** Match SpectrumDiffChart: emphasize the 0 dB / bipolar mid line. */
const DB_GRID_OPTS = { zeroClass: 'base' } as const;

/** Fixed history window (ms) — keep in sync with DSP history display. */
export const HISTORY_CHART_MS = 8000;

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
   * Combine `channel` with this peer before `transform` (EnvelopeChart-style
   * outer = max(in,out) / mask = min(in,out) stack). Ignored for cut-tips /
   * scaleGr series.
   */
  pairChannel?: number;
  /** With `pairChannel`: plot max or min of the two linear amplitudes. */
  pairMode?: 'max' | 'min';
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
  /**
   * AUX Graph `base` (0 = bottom … 1 = top). Only used with `mode: 'base'`.
   * For bipolar charts with symmetric ±dB range, `0.5` matches the zero line
   * (same pixel as `mode: 'center'`).
   */
  base?: number;
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
   * Legend chip order (ascending). When omitted, series array order is used.
   * Paint / z-order still follows the `series` array.
   */
  toggleOrder?: number;
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
  /**
   * rAF glide of `range_y` while auto-scaling. Default true.
   */
  autoScaleAnimate?: boolean;
  /**
   * Release time constant (seconds) for the floor envelope. Attack stays
   * fast (`AUTO_SCALE_ATTACK_MS`). Default 2; multiband strips use 4.
   */
  autoScaleReleaseTauS?: number;
  /**
   * Cap DSP history slots (`vizcfg` bins). Strip charts are ~200×96 px —
   * 72 points is already denser than one per pixel.
   */
  maxBins?: number;
  /**
   * When several charts share `vizId` (mbcomp / mblimiter strips), only one
   * should report width. Default true.
   */
  syncBins?: boolean;
  /**
   * Legend toggles for matching series ids, persisted under
   * `calfnxt.historyVisible.<persistId ?? vizId>.<seriesId>`. Values are the
   * default when nothing is stored yet (dynamics Trig/GR default off).
   */
  persistToggles?: Readonly<Record<string, boolean>>;
  /**
   * localStorage scope for `persistToggles` (defaults to `vizId`).
   * Use when the storage key should differ from the host viz stream id
   * (e.g. Expander viz `"exp"` vs prefs `"expander"`).
   */
  persistId?: string;
  className?: string;
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
 * Drawing floor (−60) plus a small band: scroll-on-silence / near-noise
 * residuals must not yank auto-scale to full range. Reference lines
 * (thresh / limit / GR) still count when they sit above this band.
 */
const AUTO_SCALE_SILENCE_DB = AUTO_SCALE_HARD_MIN + 6;

/**
 * Peak/fill series only drive auto-scale from the newest fraction of the
 * window. Older slots still scroll visually, but a long Limiter 8 s history
 * would otherwise keep the softest past residue (−60) until it ages out —
 * unlike Mbcomp, whose mid-scale threshold line anchors the floor.
 */
const AUTO_SCALE_PEAK_FRACTION = 0.25;

/** Thresh / Limit / GR / Trig strokes — full window (stable anchors). */
function isAutoScaleReferenceSeries(spec: HistorySeries): boolean {
  const id = spec.id;
  return (
    id === 'thresh' ||
    id === 'gr' ||
    id === 'trigger' ||
    typeof spec.flatDb$ !== 'undefined'
  );
}

/**
 * Deepest plotted Y across all listed+visible series (cut tips: both edges).
 *
 * Returns `null` when there is no buffer yet (studio / first paint) so the
 * floor envelope does not lock onto −60 and then crawl up via slow release.
 *
 * Near-zero lin maps to HARD_MIN (−60) for drawing; those silence sentinels
 * (and a few dB above) are skipped for auto-scale when any real sample
 * exists — otherwise sparse zeros / noise-floor scroll yank the floor.
 * Peak fills only inspect the newest quarter of the window so stop+silence
 * settles on Limit/Thresh/GR instead of waiting for an 8 s ring to drain.
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

  const peakStart = Math.min(
    slots - 1,
    Math.max(0, Math.floor(slots * (1 - AUTO_SCALE_PEAK_FRACTION))),
  );

  let deepest = Infinity;
  let sawReal = false;

  const consider = (y: number) => {
    // Silence / near-floor — ignore unless the buffer has no real content.
    if (!(y > AUTO_SCALE_SILENCE_DB)) return;
    sawReal = true;
    if (y < deepest) deepest = y;
  };

  for (const spec of specs) {
    const listed = spec.listed$ ? !!spec.listed$.value : true;
    const visible = spec.visible$ ? !!spec.visible$.value : true;
    if (!listed || !visible) continue;

    const transform = spec.transform ?? historyLinToDb;
    const ref = isAutoScaleReferenceSeries(spec);
    const i0 = ref ? 0 : peakStart;
    if (isCutTipsSeries(spec)) {
      const grCh = spec.diffGrChannel;
      const diffCh = spec.diffChannel;
      const grMode = spec.diffGrMode ?? 'attenuate';
      for (let i = i0; i < slots; ++i) {
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
      for (let i = i0; i < slots; ++i) {
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
      const pairCh = spec.pairChannel;
      const pairMode = spec.pairMode;
      for (let i = i0; i < slots; ++i) {
        let lin = data[i * nCh + spec.channel] ?? 0;
        if (pairCh != null && pairMode) {
          const b = data[i * nCh + pairCh] ?? 0;
          lin = pairMode === 'max' ? Math.max(lin, b) : Math.min(lin, b);
        }
        consider(transform(lin));
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
          s.pairChannel ?? '',
          s.pairMode ?? '',
          s.className ?? '',
          s.mode ?? 'bottom',
          s.base ?? '',
          wantsGradient(s) ? 1 : 0,
          s.toggle ? 1 : 0,
          s.toggleOrder ?? '',
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
    if (s.pairChannel != null) n = Math.max(n, s.pairChannel + 1);
  }
  return n;
}

const ChartBindings = {};
const ChartOptions = {
  auto_size: true,
  show_grid: true,
  label: false,
  range_x: { min: 0, max: HISTORY_CHART_MS, reverse: true },
  // Symmetric seed so bipolar mounts (Pulsator ±60) don’t flash unipolar −48…0
  // before attach() applies props. attach() always reasserts min/max/reverse.
  range_y: { min: DB_MIN, max: DB_MAX, reverse: true },
  grid_x: buildTimeGridX(HISTORY_CHART_MS),
  grid_y: buildDbGridY(DB_MIN, DB_MAX, DB_GRID, DB_LABEL, DB_GRID_OPTS),
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
  pair?: { channel: number; mode: 'max' | 'min' },
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
      if (pair) {
        const b = data[i * nCh + pair.channel] ?? 0;
        lin = pair.mode === 'max' ? Math.max(lin, b) : Math.min(lin, b);
      }
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
    series: seriesIn,
    vizId,
    windowMs = HISTORY_CHART_MS,
    sourceWindowMs,
    slotMs,
    dbMin = DB_MIN,
    dbMax = DB_MAX,
    autoScale = false,
    autoScaleAnimate = true,
    autoScaleReleaseTauS = AUTO_SCALE_RELEASE_TAU_S,
    maxBins,
    syncBins = true,
    persistToggles,
    persistId,
    className,
  } = props;

  const series = useMemo(
    () =>
      persistToggles
        ? attachPersistedHistoryToggles(
            seriesIn,
            persistId ?? vizId,
            persistToggles,
          )
        : seriesIn,
    [seriesIn, vizId, persistId, persistToggles],
  );

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
  const vizBinsStopRef = useRef<(() => void) | null>(null);
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
      vizBinsStopRef.current?.();
      vizBinsStopRef.current = null;
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
        chart.set('grid_y', buildDbGridY(min, yMax, DB_GRID, DB_LABEL, DB_GRID_OPTS));
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
      scaler.animateRange = autoScaleAnimate;
      scaler.releaseTauS = autoScaleReleaseTauS;
      if (!autoScaleAnimate) scaler.cancelAnim();

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
      chart.set('grid_y', buildDbGridY(yMin, yMax, DB_GRID, DB_LABEL, DB_GRID_OPTS));

      const specs = seriesRef.current;
      const nCh = channelCountOf(specs);
      const aux: AuxGraph[] = [];
      const grads: SVGElement[] = [];
      const bindingsList: Bindings[] = [];
      const visibleUnsubs: Array<() => void> = [];

      for (const spec of specs) {
        if (attachGenRef.current !== gen) break;
        const seriesClass = `history-${spec.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`;
        const mode = spec.mode ?? (isCutTipsSeries(spec) ? 'fill' : 'bottom');
        const g = chart.addGraph({
          dots: null,
          type: 'L',
          mode,
          ...(mode === 'base' && spec.base != null ? { base: spec.base } : {}),
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
        const pairChannel = spec.pairChannel;
        const pairMode = spec.pairMode;
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
            pairChannel != null && pairMode
              ? { channel: pairChannel, mode: pairMode }
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
      if (el && syncBins) {
        vizBinsStopRef.current?.();
        vizBinsStopRef.current = observeVizBins(
          el,
          vizId,
          48,
          maxBins ?? 512,
        );
      }
    },
    [
      applyAutoScale,
      autoScale,
      autoScaleAnimate,
      autoScaleReleaseTauS,
      data$,
      maxBins,
      syncBins,
      dbMax,
      dbMin,
      sweepGraphs,
      vizId,
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
          {series
            .map((s, i) => ({ s, i }))
            .sort((a, b) => {
              const ao = a.s.toggleOrder;
              const bo = b.s.toggleOrder;
              if (ao != null || bo != null)
                return (ao ?? a.i) - (bo ?? b.i);
              return a.i - b.i;
            })
            .map(({ s }) => (
              <SeriesToggle key={s.id} series={s} />
            ))}
        </div>
      ) : null}
    </div>
  );
}
