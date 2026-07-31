import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { postToHost } from '../../bridge';
import { useChartGradient } from '../../hooks/useChartGradient';
import './EnvelopeChart.scss';

const ENV_CHANNELS = 5;
// Indices within each 5-float slot
const CH_DETECTOR = 0;
const CH_OUTPUT = 1;
const CH_ENVELOPE = 2;
const CH_ATTACK = 3;
const CH_RELEASE = 4;

const DB_MAX = 12;
const DB_MIN = -60;
const DB_GRID = 6;
const DB_LABEL = 12;

/** Discrete display windows (ms) — keep in sync with DSP / TRANSIENTS_DISPLAY_MS. */
export const DISPLAY_MS_OPTIONS = [100, 250, 500, 1000, 2500, 5000] as const;

/** Grid step per window length — ~4 labeled ticks across the chart. */
const DISPLAY_GRID_STEP_MS: Record<number, number> = {
  100: 25,
  250: 50,
  500: 100,
  1000: 250,
  2500: 500,
  5000: 1000,
};

function snapDisplayMs(v: number): number {
  let best: number = DISPLAY_MS_OPTIONS[0];
  let bestErr = Math.abs(v - best);
  for (const cand of DISPLAY_MS_OPTIONS) {
    const err = Math.abs(v - cand);
    if (err < bestErr) {
      best = cand;
      bestErr = err;
    }
  }
  return best;
}

