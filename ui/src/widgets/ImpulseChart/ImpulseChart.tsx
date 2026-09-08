import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart as AuxChart,
  ChartHandle as AuxChartHandle,
} from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import {
  componentFromWidget,
  useDynamicValueReadonly,
  useWidgetsWithBindingsAndEvents,
} from '@deutschesoft/use-aux-widgets';
import { postToHost } from '../../bridge';
import { useChartGradient } from '../../hooks/useChartGradient';
import './ImpulseChart.scss';

const DB_MAX = 6;
const DB_MIN = -90;
const PREDELAY_MAX_MS = 500;
const SHAPE_POINTS = 48;
const SHAPE_MIN = 1;
const SHAPE_MAX = 8;
const DECAY_MIN = 0.15;

function buildDbGridY() {
  const lines: { pos: number; label?: string; class?: string }[] = [];
  for (let db = 0; db >= DB_MIN; db -= 6) {
    lines.push({
      pos: db,
      label: `${db}`,
      class: db === 0 || db % 12 === 0 ? 'major' : undefined,
    });
  }
  return lines;
}

/** Decay overlay in dB. Matches `irDecayGainAt` — power on the dB ramp. */
function fadeDb(t: number, shape: number): number {
  const u = Math.min(1, Math.max(0, t));
  const p = Math.min(SHAPE_MAX, Math.max(SHAPE_MIN, shape));
  return DB_MIN * u ** p;
}

function formatMs(ms: number): string {
  if (ms >= 1000) {
    const s = ms / 1000;
    return Number.isInteger(s) ? `${s}s` : `${s.toFixed(1)}s`;
  }
  return `${Math.round(ms)}`;
}

function buildTimeGridX(maxMs: number) {
  const span = Math.max(100, maxMs);
  const step = span >= 8000 ? 2000 : span >= 4000 ? 1000 : span >= 2000 ? 500 : 250;
  const lines: { pos: number; label?: string; class?: string }[] = [];
  for (let t = 0; t <= span + 1e-6; t += step) {
    const pos = Math.round(t);
    const major = pos === 0 || pos % (step * 2) === 0;
    lines.push({
      pos,
      label: major ? formatMs(pos) : undefined,
      class: major ? 'major' : undefined,
    });
  }
  return lines;
}

function origMsFromWave(raw: number[] | undefined): number {
  const v = raw && raw.length >= 3 ? raw : [0, 0, 0];
  return Math.max(0, v[1] ?? 0) || 1000;
}

function clampPredelay(ms: number): number {
  return Math.max(0, Math.min(PREDELAY_MAX_MS, ms || 0));
}

function clampDecay(v: number): number {
  return Math.max(DECAY_MIN, Math.min(1, v));
}

function decayToX(decay: number, origMs: number, predelay: number): number {
  return clampPredelay(predelay) + clampDecay(decay) * origMs;
}

function xToDecay(x: number, origMs: number, predelay: number): number {
  const orig = origMs || 1;
  return clampDecay((Number(x) - clampPredelay(predelay)) / orig);
}

const ChartBindings = {};
const ChartOptions = {
  auto_size: true,
  show_grid: true,
  label: false,
  range_x: { min: 0, max: 1000 },
  range_y: { min: DB_MIN, max: DB_MAX },
  grid_x: buildTimeGridX(1000),
  grid_y: buildDbGridY(),
};

const ChartWidget = componentFromWidget(
  AuxChart,
  ChartBindings,
  ChartOptions,
  'ImpulseChart',
);

type AuxGraph = {
  set: (k: string, v: unknown) => void;
  element?: SVGElement;
  destroyAndRemove?: () => void;
  destroy?: () => void;
};

/**
 * Chart.removeGraph only unlinks the widget tree — the SVG path stays in
 * `_graphs`. destroyAndRemove drops the path (same pitfall as ReverbChart).
 */
function disposeGraph(chart: AuxChartInstance, g: AuxGraph) {
  try {
    g.destroyAndRemove?.();
    return;
  } catch {
    // fall through
  }
  const el = g.element ?? null;
  try {
    chart.removeGraph(g);
  } catch {
    // already detached
  }
  try {
    g.destroy?.();
  } catch {
    // ignore
  }
  el?.remove?.();
}

