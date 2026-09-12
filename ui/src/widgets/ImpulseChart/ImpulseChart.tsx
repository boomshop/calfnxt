import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart as AuxChart,
  ChartHandle as AuxChartHandle,
} from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import { ListValue } from '@deutschesoft/awml';
import type { Bindings } from '@deutschesoft/awml/src/bindings.js';
import {
  componentFromWidget,
  useDynamicValueReadonly,
  useWidgetsWithBindingsAndEvents,
} from '@deutschesoft/use-aux-widgets';
import { bindAuxOptions } from '../../utils/aux_bindings';
import { postToHost } from '../../utils/bridge';
import { useChartGradient } from '../../hooks/useChartGradient';
import './ImpulseChart.scss';

const DB_MAX = 6;
const DB_MIN = -90;
const PREDELAY_MAX_MS = 500;
const SHAPE_POINTS = 48;
const SHAPE_MIN = 1;
const SHAPE_MAX = 8;
const DECAY_MIN = 0.15;
/** Stable empty wave header — never pass an inline `[]` to readonly hooks. */
const EMPTY_WAVE: number[] = [0, 0, 0];

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

function clampDb(y: number): number {
  return Math.min(DB_MAX, Math.max(DB_MIN, y));
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

type WaveDot = { x: number; y: number };
type WaveFrame = [number[], number, number, number];

function waveIrDots(raw: number[], pre: number): WaveDot[] | null {
  const v = raw && raw.length >= 3 ? raw : EMPTY_WAVE;
  const bins = Math.max(0, Math.round(v[0] ?? 0));
  const capturedMs = Math.max(0, v[1] ?? 0);
  if (bins < 2 || v.length < 3 + bins) return null;
  const irPts: WaveDot[] = [];
  for (let i = 0; i < bins; ++i) {
    const x = pre + (i / Math.max(1, bins - 1)) * capturedMs;
    irPts.push({ x, y: v[3 + i] ?? DB_MIN });
  }
  return irPts;
}

function waveUsedDots(
  raw: number[],
  decay: number,
  pre: number,
  shape: number,
): WaveDot[] | null {
  const irPts = waveIrDots(raw, pre);
  if (!irPts) return null;
  const v = raw && raw.length >= 3 ? raw : EMPTY_WAVE;
  const bins = Math.max(0, Math.round(v[0] ?? 0));
  const capturedMs = Math.max(0, v[1] ?? 0);
  const usedMs = Math.max(0, Math.min(capturedMs, capturedMs * decay));
  const applyFade = decay < 0.999 && usedMs > 0;
  if (!applyFade) return irPts;
  const usedPts: WaveDot[] = [];
  const denom = Math.max(1, bins - 1);
  for (let i = 0; i < bins; ++i) {
    const frac = i / denom;
    const t = (frac * capturedMs) / usedMs;
    if (t > 1) break;
    const irDb = v[3 + i] ?? DB_MIN;
    usedPts.push({
      x: pre + frac * capturedMs,
      y: clampDb(irDb + fadeDb(t, shape)),
    });
  }
  const endX = pre + usedMs;
  if (!usedPts.length || usedPts[usedPts.length - 1]!.x < endX - 1e-6)
    usedPts.push({ x: endX, y: DB_MIN });
  return usedPts;
}

function waveDecayDots(
  raw: number[],
  decay: number,
  pre: number,
  shape: number,
): WaveDot[] | null {
  const v = raw && raw.length >= 3 ? raw : EMPTY_WAVE;
  const capturedMs = Math.max(0, v[1] ?? 0);
  const usedMs = Math.max(0, Math.min(capturedMs, capturedMs * decay));
  if (!(decay < 0.999 && usedMs > 0)) return null;
  const decayPts: WaveDot[] = [];
  for (let i = 0; i <= SHAPE_POINTS; ++i) {
    const t = i / SHAPE_POINTS;
    decayPts.push({ x: pre + t * usedMs, y: fadeDb(t, shape) });
  }
  if (usedMs < capturedMs)
    decayPts.push({ x: pre + capturedMs, y: DB_MIN });
  return decayPts;
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
  toFront?: () => void;
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

type AuxHandleInstance = {
  set: (k: string, v: unknown) => unknown;
  get?: (k: string) => unknown;
  isDestructed?: () => boolean;
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
 * Blue fill = captured IR; `--color` fill = same IR after Decay/Shape
 * (`irDecayGainAt`); dashed line = the fade envelope. Viz: [bins, origMs,
 * usedMs, db0…].
 */
export function ImpulseChart(props: ImpulseChartProps) {
  const { data$, decay$, predelay$, shape$, beginEdit, endEdit, className } = props;
  const dataRef = useRef<number[]>(EMPTY_WAVE);
  const decay = useDynamicValueReadonly(decay$, 1);
  const predelay = useDynamicValueReadonly(predelay$, 0);

  const pre = clampPredelay(predelay);

  const chartRef = useRef<AuxChartInstance | null>(null);
  const irGraphRef = useRef<AuxGraph | null>(null);
  const usedGraphRef = useRef<AuxGraph | null>(null);
  const decayGraphRef = useRef<AuxGraph | null>(null);
  const graphBindingsRef = useRef<Bindings[]>([]);
  const resizeRoRef = useRef<ResizeObserver | null>(null);
  const handleRef = useRef<AuxHandleInstance | null>(null);
  const mapRef = useRef({ origMs: 1000, pre, decay });
  mapRef.current = { origMs: mapRef.current.origMs, pre, decay };
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
        // Default ChartHandle.x is 0, which clamps to x_min (15%). Seed the
        // mapped decay so addHandle's range_x snap does not park there.
        x: decayToX(mapRef.current.decay, mapRef.current.origMs, pre),
        x_min: pre + DECAY_MIN * mapRef.current.origMs,
        x_max: pre + mapRef.current.origMs,
        show_axis: false,
        min_size: 18,
        max_size: 18,
      },
    ],
    [pre],
  );

  const handleBindings = useMemo(
    () => [
      [
        {
          name: 'x',
          backendValue: decay$,
          transformReceive: (d: number) =>
            decayToX(d, mapRef.current.origMs, mapRef.current.pre),
          transformSend: (x: number) =>
            xToDecay(x, mapRef.current.origMs, mapRef.current.pre),
        },
      ],
    ],
    [decay$],
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
  handleRef.current = (handle as AuxHandleInstance | undefined) ?? null;

  const reassertGrad = useChartGradient({
    svg: chartSvg,
    targets: gradTarget ? [gradTarget] : [],
    paint: 'stroke',
  });
  const reassertRef = useRef(reassertGrad);
  reassertRef.current = reassertGrad;

  const waveFrame$ = useMemo(
    () =>
      new ListValue<WaveFrame>([data$, decay$, predelay$, shape$]),
    [data$, decay$, predelay$, shape$],
  );

  const sendVizBins = useCallback((el: Element) => {
    const width = Math.round(el.getBoundingClientRect().width);
    const bins = Math.max(64, Math.min(1024, width));
    postToHost({ t: 'vizcfg', id: 'impulse', bins });
  }, []);

  const syncRangeAndHandle = useCallback((frame: WaveFrame) => {
    const [raw, decayV, predelayV] = frame;
    const v = raw && raw.length >= 3 ? raw : EMPTY_WAVE;
    const capturedMs = Math.max(0, v[1] ?? 0);
    const origMs = origMsFromWave(v);
    const preV = clampPredelay(predelayV);
    const decayClamped = clampDecay(decayV);
    mapRef.current = { origMs, pre: preV, decay: decayClamped };
    dataRef.current = v;

    const inst = chartRef.current;
    if (inst && !inst.isDestructed?.()) {
      const span = Math.max(PREDELAY_MAX_MS, capturedMs + PREDELAY_MAX_MS);
      inst.set('range_x', { min: 0, max: span });
      inst.set('grid_x', buildTimeGridX(span));
    }

    const h = handleRef.current;
    if (h && !h.isDestructed?.()) {
      h.set('x_min', preV + DECAY_MIN * origMs);
      h.set('x_max', preV + origMs);
      if (!h.get?.('interacting'))
        h.set('x', decayToX(decayClamped, origMs, preV));
    }
  }, []);

  const disposeGraphBindings = useCallback(() => {
    for (const b of graphBindingsRef.current) b.dispose();
    graphBindingsRef.current = [];
  }, []);

  const attachGraphBindings = useCallback(() => {
    disposeGraphBindings();
    const ir = irGraphRef.current;
    const used = usedGraphRef.current;
    const dec = decayGraphRef.current;
    if (!ir || !used || !dec) return;

    graphBindingsRef.current = [
      bindAuxOptions(ir, [
        {
          name: 'dots',
          backendValue: waveFrame$,
          readonly: true,
          transformReceive: (pair: unknown) => {
            const frame = pair as WaveFrame;
            syncRangeAndHandle(frame);
            const [raw, , predelayV] = frame;
            return waveIrDots(raw, clampPredelay(predelayV));
          },
        },
      ]),
      bindAuxOptions(used, [
        {
          name: 'dots',
          backendValue: waveFrame$,
          readonly: true,
          transformReceive: (pair: unknown) => {
            const [raw, decayV, predelayV, shapeV] = pair as WaveFrame;
            const pts = waveUsedDots(
              raw,
              clampDecay(decayV),
              clampPredelay(predelayV),
              shapeV,
            );
            used.toFront?.();
            return pts;
          },
        },
      ]),
      bindAuxOptions(dec, [
        {
          name: 'dots',
          backendValue: waveFrame$,
          readonly: true,
          transformReceive: (pair: unknown) => {
            const [raw, decayV, predelayV, shapeV] = pair as WaveFrame;
            const pts = waveDecayDots(
              raw,
              clampDecay(decayV),
              clampPredelay(predelayV),
              shapeV,
            );
            dec.toFront?.();
            queueMicrotask(() => reassertRef.current());
            return pts;
          },
        },
      ]),
    ];
  }, [waveFrame$, syncRangeAndHandle, disposeGraphBindings]);

  const detach = useCallback(() => {
    resizeRoRef.current?.disconnect();
    resizeRoRef.current = null;
    disposeGraphBindings();
    const inst = chartRef.current;
    const ir = irGraphRef.current;
    const used = usedGraphRef.current;
    const dec = decayGraphRef.current;
    irGraphRef.current = null;
    usedGraphRef.current = null;
    decayGraphRef.current = null;
    chartRef.current = null;
    setChart(null);
    setChartSvg(null);
    setGradTarget(null);
    if (!inst || inst.isDestructed?.())
      return;
    if (dec)
      disposeGraph(inst, dec);
    if (used)
      disposeGraph(inst, used);
    if (ir)
      disposeGraph(inst, ir);
  }, [disposeGraphBindings]);

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
      }
      if (!usedGraphRef.current) {
        const used = inst.addGraph({
          dots: null,
          type: 'L',
          mode: 'bottom',
          class: 'ir-used',
        });
        used.element?.classList.add('ir-used');
        usedGraphRef.current = used;
      }
      if (!decayGraphRef.current) {
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
      attachGraphBindings();

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
    [sendVizBins, attachGraphBindings],
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

  // Re-bind when frame sources change; handle attach needs range sync from last frame.
  useEffect(() => {
    if (!chartRef.current || !irGraphRef.current) return;
    attachGraphBindings();
  }, [attachGraphBindings, chart, handle]);

  useEffect(() => () => detach(), [detach]);

  const cls = ['ImpulseChart', className ?? ''].filter(Boolean).join(' ');
  return (
    <ChartWidget
      className={cls}
      widgetRef={widgetRef}
    />
  );
}
