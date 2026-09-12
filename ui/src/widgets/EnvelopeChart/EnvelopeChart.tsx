import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import { ListValue } from '@deutschesoft/awml';
import type { Bindings } from '@deutschesoft/awml/src/bindings.js';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { bindAuxOptions } from '../../utils/aux_bindings';
import { postToHost } from '../../utils/bridge';
import { useChartGradient } from '../../hooks/useChartGradient';
import './EnvelopeChart.scss';

/** Slot layout: original, filtered, output, envelope, attack, release. */
const ENV_CHANNELS = 6;
const CH_ORIGINAL = 0;
const CH_FILTERED = 1;
const CH_OUTPUT = 2;
const CH_ENVELOPE = 3;
const CH_ATTACK = 4;
const CH_RELEASE = 5;

const DB_MAX = 12;
const DB_MIN = -60;
const DB_GRID = 6;
const DB_LABEL = 12;

/** Fixed scroll window (ms) — matches wide top history layout. */
export const ENVELOPE_WINDOW_MS = 10000;
const GRID_STEP_MS = 1000;

function buildDbGridY(min: number, max: number, step: number, labelStep: number) {
  const lines: { pos: number; label?: string; class?: string }[] = [];
  const start = Math.ceil(min / step) * step;
  for (let db = start; db <= max; db += step) {
    const major = db % labelStep === 0;
    lines.push({
      pos: db,
      class: major ? 'env-grid-major' : 'env-grid-minor',
      ...(major ? { label: `${db}` } : {}),
    });
  }
  return lines;
}

function formatMsLabel(ms: number): string {
  if (ms >= 1000) {
    const s = ms / 1000;
    return Number.isInteger(s) ? `${s}s` : `${s}s`;
  }
  return `${Math.round(ms)}`;
}

function buildTimeGridX(displayMs: number) {
  const lines: { pos: number; label: string; class: string }[] = [];
  for (let t = displayMs; t >= -1e-9; t -= GRID_STEP_MS) {
    const pos = Math.round(t);
    lines.push({
      pos,
      label: formatMsLabel(pos),
      class: 'env-grid-time',
    });
  }
  return lines;
}

const ChartBindings = {};
const ChartOptions = {
  auto_size: true,
  show_grid: true,
  label: false,
  range_x: { min: 0, max: ENVELOPE_WINDOW_MS, reverse: true },
  range_y: { min: DB_MIN, max: DB_MAX, reverse: false },
  grid_x: buildTimeGridX(ENVELOPE_WINDOW_MS),
  grid_y: buildDbGridY(DB_MIN, DB_MAX, DB_GRID, DB_LABEL),
};

const ChartWidget = componentFromWidget(
  AuxChart,
  ChartBindings,
  ChartOptions,
  'EnvelopeChart',
);

function linToDb(lin: number): number {
  return lin > 1e-10 ? 20 * Math.log10(lin) : DB_MIN;
}

function resultChannelForView(view: number): number {
  const v = Math.round(view);
  if (v === 0) return CH_OUTPUT;
  if (v === 1) return CH_ENVELOPE;
  if (v === 2) return CH_ATTACK;
  return CH_RELEASE;
}

type EnvDot = { x: number; y: number };

/** Unpack phase + build one channel’s dots (or null). */
function envelopeChannelDots(
  buf: Float32Array | null,
  channel: number,
  windowMs: number,
): EnvDot[] | null {
  if (!buf || buf.length < ENV_CHANNELS) return null;

  let phase = 0;
  let data = buf;
  if (buf.length % ENV_CHANNELS === 1) {
    phase = buf[buf.length - 1] ?? 0;
    data = buf.subarray(0, buf.length - 1);
  }

  const slots = Math.floor(data.length / ENV_CHANNELS);
  if (slots < 1) return null;

  const slotMs = slots > 1 ? windowMs / (slots - 1) : windowMs;
  const phaseShift = phase * slotMs;
  const pts: EnvDot[] = [];
  for (let i = 0; i < slots; ++i) {
    const age = i === slots - 1 ? 0 : slotMs * (slots - 1 - i) + phaseShift;
    pts.push({
      x: age,
      y: linToDb(data[i * ENV_CHANNELS + channel] ?? 0),
    });
  }
  return pts;
}

export type EnvelopeView = 0 | 1 | 2 | 3;

export interface EnvelopeChartProps {
  data$: DynamicValue<Float32Array | null>;
  view$: DynamicValue<number>;
  /** Host vizcfg stream id (default `"env"`). */
  vizId?: string;
  className?: string;
}

type AuxGraph = {
  set: (key: string, value: unknown) => void;
  toFront?: () => void;
  element?: SVGElement;
};

type AuxChartInstance = {
  addGraph: (opts: unknown) => AuxGraph;
  removeGraph: (graph: unknown) => void;
  set: (key: string, value: unknown) => void;
  isDestructed?: () => boolean;
  element?: HTMLElement;
  svg?: SVGSVGElement;
};

type Graphs = {
  original: AuxGraph | null;
  filtered: AuxGraph | null;
  result: AuxGraph | null;
};

