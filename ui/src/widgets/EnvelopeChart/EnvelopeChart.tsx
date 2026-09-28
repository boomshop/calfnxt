import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import { ListValue } from '@deutschesoft/awml';
import type { Bindings } from '@deutschesoft/awml/src/bindings.js';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { bindAuxOptions } from '../../utils/aux_bindings';
import { postToHost } from '../../utils/bridge';
import { useChartGradient } from '../../hooks/useChartGradient';
import { addGraphClasses, GRAPH_STYLE } from '../../styles/graphStyles';
import './EnvelopeChart.scss';

/** Slot layout: original, filtered, output, envelope, attack, release. */
const ENV_CHANNELS = 6;
const CH_ORIGINAL = 0;
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

type UnpackedEnv = {
  data: Float32Array;
  slots: number;
  slotMs: number;
  phaseShift: number;
};

/** Unpack optional trailing phase + slot geometry. */
function unpackEnvBuf(
  buf: Float32Array | null,
  windowMs: number,
): UnpackedEnv | null {
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
  return { data, slots, slotMs, phaseShift: phase * slotMs };
}

function slotAge(i: number, slots: number, slotMs: number, phaseShift: number): number {
  return i === slots - 1 ? 0 : slotMs * (slots - 1 - i) + phaseShift;
}

/** Unpack phase + build one channel’s dots (or null). */
function envelopeChannelDots(
  buf: Float32Array | null,
  channel: number,
  windowMs: number,
): EnvDot[] | null {
  const u = unpackEnvBuf(buf, windowMs);
  if (!u) return null;
  const pts: EnvDot[] = [];
  for (let i = 0; i < u.slots; ++i) {
    pts.push({
      x: slotAge(i, u.slots, u.slotMs, u.phaseShift),
      y: linToDb(u.data[i * ENV_CHANNELS + channel] ?? 0),
    });
  }
  return pts;
}

/**
 * Per-slot max or min of two linear channels → dB dots.
 * Used for outer = max(in,out) / mask = min(in,out) paint stack.
 */
function envelopeMaxMinDots(
  buf: Float32Array | null,
  chA: number,
  chB: number,
  windowMs: number,
  mode: 'max' | 'min',
): EnvDot[] | null {
  const u = unpackEnvBuf(buf, windowMs);
  if (!u) return null;
  const pts: EnvDot[] = [];
  for (let i = 0; i < u.slots; ++i) {
    const a = u.data[i * ENV_CHANNELS + chA] ?? 0;
    const b = u.data[i * ENV_CHANNELS + chB] ?? 0;
    const lin = mode === 'max' ? Math.max(a, b) : Math.min(a, b);
    pts.push({
      x: slotAge(i, u.slots, u.slotMs, u.phaseShift),
      y: linToDb(lin),
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
  outer: AuxGraph | null;
  mask: AuxGraph | null;
  result: AuxGraph | null;
};

/**
 * Scrolling envelope for the transient shaper.
 *
 * Paint (back→front): outer max(in,out) gradient fill → min mask
 * (background/semi) → thin light result line (Output / Envelope / Attack /
 * Release via `view$`). Difference tips glow; line marks cut vs boost.
 */
export function EnvelopeChart(props: EnvelopeChartProps) {
  const { data$, view$, vizId = 'env', className } = props;
  const chartRef = useRef<AuxChartInstance | null>(null);
  const graphsRef = useRef<Graphs>({
    outer: null,
    mask: null,
    result: null,
  });
  const graphBindingsRef = useRef<Bindings[]>([]);
  const resizeRoRef = useRef<ResizeObserver | null>(null);
  const [chartSvg, setChartSvg] = useState<SVGSVGElement | null>(null);

  // CSS vars for fill-gradient on outer; no inline paint targets.
  useChartGradient({
    svg: chartSvg,
    enabled: !!chartSvg,
  });

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
    const { outer, mask, result } = graphsRef.current;
    graphsRef.current = { outer: null, mask: null, result: null };
    chartRef.current = null;
    setChartSvg(null);
    if (!chart || chart.isDestructed?.()) return;
    if (outer) chart.removeGraph(outer);
    if (mask) chart.removeGraph(mask);
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

      // Paint order = DOM order: outer (back) → mask → result (front).
      if (!graphsRef.current.outer) {
        const g = chart.addGraph({
          dots: null,
          type: 'L',
          mode: 'bottom',
          class: 'env-outer-graph',
        });
        addGraphClasses(g.element, 'env-outer-graph', GRAPH_STYLE.outerDiff);
        graphsRef.current.outer = g;
      }
      if (!graphsRef.current.mask) {
        const g = chart.addGraph({
          dots: null,
          type: 'L',
          mode: 'bottom',
          class: 'env-mask-graph',
        });
        addGraphClasses(g.element, 'env-mask-graph', GRAPH_STYLE.maskDiff);
        graphsRef.current.mask = g;
      }
      if (!graphsRef.current.result) {
        const g = chart.addGraph({
          dots: null,
          type: 'L',
          mode: 'line',
          class: 'env-result-graph',
        });
        addGraphClasses(g.element, 'env-result-graph', GRAPH_STYLE.gainEdge);
        graphsRef.current.result = g;
      }
      graphsRef.current.outer?.element?.parentElement?.appendChild(
        graphsRef.current.outer.element,
      );
      graphsRef.current.mask?.element?.parentElement?.appendChild(
        graphsRef.current.mask.element,
      );
      graphsRef.current.result?.element?.parentElement?.appendChild(
        graphsRef.current.result.element,
      );

      const { outer, mask, result } = graphsRef.current;
      const bindings: Bindings[] = [];
      if (outer) {
        bindings.push(
          bindAuxOptions(outer, [
            {
              name: 'dots',
              backendValue: data$,
              readonly: true,
              transformReceive: (buf: unknown) =>
                envelopeMaxMinDots(
                  buf as Float32Array | null,
                  CH_ORIGINAL,
                  CH_OUTPUT,
                  ENVELOPE_WINDOW_MS,
                  'max',
                ),
            },
          ]),
        );
      }
      if (mask) {
        bindings.push(
          bindAuxOptions(mask, [
            {
              name: 'dots',
              backendValue: data$,
              readonly: true,
              transformReceive: (buf: unknown) =>
                envelopeMaxMinDots(
                  buf as Float32Array | null,
                  CH_ORIGINAL,
                  CH_OUTPUT,
                  ENVELOPE_WINDOW_MS,
                  'min',
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
