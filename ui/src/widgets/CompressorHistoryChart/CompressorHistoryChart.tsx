import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { postToHost } from '../../bridge';
import { useChartGradient } from '../../hooks/useChartGradient';
import './CompressorHistoryChart.scss';

/** Per-slot: audio peak (lin), GR (lin 0…1). + trailing phase. */
const HIST_CHANNELS = 2;
const CH_AUDIO = 0;
const CH_GR = 1;

const DB_MAX = 0;
const DB_MIN = -48;
const DB_GRID = 6;
const DB_LABEL = 12;

/** Fixed history window (ms) — keep in sync with DSP kHistoryDisplayMs. */
export const COMPRESSOR_HISTORY_MS = 10000;
const HISTORY_GRID_STEP_MS = 1000;

function buildDbGridY(
  min: number,
  max: number,
  step: number,
  labelStep: number,
) {
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

function linToDb(lin: number): number {
  if (!(lin > 1e-12)) return DB_MIN;
  return Math.max(DB_MIN, Math.min(DB_MAX, 20 * Math.log10(lin)));
}

function grLinToDb(lin: number): number {
  if (!(lin > 1e-12)) return DB_MIN;
  return Math.max(DB_MIN, Math.min(DB_MAX, 20 * Math.log10(lin)));
}

const ChartBindings = {};
const ChartOptions = {
  auto_size: true,
  show_grid: true,
  label: false,
  range_x: { min: 0, max: COMPRESSOR_HISTORY_MS, reverse: true },
  range_y: { min: DB_MIN, max: DB_MAX },
  grid_x: buildTimeGridX(COMPRESSOR_HISTORY_MS),
  grid_y: buildDbGridY(DB_MIN, DB_MAX, DB_GRID, DB_LABEL),
};

const ChartWidget = componentFromWidget(
  AuxChart,
  ChartBindings,
  ChartOptions,
  'CompressorHistoryChart',
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

export interface CompressorHistoryChartProps {
  data$: DynamicValue<Float32Array | null>;
  className?: string;
}

/**
 * Scrolling audio peak (filled) + gain-reduction curve (0 dB at top, dips down).
 * Fixed 10 s time window.
 */
export function CompressorHistoryChart(props: CompressorHistoryChartProps) {
  const { data$, className } = props;

  const dataRef = useRef(data$.value);
  const chartRef = useRef<AuxChartInstance | null>(null);
  const graphsRef = useRef<{ audio: AuxGraph | null; gr: AuxGraph | null }>({
    audio: null,
    gr: null,
  });
  const resizeRoRef = useRef<ResizeObserver | null>(null);
  const [chartSvg, setChartSvg] = useState<SVGSVGElement | null>(null);
  const [grPath, setGrPath] = useState<SVGElement | null>(null);

  const grTargets = useMemo(() => (grPath ? [grPath] : []), [grPath]);
  const reassertGradStroke = useChartGradient({
    svg: chartSvg,
    targets: grTargets,
    paint: 'stroke',
    // GR: 0 dB at top → blue; deeper reduction toward bottom → red.
    reverse: true,
  });

  const buildPoints = useCallback(
    (buf: Float32Array | null) => {
      const { audio, gr } = graphsRef.current;
      if (!buf || buf.length < HIST_CHANNELS) {
        audio?.set('dots', null);
        gr?.set('dots', null);
        return;
      }

      let phase = 0;
      let data = buf;
      if (buf.length % HIST_CHANNELS === 1) {
        phase = buf[buf.length - 1] ?? 0;
        data = buf.subarray(0, buf.length - 1);
      }

      const slots = Math.floor(data.length / HIST_CHANNELS);
      if (slots < 1) {
        audio?.set('dots', null);
        gr?.set('dots', null);
        return;
      }

      const displayMs = COMPRESSOR_HISTORY_MS;
      const slotMs = slots > 1 ? displayMs / (slots - 1) : displayMs;
      const phaseShift = phase * slotMs;
      const audioPts: { x: number; y: number }[] = [];
      const grPts: { x: number; y: number }[] = [];
      for (let i = 0; i < slots; ++i) {
        const age = i === slots - 1 ? 0 : slotMs * (slots - 1 - i) + phaseShift;
        audioPts.push({
          x: age,
          y: linToDb(data[i * HIST_CHANNELS + CH_AUDIO] ?? 0),
        });
        grPts.push({
          x: age,
          y: grLinToDb(data[i * HIST_CHANNELS + CH_GR] ?? 1),
        });
      }
      audio?.set('dots', audioPts);
      gr?.set('dots', grPts);
      gr?.toFront?.();
      reassertGradStroke();
    },
    [reassertGradStroke],
  );

  const sendVizBins = useCallback((el: Element) => {
    const width = Math.round(el.getBoundingClientRect().width);
    const bins = Math.max(48, Math.min(128, width));
    postToHost({ t: 'vizcfg', id: 'comp', bins });
  }, []);

  const detach = useCallback(() => {
    resizeRoRef.current?.disconnect();
    resizeRoRef.current = null;
    const chart = chartRef.current;
    const { audio, gr } = graphsRef.current;
    graphsRef.current = { audio: null, gr: null };
    chartRef.current = null;
    setChartSvg(null);
    setGrPath(null);
    if (!chart || chart.isDestructed?.()) return;
    if (audio) chart.removeGraph(audio);
    if (gr) chart.removeGraph(gr);
  }, []);

  const attach = useCallback(
    (chart: AuxChartInstance) => {
      chartRef.current = chart;
      if (chart.isDestructed?.()) return;

      chart.set('range_x', {
        min: 0,
        max: COMPRESSOR_HISTORY_MS,
        reverse: true,
      });
      chart.set('grid_x', buildTimeGridX(COMPRESSOR_HISTORY_MS));

      if (!graphsRef.current.audio) {
        const audio = chart.addGraph({
          dots: null,
          type: 'L',
          mode: 'bottom',
          class: 'comp-hist-audio',
        });
        audio.element?.classList.add('comp-hist-audio');
        graphsRef.current.audio = audio;
      }
      if (!graphsRef.current.gr) {
        const gr = chart.addGraph({
          dots: null,
          type: 'L',
          mode: 'line',
          class: 'comp-hist-gr',
        });
        gr.element?.classList.add('comp-hist-gr');
        graphsRef.current.gr = gr;
      }
      graphsRef.current.gr?.toFront?.();
      setChartSvg(chart.svg ?? null);
      setGrPath(graphsRef.current.gr?.element ?? null);
      buildPoints(dataRef.current);

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
        buildPoints(dataRef.current);
      });
    };
    sync();
    const unsubData = data$.subscribe((v) => {
      dataRef.current = v;
      sync();
    }, false);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      unsubData();
    };
  }, [buildPoints, data$]);

  useEffect(() => () => detach(), [detach]);

  const cls = ['CompressorHistoryChart', className ?? '']
    .filter(Boolean)
    .join(' ');

  return <ChartWidget className={cls} widgetRef={widgetRef} />;
}