/**
 * Scrolling envelope display for the transient shaper.
 *
 * Graphs: original (blue, back), filtered detector (white), result overlay
 * (Output / Envelope / Attack / Release via `view$`). Paint via AWML Bindings.
 */
export function EnvelopeChart(props: EnvelopeChartProps) {
  const { data$, view$, vizId = 'env', className } = props;
  const chartRef = useRef<AuxChartInstance | null>(null);
  const graphsRef = useRef<Graphs>({
    original: null,
    filtered: null,
    result: null,
  });
  const graphBindingsRef = useRef<Bindings[]>([]);
  const resizeRoRef = useRef<ResizeObserver | null>(null);
  const [chartSvg, setChartSvg] = useState<SVGSVGElement | null>(null);
  const [resultPath, setResultPath] = useState<SVGElement | null>(null);

  const curveTargets = useMemo(
    () => (resultPath ? [resultPath] : []),
    [resultPath],
  );
  const reassertGradStroke = useChartGradient({
    svg: chartSvg,
    targets: curveTargets,
    paint: 'stroke',
  });
  const reassertRef = useRef(reassertGradStroke);
  reassertRef.current = reassertGradStroke;

  /** data$ × view$ for the result-channel Binding. */
  const resultSource$ = useMemo(
    () => new ListValue<[Float32Array | null, number]>([data$, view$]),
    [data$, view$],
  );

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
    const { original, filtered, result } = graphsRef.current;
    graphsRef.current = { original: null, filtered: null, result: null };
    chartRef.current = null;
    setChartSvg(null);
    setResultPath(null);
    if (!chart || chart.isDestructed?.()) return;
    if (original) chart.removeGraph(original);
    if (filtered) chart.removeGraph(filtered);
    if (result) chart.removeGraph(result);
  }, []);

  const attach = useCallback(
    (chart: AuxChartInstance) => {
      chartRef.current = chart;
      if (chart.isDestructed?.()) return;

      for (const b of graphBindingsRef.current) b.dispose();
      graphBindingsRef.current = [];

      chart.set('range_x', {
        min: 0,
        max: ENVELOPE_WINDOW_MS,
        reverse: true,
      });
      chart.set('grid_x', buildTimeGridX(ENVELOPE_WINDOW_MS));

      // Paint order = DOM order: original (back) → filtered → result (front).
      if (!graphsRef.current.original) {
        const g = chart.addGraph({
          dots: null,
          type: 'L',
          mode: 'bottom',
          class: 'env-original-graph',
        });
        g.element?.classList.add('env-original-graph');
        graphsRef.current.original = g;
      }
      if (!graphsRef.current.filtered) {
        const g = chart.addGraph({
          dots: null,
          type: 'L',
          mode: 'bottom',
          class: 'env-filtered-graph',
        });
        g.element?.classList.add('env-filtered-graph');
        graphsRef.current.filtered = g;
      }
      if (!graphsRef.current.result) {
        const g = chart.addGraph({
          dots: null,
          type: 'L',
          mode: 'line',
          class: 'env-result-graph',
        });
        g.element?.classList.add('env-result-graph');
        graphsRef.current.result = g;
      }
      graphsRef.current.original?.element?.parentElement?.appendChild(
        graphsRef.current.original.element,
      );
      graphsRef.current.filtered?.element?.parentElement?.appendChild(
        graphsRef.current.filtered.element,
      );
      graphsRef.current.result?.element?.parentElement?.appendChild(
        graphsRef.current.result.element,
      );

      const { original, filtered, result } = graphsRef.current;
      const bindings: Bindings[] = [];
      if (original) {
        bindings.push(
          bindAuxOptions(original, [
            {
              name: 'dots',
              backendValue: data$,
              readonly: true,
              transformReceive: (buf: unknown) =>
                envelopeChannelDots(
                  buf as Float32Array | null,
                  CH_ORIGINAL,
                  ENVELOPE_WINDOW_MS,
                ),
            },
          ]),
        );
      }
      if (filtered) {
        bindings.push(
          bindAuxOptions(filtered, [
            {
              name: 'dots',
              backendValue: data$,
              readonly: true,
              transformReceive: (buf: unknown) =>
                envelopeChannelDots(
                  buf as Float32Array | null,
                  CH_FILTERED,
                  ENVELOPE_WINDOW_MS,
                ),
            },
          ]),
        );
      }
      if (result) {
        bindings.push(
          bindAuxOptions(result, [
            {
              name: 'dots',
              backendValue: resultSource$,
              readonly: true,
              transformReceive: (pair: unknown) => {
                const [buf, view] = pair as [Float32Array | null, number];
                return envelopeChannelDots(
                  buf,
                  resultChannelForView(view ?? 0),
                  ENVELOPE_WINDOW_MS,
                );
              },
            },
          ]),
        );
      }
      graphBindingsRef.current = bindings;

      setChartSvg(chart.svg ?? null);
      setResultPath(graphsRef.current.result?.element ?? null);
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
    [data$, resultSource$, sendVizBins],
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

  useEffect(() => () => detach(), [detach]);

  const cls = ['EnvelopeChart', className ?? ''].filter(Boolean).join(' ');

  return <ChartWidget className={cls} widgetRef={widgetRef} />;
}
