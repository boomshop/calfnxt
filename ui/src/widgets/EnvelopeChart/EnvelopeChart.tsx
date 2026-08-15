import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { postToHost } from '../../bridge';
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
 * (Output / Envelope / Attack / Release via `view$`).
 */
export function EnvelopeChart(props: EnvelopeChartProps) {
  const { data$, view$, vizId = 'env', className } = props;
  const dataRef = useRef<Float32Array | null>(data$.value);
  const viewRef = useRef<number>(view$.value);
  const chartRef = useRef<AuxChartInstance | null>(null);
  const graphsRef = useRef<Graphs>({
    original: null,
    filtered: null,
    result: null,
  });
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

  const buildPoints = useCallback(
    (buf: Float32Array | null, view: number) => {
      const { original, filtered, result } = graphsRef.current;
      if (!buf || buf.length < ENV_CHANNELS) {
        original?.set('dots', null);
        filtered?.set('dots', null);
        result?.set('dots', null);
        return;
      }

      let phase = 0;
      let data = buf;
      if (buf.length % ENV_CHANNELS === 1) {
        phase = buf[buf.length - 1] ?? 0;
        data = buf.subarray(0, buf.length - 1);
      }

      const slots = Math.floor(data.length / ENV_CHANNELS);
      if (slots < 1) {
        original?.set('dots', null);
        filtered?.set('dots', null);
        result?.set('dots', null);
        return;
      }

      const resultChannel =
        Math.round(view) === 0
          ? CH_OUTPUT
          : Math.round(view) === 1
            ? CH_ENVELOPE
            : Math.round(view) === 2
              ? CH_ATTACK
              : CH_RELEASE;

      const displayMs = ENVELOPE_WINDOW_MS;
      const slotMs = slots > 1 ? displayMs / (slots - 1) : displayMs;
      const phaseShift = phase * slotMs;
      const origPts: { x: number; y: number }[] = [];
      const filtPts: { x: number; y: number }[] = [];
      const resPts: { x: number; y: number }[] = [];
      for (let i = 0; i < slots; ++i) {
        const age =
          i === slots - 1 ? 0 : slotMs * (slots - 1 - i) + phaseShift;
        const base = i * ENV_CHANNELS;
        origPts.push({
          x: age,
          y: linToDb(data[base + CH_ORIGINAL] ?? 0),
        });
        filtPts.push({
          x: age,
          y: linToDb(data[base + CH_FILTERED] ?? 0),
        });
        resPts.push({
          x: age,
          y: linToDb(data[base + resultChannel] ?? 0),
        });
      }
      original?.set('dots', origPts);
      filtered?.set('dots', filtPts);
      result?.set('dots', resPts);
      // Do not toFront() here — DOM reordering every frame causes flicker.
      reassertGradStroke();
    },
    [reassertGradStroke],
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
      // One-shot stack: blue back, white mid, gradient front.
      graphsRef.current.original?.element?.parentElement?.appendChild(
        graphsRef.current.original.element,
      );
      graphsRef.current.filtered?.element?.parentElement?.appendChild(
        graphsRef.current.filtered.element,
      );
      graphsRef.current.result?.element?.parentElement?.appendChild(
        graphsRef.current.result.element,
      );
      setChartSvg(chart.svg ?? null);
      setResultPath(graphsRef.current.result?.element ?? null);
      buildPoints(dataRef.current, viewRef.current);

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
    [buildPoints, sendVizBins],
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

  useEffect(() => {
    let raf = 0;
    const sync = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        buildPoints(dataRef.current, viewRef.current);
      });
    };
    sync();
    const unsubData = data$.subscribe((v) => {
      dataRef.current = v;
      sync();
    }, false);
    const unsubView = view$.subscribe((v) => {
      viewRef.current = v;
      sync();
    }, false);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      unsubData();
      unsubView();
    };
  }, [buildPoints, data$, view$]);

  useEffect(() => () => detach(), [detach]);

  const cls = ['EnvelopeChart', className ?? ''].filter(Boolean).join(' ');

  return <ChartWidget className={cls} widgetRef={widgetRef} />;
}
