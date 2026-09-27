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
import './HistoryChart.scss';

export {
  HISTORY_STYLE,
  GRAPH_STYLE,
  addGraphClasses,
} from '../../styles/graphStyles';

const DB_MAX = 0;
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
   * Graph utility classes from `styles/graph.scss`, e.g.
   * `"stroke-thin stroke-accent fill-faint"`.
   */
  className?: string;
  /** AUX path mode. Default `bottom`. */
  mode?: HistoryGraphMode;
  /** Map blob sample → plot Y (default: linear amplitude → dB). */
  transform?: (value: number) => number;
  /** Raise this series after attach. */
  toFront?: boolean;
  /**
   * Install the vertical accent→warn paint server on the chart SVG.
   * Also implied when `className` contains `stroke-gradient` / `fill-gradient`
   * (non-inv). Style the path with `stroke-gradient` / `fill-gradient`.
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
   * Fixed spacing between samples. Partial buffers then sit at “now”
   * (the right edge) instead of being stretched across `windowMs`.
   */
  slotMs?: number;
  /** Plot range in dB. Defaults to −48…0 (peaks and gain reduction). */
  dbMin?: number;
  dbMax?: number;
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

/** Default: linear amplitude → dB (peaks and GR lin). */
export function historyLinToDb(lin: number): number {
  if (!(lin > 1e-12)) return DB_MIN;
  return Math.max(DB_MIN, Math.min(DB_MAX, 20 * Math.log10(lin)));
}

function splitClassNames(className: string | undefined): string[] {
  if (!className) return [];
  return className.split(/\s+/).filter(Boolean);
}

function wantsGradient(spec: HistorySeries): boolean {
  if (spec.gradient) return true;
  const cls = spec.className ?? '';
  return (
    /\bstroke-gradient\b/.test(cls) ||
    /\bfill-gradient\b/.test(cls)
  );
}

function seriesKey(series: HistorySeries[]): string {
  return series
    .map(
      (s) =>
        [
          s.id,
          s.channel,
          s.className ?? '',
          s.mode ?? 'bottom',
          wantsGradient(s) ? 1 : 0,
          s.toggle ? 1 : 0,
          s.listed$ ? 1 : 0,
          s.visible$ ? 1 : 0,
        ].join(':'),
    )
    .join('|');
}

function channelCountOf(series: HistorySeries[]): number {
  let n = 0;
  for (const s of series) n = Math.max(n, s.channel + 1);
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
  set: (k: string, v: unknown) => void;
  addGraph: (opts: unknown) => AuxGraph;
  removeGraph: (g: AuxGraph) => void;
};

type HistDot = { x: number; y: number };

/** Build one channel’s AUX dots from the interleaved history buffer. */
function historyChannelDots(
  buf: Float32Array | null,
  channel: number,
  nCh: number,
  windowMs: number,
  transform: (v: number) => number,
  fixedSlotMs?: number,
  floorY?: number,
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
    const y =
      floorY != null
        ? floorY
        : transform(data[i * nCh + channel] ?? 0);
    pts.push({ x: age, y });
  }
  return pts;
}

const alwaysTrue$ = DynamicValue.fromConstant(true);