type AuxChartInstance = {
  isDestructed?: () => boolean;
  element?: Element;
  svg?: SVGSVGElement;
  set: (k: string, v: unknown) => void;
  addGraph: (opts: unknown) => AuxGraph;
  removeGraph: (g: AuxGraph) => void;
  addHandle?: (h: unknown) => unknown;
  removeHandle?: (h: unknown) => void;
};

export interface ImpulseChartProps {
  data$: DynamicValue<number[]>;
  decay$: DynamicValue<number>;
  predelay$: DynamicValue<number>;
  shape$: DynamicValue<number>;
  beginEdit?: () => void;
  endEdit?: () => void;
  className?: string;
}

/**
 * IR energy envelope (dB vs time) + decay handle on an Aux Chart.
 * Viz: [bins, origMs, usedMs, db0…].
 */
export function ImpulseChart(props: ImpulseChartProps) {
  const { data$, decay$, predelay$, shape$, beginEdit, endEdit, className } = props;
  const data = useDynamicValueReadonly(data$, []);
  const decay = useDynamicValueReadonly(decay$, 1);
  const predelay = useDynamicValueReadonly(predelay$, 0);
  const shape = useDynamicValueReadonly(shape$, 4);

  const origMs = origMsFromWave(data);
  const pre = clampPredelay(predelay);

  const chartRef = useRef<AuxChartInstance | null>(null);
  const irGraphRef = useRef<AuxGraph | null>(null);
  const decayGraphRef = useRef<AuxGraph | null>(null);
  const resizeRoRef = useRef<ResizeObserver | null>(null);
  const [chart, setChart] = useState<AuxChartInstance | null>(null);
  const [chartSvg, setChartSvg] = useState<SVGSVGElement | null>(null);
  const [gradTarget, setGradTarget] = useState<SVGElement | null>(null);

  const handleOptions = useMemo(
    () => [
      {
        mode: 'line-vertical',
        class: 'ir-decay-handle',
        label: '',
        format_label: (_l: string, x: number) => formatMs(x),
        y: DB_MIN,
        z: 0.707,
        y_min: DB_MIN,
        y_max: DB_MAX,
        x_min: pre + DECAY_MIN * origMs,
        x_max: pre + origMs,
        show_axis: false,
        min_size: 18,
        max_size: 18,
      },
    ],
    [origMs, pre],
  );

  const handleBindings = useMemo(
    () => [
      [
        {
          name: 'x',
          backendValue: decay$,
          transformReceive: (d: number) => decayToX(d, origMs, pre),
          transformSend: (x: number) => xToDecay(x, origMs, pre),
        },
      ],
    ],
    [decay$, origMs, pre],
  );

  const handleEvents = useMemo(
    () => [
      {
        set_interacting: (on: unknown) => {
          if (on)
            beginEdit?.();
          else
            endEdit?.();
        },
      },
    ],
    [beginEdit, endEdit],
  );

  const handles = useWidgetsWithBindingsAndEvents(
    AuxChartHandle,
    handleOptions,
    handleBindings,
    handleEvents,
  );
  const handle = handles[0];

  const reassertGrad = useChartGradient({
    svg: chartSvg,
    targets: gradTarget ? [gradTarget] : [],
    paint: 'stroke',
  });

  const sendVizBins = useCallback((el: Element) => {
    const width = Math.round(el.getBoundingClientRect().width);
    const bins = Math.max(64, Math.min(1024, width));
    postToHost({ t: 'vizcfg', id: 'impulse', bins });
  }, []);

  const detach = useCallback(() => {
    resizeRoRef.current?.disconnect();
    resizeRoRef.current = null;
    const inst = chartRef.current;
    const ir = irGraphRef.current;
    const dec = decayGraphRef.current;
    irGraphRef.current = null;
    decayGraphRef.current = null;
    chartRef.current = null;
    setChart(null);
    setChartSvg(null);
    setGradTarget(null);
    if (!inst || inst.isDestructed?.())
      return;
    if (dec)
      disposeGraph(inst, dec);
    if (ir)
      disposeGraph(inst, ir);
  }, []);

  const attach = useCallback(
    (inst: AuxChartInstance) => {
      chartRef.current = inst;
      setChart(inst);
      if (inst.isDestructed?.())
        return;

      // Idempotent: use-aux-widgets re-calls widgetRef when the callback
      // identity changes, without nulling the old ref — never double-add.
      if (!irGraphRef.current) {
        const ir = inst.addGraph({
          dots: null,
          type: 'L',
          mode: 'bottom',
          class: 'ir-wave',
        });
        ir.element?.classList.add('ir-wave');
        irGraphRef.current = ir;
        const dec = inst.addGraph({
          dots: null,
          type: 'L',
          mode: 'line',
          class: 'ir-decay',
        });
        dec.element?.classList.add('ir-decay');
        decayGraphRef.current = dec;
        setGradTarget(dec.element ?? null);
      }

      setChartSvg(inst.svg ?? null);

      if (!resizeRoRef.current) {
        const el = inst.element ?? inst.svg;
        if (el) {
          sendVizBins(el);
          let raf = 0;
          const ro = new ResizeObserver(() => {
            if (raf)
              cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => sendVizBins(el));
          });
          ro.observe(el);
          resizeRoRef.current = ro;
        }
      }
    },
    [sendVizBins],
  );

  const widgetRef = useCallback(
    (inst: AuxChartInstance | null) => {
      if (!inst) {
        detach();
        return;
      }
      if (chartRef.current && chartRef.current !== inst)
        detach();
      attach(inst);
    },
    [attach, detach],
  );

  useEffect(() => {
    const inst = chart;
    if (!inst || !handle || inst.isDestructed?.())
      return;
    inst.addHandle?.(handle);
    return () => {
      if (inst.isDestructed?.())
        return;
      inst.removeHandle?.(handle);
    };
  }, [chart, handle]);

  useEffect(() => {
    const inst = chartRef.current;
    const ir = irGraphRef.current;
    const dec = decayGraphRef.current;
    if (!inst || !ir)
      return;
    const v = data && data.length >= 3 ? data : [0, 0, 0];
    const bins = Math.max(0, Math.round(v[0] ?? 0));
    const capturedMs = Math.max(0, v[1] ?? 0);
    const span = Math.max(PREDELAY_MAX_MS, capturedMs + PREDELAY_MAX_MS);
    inst.set('range_x', { min: 0, max: span });
    inst.set('grid_x', buildTimeGridX(span));

    if (bins < 2 || v.length < 3 + bins) {
      ir.set('dots', null);
      dec?.set('dots', null);
      return;
    }

    const irPts: { x: number; y: number }[] = [];
    for (let i = 0; i < bins; ++i) {
      const x = pre + (i / Math.max(1, bins - 1)) * capturedMs;
      irPts.push({ x, y: v[3 + i] ?? DB_MIN });
    }
    ir.set('dots', irPts);

    const usedMs = Math.max(0, Math.min(capturedMs, capturedMs * decay));
    if (decay < 0.999 && usedMs > 0) {
      const decayPts: { x: number; y: number }[] = [];
      for (let i = 0; i <= SHAPE_POINTS; ++i) {
        const t = i / SHAPE_POINTS;
        decayPts.push({ x: pre + t * usedMs, y: fadeDb(t, shape) });
      }
      if (usedMs < capturedMs)
        decayPts.push({ x: pre + capturedMs, y: DB_MIN });
      dec?.set('dots', decayPts);
    } else {
      dec?.set('dots', null);
    }
    reassertGrad();
  }, [chart, data, decay, pre, shape, reassertGrad]);

  useEffect(() => () => detach(), [detach]);

  const cls = ['ImpulseChart', className ?? ''].filter(Boolean).join(' ');
  return (
    <ChartWidget
      className={cls}
      widgetRef={widgetRef}
    />
  );
}