function buildDbGridY(min: number, max: number, step: number, labelStep: number) {
  const lines: { pos: number; label?: string; class?: string }[] = [];
  // Integer steps avoid float drift; AUX skips lines exactly at range min/max.
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

/**
 * Time axis grid (vertical lines).
 * AUX places labels left→right and drops overlaps (`x < last`). With range_x
 * reverse (0=now on the right), entries must be ordered past→now so the first
 * label is on the left; otherwise only the rightmost "0" survives.
 * AUX also omits lines exactly at range min/max — labels there are fine.
 */
function buildTimeGridX(displayMs: number) {
  const step = DISPLAY_GRID_STEP_MS[displayMs] ?? displayMs / 4;
  const lines: { pos: number; label: string; class: string }[] = [];
  for (let t = displayMs; t >= -1e-9; t -= step) {
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
  // reverse: 0 (now) on the right, displayMs (past) on the left
  range_x: { min: 0, max: 1000, reverse: true },
  range_y: { min: DB_MIN, max: DB_MAX, reverse: false },
  grid_x: buildTimeGridX(1000),
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
  display$: DynamicValue<number>;
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

/**
 * AUX Chart-based scrolling envelope display for the transient shaper.
 *
 * Slot layout (5 floats each): input peak, output peak, envelope, attack, release.
 * Time axis: left = −display ms, right = now (0). View modes select the overlay curve.
 */
export function EnvelopeChart(props: EnvelopeChartProps) {
  const { data$, view$, display$, className } = props;
  const dataRef = useRef<Float32Array | null>(data$.value);
  const viewRef = useRef<number>(view$.value);
  const displayRef = useRef<number>(snapDisplayMs(display$.value));
  const chartRef = useRef<AuxChartInstance | null>(null);
  const graphsRef = useRef<{ input: AuxGraph | null; curve: AuxGraph | null }>({
    input: null,
    curve: null,
  });
  const resizeRoRef = useRef<ResizeObserver | null>(null);
  const [chartSvg, setChartSvg] = useState<SVGSVGElement | null>(null);
  const [curvePath, setCurvePath] = useState<SVGElement | null>(null);

  const curveTargets = useMemo(
    () => (curvePath ? [curvePath] : []),
    [curvePath],
  );
  const reassertGradStroke = useChartGradient({
    svg: chartSvg,
    targets: curveTargets,
    paint: 'stroke',
  });

  const applyDisplayWindow = useCallback((displayMs: number) => {
    const chart = chartRef.current;
    if (!chart || chart.isDestructed?.()) return;
    chart.set('range_x', { min: 0, max: displayMs, reverse: true });
    chart.set('grid_x', buildTimeGridX(displayMs));
  }, []);

  const buildPoints = useCallback(
    (buf: Float32Array | null, view: number, displayMs: number) => {
      const { input, curve } = graphsRef.current;
      // AUX Graph mode "bottom" crashes on empty dots[] (reads dots[0].type).
      if (!buf || buf.length < ENV_CHANNELS) {
        input?.set('dots', null);
        curve?.set('dots', null);
        return;
      }

      // Optional trailing scroll phase (0…1) from DSP for sub-slot smoothness.
      let phase = 0;
      let data = buf;
      if (buf.length % ENV_CHANNELS === 1) {
        phase = buf[buf.length - 1] ?? 0;
        data = buf.subarray(0, buf.length - 1);
      }

      const slots = Math.floor(data.length / ENV_CHANNELS);
      if (slots < 1) {
        input?.set('dots', null);
        curve?.set('dots', null);
        return;
      }
      const curveChannel =
        view === 0
          ? CH_OUTPUT
          : view === 1
            ? CH_ENVELOPE
            : view === 2
              ? CH_ATTACK
              : CH_RELEASE;
      const slotMs = slots > 1 ? displayMs / (slots - 1) : displayMs;
      const phaseShift = phase * slotMs;
      const inPts: { x: number; y: number }[] = [];
      const outPts: { x: number; y: number }[] = [];
      for (let i = 0; i < slots; ++i) {
        // Newest stays at age 0 (right); older slots drift left as phase fills.
        const age =
          i === slots - 1 ? 0 : slotMs * (slots - 1 - i) + phaseShift;
        inPts.push({
          x: age,
          y: linToDb(data[i * ENV_CHANNELS + CH_DETECTOR] ?? 0),
        });
        outPts.push({
          x: age,
          y: linToDb(data[i * ENV_CHANNELS + curveChannel] ?? 0),
        });
      }
      input?.set('dots', inPts);
      curve?.set('dots', outPts);
      curve?.toFront?.();
      reassertGradStroke();
    },
    [reassertGradStroke],
  );

  const sendVizBins = useCallback((el: Element) => {
    const width = Math.round(el.getBoundingClientRect().width);
    // Aim for ~1 sample per CSS pixel; DSP ring is capped at 512 slots.
    const bins = Math.max(48, Math.min(512, width));
    postToHost({ t: 'vizcfg', id: 'env', bins });
  }, []);

  const detach = useCallback(() => {
    resizeRoRef.current?.disconnect();
    resizeRoRef.current = null;
    const chart = chartRef.current;
    const { input, curve } = graphsRef.current;
    graphsRef.current = { input: null, curve: null };
    chartRef.current = null;
    setChartSvg(null);
    setCurvePath(null);
    if (!chart || chart.isDestructed?.()) return;
    if (input) chart.removeGraph(input);
    if (curve) chart.removeGraph(curve);
  }, []);

  const attach = useCallback(
    (chart: AuxChartInstance) => {
      chartRef.current = chart;
      if (chart.isDestructed?.()) return;

      applyDisplayWindow(displayRef.current);

      if (!graphsRef.current.input) {
        const input = chart.addGraph({
          dots: null,
          type: 'L',
          mode: 'bottom',
          class: 'env-input-graph',
        });
        input.element?.classList.add('env-input-graph');
        graphsRef.current.input = input;
      }
      if (!graphsRef.current.curve) {
        const curve = chart.addGraph({
          dots: null,
          type: 'L',
          mode: 'line',
          class: 'env-curve-graph',
        });
        curve.element?.classList.add('env-curve-graph');
        graphsRef.current.curve = curve;
      }
      graphsRef.current.curve?.toFront?.();
      setChartSvg(chart.svg ?? null);
      setCurvePath(graphsRef.current.curve?.element ?? null);
      buildPoints(dataRef.current, viewRef.current, displayRef.current);

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
    [applyDisplayWindow, buildPoints, sendVizBins],
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
        buildPoints(dataRef.current, viewRef.current, displayRef.current);
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
    const unsubDisplay = display$.subscribe((v) => {
      displayRef.current = snapDisplayMs(v);
      applyDisplayWindow(displayRef.current);
      sync();
    }, false);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      unsubData();
      unsubView();
      unsubDisplay();
    };
  }, [applyDisplayWindow, buildPoints, data$, display$, view$]);

  useEffect(() => () => detach(), [detach]);

  const cls = ['EnvelopeChart', className ?? ''].filter(Boolean).join(' ');

  return <ChartWidget className={cls} widgetRef={widgetRef} />;
}