function SeriesToggle(props: { series: HistorySeries }) {
  const { series } = props;
  const listed = useDynamicValueReadonly(series.listed$ ?? alwaysTrue$);
  const visible = useDynamicValueReadonly(series.visible$ ?? alwaysTrue$);
  if (!series.toggle || !listed) return null;

  const visible$ = series.visible$;
  return (
    <button
      type="button"
      className={['history-toggle', visible && 'is-on']
        .filter(Boolean)
        .join(' ')}
      title={series.name}
      aria-pressed={visible}
      aria-label={series.name}
      onClick={() => {
        if (!visible$) return;
        visible$.set(!visible$.value);
      }}>
      {series.short}
    </button>
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
    slotMs,
    dbMin = DB_MIN,
    dbMax = DB_MAX,
    className,
  } = props;

  const layoutKey = seriesKey(series);
  const seriesRef = useRef(series);
  seriesRef.current = series;
  const windowMsRef = useRef(windowMs);
  windowMsRef.current = windowMs;
  const slotMsRef = useRef(slotMs);
  slotMsRef.current = slotMs;
  const dbMinRef = useRef(dbMin);
  dbMinRef.current = dbMin;
  const chartRef = useRef<AuxChartInstance | null>(null);
  const auxGraphsRef = useRef<AuxGraph[]>([]);
  const graphBindingsRef = useRef<Bindings[]>([]);
  const visibleUnsubsRef = useRef<Array<() => void>>([]);
  const resizeRoRef = useRef<ResizeObserver | null>(null);
  const [chartSvg, setChartSvg] = useState<SVGSVGElement | null>(null);
  const [gradTargets, setGradTargets] = useState<SVGElement[]>([]);

  const hasToggleChrome = useMemo(
    () => series.some((s) => s.toggle),
    [series],
  );

  const reassertGradStroke = useChartGradient({
    svg: chartSvg,
    enabled: !!chartSvg && gradTargets.length > 0,
    targets: gradTargets,
    paint: 'stroke',
    reverse: true,
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

  const detach = useCallback(() => {
    resizeRoRef.current?.disconnect();
    resizeRoRef.current = null;
    for (const u of visibleUnsubsRef.current) u();
    visibleUnsubsRef.current = [];
    for (const b of graphBindingsRef.current) b.dispose();
    graphBindingsRef.current = [];
    const chart = chartRef.current;
    const aux = auxGraphsRef.current;
    auxGraphsRef.current = [];
    chartRef.current = null;
    setChartSvg(null);
    setGradTargets([]);
    if (!chart || chart.isDestructed?.()) return;
    for (const g of aux) {
      // Clear path before remove — AUX otherwise keeps the last stroke.
      g.set('dots', null);
      chart.removeGraph(g);
    }
  }, []);

  const attach = useCallback(
    (chart: AuxChartInstance) => {
      chartRef.current = chart;
      if (chart.isDestructed?.()) return;

      chart.set('range_x', { min: 0, max: windowMs, reverse: true });
      chart.set('grid_x', buildTimeGridX(windowMs));
      chart.set('range_y', { min: dbMin, max: dbMax });
      chart.set('grid_y', buildDbGridY(dbMin, dbMax, DB_GRID, DB_LABEL));

      const specs = seriesRef.current;
      const nCh = channelCountOf(specs);
      const aux: AuxGraph[] = [];
      const grads: SVGElement[] = [];
      const bindingsList: Bindings[] = [];
      const visibleUnsubs: Array<() => void> = [];

      for (const spec of specs) {
        const classes = splitClassNames(spec.className);
        const g = chart.addGraph({
          dots: null,
          type: 'L',
          mode: spec.mode ?? 'bottom',
          class: classes[0] ?? '',
        });
        addGraphClasses(g.element, spec.className);
        if (wantsGradient(spec) && g.element) grads.push(g.element);
        aux.push(g);

        const channel = spec.channel;
        const transform = spec.transform ?? historyLinToDb;
        const listed$ = spec.listed$;
        const visible$ = spec.visible$;

        const isShown = () => {
          const listed = listed$ ? !!listed$.value : true;
          const visible = visible$ ? !!visible$.value : true;
          return listed && visible;
        };

        const dotsFromBuf = (buf: unknown): HistDot[] | null => {
          const shown = isShown();
          g.element?.classList.toggle('history-hidden', !shown);
          if (!shown) {
            // Floor line (not null) so AUX replaces the previous path.
            return historyChannelDots(
              buf as Float32Array | null,
              channel,
              nCh,
              windowMsRef.current,
              transform,
              slotMsRef.current,
              dbMinRef.current,
            );
          }
          return historyChannelDots(
            buf as Float32Array | null,
            channel,
            nCh,
            windowMsRef.current,
            transform,
            slotMsRef.current,
          );
        };

        const bindings = bindAuxOptions(g, [
          {
            name: 'dots',
            backendValue: data$,
            readonly: true,
            transformReceive: dotsFromBuf,
          },
        ]);
        bindingsList.push(bindings);

        const onVisibility = () => {
          g.set('dots', dotsFromBuf(data$.value));
        };
        if (listed$) visibleUnsubs.push(listed$.subscribe(onVisibility));
        if (visible$) visibleUnsubs.push(visible$.subscribe(onVisibility));
        g.element?.classList.toggle('history-hidden', !isShown());
      }

      auxGraphsRef.current = aux;
      graphBindingsRef.current = bindingsList;
      visibleUnsubsRef.current = visibleUnsubs;
      for (let i = 0; i < specs.length; ++i) {
        if (specs[i]?.toFront) aux[i]?.toFront?.();
      }

      setChartSvg(chart.svg ?? null);
      setGradTargets(grads);
      queueMicrotask(() => reassertRef.current());

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
    [data$, dbMax, dbMin, sendVizBins, windowMs, layoutKey],
  );

  const widgetRef = useCallback(
    (chart: AuxChartInstance | null) => {
      if (!chart) {
        detach();
        return;
      }
      detach();
      attach(chart);
    },
    [attach, detach],
  );

  // Rebuild graphs when series layout / classes change.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDestructed?.()) return;
    detach();
    attach(chart);
  }, [attach, detach, layoutKey]);

  useEffect(() => () => detach(), [detach]);

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
