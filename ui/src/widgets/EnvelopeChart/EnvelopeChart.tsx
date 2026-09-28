import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import { ListValue } from '@deutschesoft/awml';
import type { Bindings } from '@deutschesoft/awml/src/bindings.js';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { bindAuxOptions } from '../../utils/aux_bindings';
import {
  AUTO_SCALE_HARD_MIN,
  ChartYAutoScale,
} from '../../utils/chartAutoScale';
import { buildDbGridY, buildTimeGridX } from '../../utils/chartGrid';
import { observeVizBins } from '../../utils/vizBins';
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

const ENV_GRID_Y = {
  majorClass: 'env-grid-major',
  minorClass: 'env-grid-minor',
} as const;

const ChartBindings = {};
const ChartOptions = {
  auto_size: true,
  show_grid: true,
  label: false,
  range_x: { min: 0, max: ENVELOPE_WINDOW_MS, reverse: true },
  // Do not set reverse here — Chart.initialize forces range_y.reverse=true
  // (higher dB at the top). A later set(range_y,{reverse:false}) would flip it.
  range_y: { min: DB_MIN, max: DB_MAX },
  grid_x: buildTimeGridX(ENVELOPE_WINDOW_MS, {
    everyClass: 'env-grid-time',
    labelEvery: true,
  }),
  grid_y: buildDbGridY(DB_MIN, DB_MAX, DB_GRID, DB_LABEL, ENV_GRID_Y),
};

const ChartWidget = componentFromWidget(
  AuxChart,
  ChartBindings,
  ChartOptions,
  'EnvelopeChart',
);

function linToDb(lin: number): number {
  if (!(lin > 1e-10)) return AUTO_SCALE_HARD_MIN;
  return Math.max(
    AUTO_SCALE_HARD_MIN,
    Math.min(DB_MAX, 20 * Math.log10(lin)),
  );
}

function resultChannelForView(view: number): number {
  const v = Math.round(view);
  if (v === 0) return CH_OUTPUT;
  if (v === 1) return CH_ENVELOPE;
  if (v === 2) return CH_ATTACK;
  return CH_RELEASE;
}

/**
 * Deepest plotted Y across outer fill (max in/out) and the active result line.
 * `null` when there is no buffer yet.
 */
function envelopeDeepestDb(
  buf: Float32Array | null,
  view: number,
): number | null {
  const u = unpackEnvBuf(buf, ENVELOPE_WINDOW_MS);
  if (!u) return null;
  const resultCh = resultChannelForView(view);
  let deepest = Infinity;
  let sawReal = false;
  const consider = (y: number) => {
    if (!(y > AUTO_SCALE_HARD_MIN)) return;
    sawReal = true;
    if (y < deepest) deepest = y;
  };
  for (let i = 0; i < u.slots; ++i) {
    const base = i * ENV_CHANNELS;
    const a = u.data[base + CH_ORIGINAL] ?? 0;
    const b = u.data[base + CH_OUTPUT] ?? 0;
    consider(linToDb(Math.max(a, b)));
    consider(linToDb(u.data[base + resultCh] ?? 0));
  }
  if (!sawReal || !(deepest < Infinity)) return AUTO_SCALE_HARD_MIN;
  return deepest;
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
  /**
   * Glide `range_y.min` to the deepest visible envelope (HistoryChart-style).
   * Default off so other callers keep the fixed −60…12 dB frame.
   */
  autoScale?: boolean;
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
  const { data$, view$, vizId = 'env', autoScale = false, className } = props;
  const chartRef = useRef<AuxChartInstance | null>(null);
  const graphsRef = useRef<Graphs>({
    outer: null,
    mask: null,
    result: null,
  });
  const graphBindingsRef = useRef<Bindings[]>([]);
  const vizBinsStopRef = useRef<(() => void) | null>(null);
  const autoScaleUnsubRef = useRef<(() => void) | null>(null);
  const viewUnsubRef = useRef<(() => void) | null>(null);
  const autoScaleRef = useRef(autoScale);
  autoScaleRef.current = autoScale;
  const yAutoScaleRef = useRef(new ChartYAutoScale());
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

  const applyAutoScale = useCallback(
    (chart: AuxChartInstance, buf: Float32Array | null) => {
      if (!autoScaleRef.current) return;
      const deepest = envelopeDeepestDb(buf, view$.value ?? 0);
      yAutoScaleRef.current.apply(chart, deepest, DB_MAX, (min) => {
        chart.set(
          'grid_y',
          buildDbGridY(min, DB_MAX, DB_GRID, DB_LABEL, ENV_GRID_Y),
        );
      });
    },
    [view$],
  );

  const detach = useCallback(() => {
    vizBinsStopRef.current?.();
    vizBinsStopRef.current = null;
    yAutoScaleRef.current.cancelAnim();
    autoScaleUnsubRef.current?.();
    autoScaleUnsubRef.current = null;
    viewUnsubRef.current?.();
    viewUnsubRef.current = null;
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
      autoScaleUnsubRef.current?.();
      autoScaleUnsubRef.current = null;
      viewUnsubRef.current?.();
      viewUnsubRef.current = null;

      chart.set('range_x', {
        min: 0,
        max: ENVELOPE_WINDOW_MS,
        reverse: true,
      });
      chart.set(
        'grid_x',
        buildTimeGridX(ENVELOPE_WINDOW_MS, {
          everyClass: 'env-grid-time',
          labelEvery: true,
        }),
      );

      const scaler = yAutoScaleRef.current;
      scaler.setEnabled(!!autoScale);
      const yMin = autoScale ? scaler.rangeMin : DB_MIN;
      chart.set('range_y', { min: yMin, max: DB_MAX, reverse: true });
      chart.set(
        'grid_y',
        buildDbGridY(yMin, DB_MAX, DB_GRID, DB_LABEL, ENV_GRID_Y),
      );

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

      if (autoScale) {
        applyAutoScale(chart, data$.value as Float32Array | null);
        autoScaleUnsubRef.current = data$.subscribe((v) => {
          applyAutoScale(chart, v as Float32Array | null);
        });
        viewUnsubRef.current = view$.subscribe(() => {
          applyAutoScale(chart, data$.value as Float32Array | null);
        });
      }

      setChartSvg(chart.svg ?? null);

      const el = chart.element ?? chart.svg;
      if (el) {
        vizBinsStopRef.current?.();
        vizBinsStopRef.current = observeVizBins(el, vizId);
      }
    },
    [applyAutoScale, autoScale, data$, resultSource$, view$, vizId],
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
