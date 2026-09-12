import { useCallback, useEffect, useRef, useState } from 'react';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import type { Bindings } from '@deutschesoft/awml/src/bindings.js';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { bindAuxOptions } from '../../utils/aux_bindings';
import { postToHost } from '../../utils/bridge';
import { useChartGradient } from '../../hooks/useChartGradient';
import './HistoryChart.scss';

const DB_MAX = 0;
const DB_MIN = -48;
const DB_GRID = 6;
const DB_LABEL = 12;

/** Fixed history window (ms) — keep in sync with DSP history display. */
export const HISTORY_CHART_MS = 10000;
const HISTORY_GRID_STEP_MS = 1000;

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
  'HistoryChart',
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

export type HistoryGraphSpec = {
  /** CSS class on the graph path — style from plugin SCSS. */
  className: string;
  /** AUX Chart graph mode. */
  mode?: 'bottom' | 'line' | 'top';
  /** Map interleaved channel value (usually lin) → plot dB. */
  toDb?: (value: number) => number;
  /** Raise this series after each update. */
  toFront?: boolean;
  /**
   * Stroke uses `--chart-level-stroke` (vertical blue↔red gradient installed
   * on the SVG). Style with `stroke: var(--chart-level-stroke)` in CSS.
   */
  gradient?: boolean;
};

export interface HistoryChartProps {
  data$: DynamicValue<Float32Array | null>;
  /**
   * One graph per interleaved channel (channel i ↔ graphs[i]).
   * Buffer layout: `[ch0, ch1, …, chN-1] × slots` + optional trailing phase.
   */
  graphs: HistoryGraphSpec[];
  /** Host vizcfg / envelope stream id (e.g. `"comp"`, `"deess"`). */
  vizId: string;
  windowMs?: number;
  className?: string;
}

type HistDot = { x: number; y: number };

/** Build one channel’s AUX dots from the interleaved history buffer. */
function historyChannelDots(
  buf: Float32Array | null,
  channel: number,
  nCh: number,
  windowMs: number,
  toDb: (v: number) => number,
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

  const slotMs = slots > 1 ? windowMs / (slots - 1) : windowMs;
  const phaseShift = phase * slotMs;
  const pts: HistDot[] = [];
  for (let i = 0; i < slots; ++i) {
    const age = i === slots - 1 ? 0 : slotMs * (slots - 1 - i) + phaseShift;
    pts.push({
      x: age,
      y: toDb(data[i * nCh + channel] ?? 0),
    });
  }
  return pts;
}

/**
 * Scrolling multi-series history chart. Channel count = `graphs.length`.
 * Paint via AWML Bindings → AUX `dots` (no React re-render on viz ticks).
 */
export function HistoryChart(props: HistoryChartProps) {
  const {
    data$,
    graphs,
    vizId,
    windowMs = HISTORY_CHART_MS,
    className,
  } = props;

  const graphsKey = graphs
    .map((g) => `${g.className}:${g.mode ?? 'line'}:${!!g.gradient}`)
    .join('|');

  const graphsSpecRef = useRef(graphs);
  graphsSpecRef.current = graphs;
  const windowMsRef = useRef(windowMs);
  windowMsRef.current = windowMs;
  const chartRef = useRef<AuxChartInstance | null>(null);
  const auxGraphsRef = useRef<AuxGraph[]>([]);
  const graphBindingsRef = useRef<Bindings[]>([]);
  const resizeRoRef = useRef<ResizeObserver | null>(null);
  const [chartSvg, setChartSvg] = useState<SVGSVGElement | null>(null);
  const [gradTargets, setGradTargets] = useState<SVGElement[]>([]);

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
    for (const b of graphBindingsRef.current) b.dispose();
    graphBindingsRef.current = [];
    const chart = chartRef.current;
    const aux = auxGraphsRef.current;
    auxGraphsRef.current = [];
    chartRef.current = null;
    setChartSvg(null);
    setGradTargets([]);
    if (!chart || chart.isDestructed?.()) return;
    for (const g of aux) chart.removeGraph(g);
  }, []);

  const attach = useCallback(
    (chart: AuxChartInstance) => {
      chartRef.current = chart;
      if (chart.isDestructed?.()) return;

      chart.set('range_x', { min: 0, max: windowMs, reverse: true });
      chart.set('grid_x', buildTimeGridX(windowMs));

      const specs = graphsSpecRef.current;
      const nCh = specs.length;
      const aux: AuxGraph[] = [];
      const grads: SVGElement[] = [];
      const bindingsList: Bindings[] = [];

      for (let c = 0; c < nCh; ++c) {
        const spec = specs[c]!;
        const g = chart.addGraph({
          dots: null,
          type: 'L',
          mode: spec.mode ?? 'line',
          class: spec.className,
        });
        g.element?.classList.add(spec.className);
        if (spec.gradient && g.element) grads.push(g.element);
        aux.push(g);

        const channel = c;
        const toDb = spec.toDb ?? historyLinToDb;
        const bindings = bindAuxOptions(g, [
          {
            name: 'dots',
            backendValue: data$,
            readonly: true,
            transformReceive: (buf: unknown) =>
              historyChannelDots(
                buf as Float32Array | null,
                channel,
                nCh,
                windowMsRef.current,
                toDb,
              ),
          },
        ]);
        bindingsList.push(bindings);
      }

      auxGraphsRef.current = aux;
      graphBindingsRef.current = bindingsList;
      for (const spec of specs) {
        if (spec.toFront) {
          const i = specs.indexOf(spec);
          aux[i]?.toFront?.();
        }
      }

      setChartSvg(chart.svg ?? null);
      setGradTargets(grads);
      // One-shot after attach (CSS var --chart-level-stroke covers later redraws).
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
    [data$, sendVizBins, windowMs, graphsKey],
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

  // Rebuild graphs when channel layout / classes change.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDestructed?.()) return;
    detach();
    attach(chart);
  }, [attach, detach, graphsKey]);

  useEffect(() => () => detach(), [detach]);

  const cls = ['HistoryChart', className ?? ''].filter(Boolean).join(' ');

  return <ChartWidget className={cls} widgetRef={widgetRef} />;
}
