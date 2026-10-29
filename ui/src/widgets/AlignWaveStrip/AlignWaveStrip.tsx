import { useCallback, useEffect, useRef, useState } from 'react';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import type { Bindings } from '@deutschesoft/awml/src/bindings.js';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { useChartGradient } from '../../hooks/useChartGradient';
import { addGraphClasses } from '../../styles/graphStyles';
import { bindAuxOptions } from '../../utils/aux_bindings';
import './AlignWaveStrip.scss';

const EMPTY_WAVE: number[] = [];
/** Header: bins, nLanes, preBins, viewPreMs, viewPostMs. */
const WAVE_HDR = 5;
const SILENCE_PEAK = 1e-4;

type WaveDot = { x: number; y: number };

type AuxGraph = {
  set: (k: string, v: unknown) => void;
  element?: SVGElement;
  toFront?: () => void;
  destroyAndRemove?: () => void;
  destroy?: () => void;
};

type AuxChartInstance = {
  isDestructed?: () => boolean;
  element?: Element;
  svg?: SVGSVGElement;
  set: (k: string, v: unknown) => void;
  addGraph: (opts: unknown) => AuxGraph;
  removeGraph: (g: AuxGraph) => void;
};

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

function waveWindowMs(v: number[]): { pre: number; post: number } {
  const pre = Math.max(1, v[3] ?? 8);
  const post = Math.max(1, v[4] ?? 24);
  return { pre, post };
}

function channelPeak(v: number[], bins: number, off: number): number {
  let peak = 0;
  for (let i = 0; i < bins; ++i) peak = Math.max(peak, Math.abs(v[off + i] ?? 0));
  return peak;
}

/** Per-channel peak normalize so fill and outline each reach ±1 independently. */
function packChannel(
  v: number[],
  bins: number,
  off: number,
  pre: number,
  post: number,
): WaveDot[] | null {
  const peak = channelPeak(v, bins, off);
  if (peak < SILENCE_PEAK) return null;
  const span = pre + post;
  const pts: WaveDot[] = [];
  for (let i = 0; i < bins; ++i) {
    const x = -pre + (i / (bins - 1)) * span;
    pts.push({ x, y: (v[off + i] ?? 0) / peak });
  }
  return pts;
}

const ChartBindings = {};
const ChartOptions = {
  auto_size: true,
  show_grid: true,
  label: false,
  range_x: { min: -8, max: 24 },
  range_y: { min: -1, max: 1 },
  grid_x: [{ pos: 0, label: '' }],
  grid_y: [{ pos: 0, label: '' }],
};

const ChartWidget = componentFromWidget(
  AuxChart,
  ChartBindings,
  ChartOptions,
  'AlignWaveStrip',
);

export interface AlignWaveStripProps {
  className?: string;
  wave$: DynamicValue<number[]>;
  /** Lane strip: which mix lane (0…7). Ignored in master mode. */
  lane?: number;
  /** Ghost reference lane for lane mode. */
  anchor?: number;
  /** Master: one channel (0=L, 1=R) — ref fill + mix outline. */
  mode?: 'lane' | 'master';
  /** Master channel index (0=L, 1=R). */
  channel?: 0 | 1;
}

/**
 * Hit-window overlay. Lane: Anchor ghost + lane signal.
 * Master: one stereo side — Reference fill + mix outline.
 */
export function AlignWaveStrip(props: AlignWaveStripProps) {
  const { className, wave$, lane = 0, anchor = 0, mode = 'lane', channel = 0 } =
    props;
  const metaRef = useRef({ lane, anchor, mode, channel });
  metaRef.current = { lane, anchor, mode, channel };

  const chartRef = useRef<AuxChartInstance | null>(null);
  const graphsRef = useRef<AuxGraph[]>([]);
  const graphBindingsRef = useRef<Bindings[]>([]);
  const [chartSvg, setChartSvg] = useState<SVGSVGElement | null>(null);
  const [gradTargets, setGradTargets] = useState<SVGElement[]>([]);

  const reassertGrad = useChartGradient({
    svg: chartSvg,
    targets: gradTargets,
    paint: 'fill',
    profile: 'center',
  });
  const reassertRef = useRef(reassertGrad);
  reassertRef.current = reassertGrad;

  const syncRangeX = useCallback((raw: number[] | undefined) => {
    const inst = chartRef.current;
    if (!inst || inst.isDestructed?.() || !raw || raw.length < WAVE_HDR) return;
    const { pre, post } = waveWindowMs(raw);
    inst.set('range_x', { min: -pre, max: post });
  }, []);

  /** Paints outline (g1); returns fill dots for g0 (binding must not stomp them). */
  const paint = useCallback(
    (raw: number[] | undefined): WaveDot[] | null => {
      const { lane: li, anchor: a, mode: m, channel: ch } = metaRef.current;
      syncRangeX(raw);
      const graphs = graphsRef.current;
      const v = raw && raw.length >= WAVE_HDR ? raw : EMPTY_WAVE;
      const bins = Math.max(0, Math.round(v[0] ?? 0));
      const nLanes = Math.max(0, Math.round(v[1] ?? 0));
      const { pre, post } = waveWindowMs(v);

      if (bins < 2 || nLanes < 1 || v.length < WAVE_HDR + nLanes * bins) {
        for (const g of graphs) g.set('dots', null);
        return null;
      }

      if (m === 'master') {
        // Pack: … lanes, mixL, mixR, refL, refR
        const extraOff = WAVE_HDR + nLanes * bins;
        if (v.length < extraOff + 4 * bins || graphs.length < 2) {
          for (const g of graphs) g.set('dots', null);
          return null;
        }
        const side = ch === 1 ? 1 : 0;
        const mixOff = extraOff + side * bins;
        const refOff = extraOff + 2 * bins + side * bins;
        const mixDots = packChannel(v, bins, mixOff, pre, post);
        if (!mixDots) {
          for (const g of graphs) g.set('dots', null);
          return null;
        }
        const refDots = packChannel(v, bins, refOff, pre, post);
        graphs[1]?.set('dots', mixDots);
        graphs[1]?.toFront?.();
        queueMicrotask(() => reassertRef.current());
        return refDots;
      }

      if (graphs.length < 2) return null;
      const aIdx = Math.max(0, Math.min(nLanes - 1, Math.round(a)));
      const lIdx = Math.max(0, Math.min(nLanes - 1, Math.round(li)));
      const aOff = WAVE_HDR + aIdx * bins;
      const lOff = WAVE_HDR + lIdx * bins;
      const laneDots = packChannel(v, bins, lOff, pre, post);
      if (!laneDots) {
        graphs[0]?.set('dots', null);
        graphs[1]?.set('dots', null);
        return null;
      }
      const ghostDots = packChannel(v, bins, aOff, pre, post);
      graphs[1]?.set('dots', laneDots);
      graphs[1]?.toFront?.();
      queueMicrotask(() => reassertRef.current());
      return ghostDots;
    },
    [syncRangeX],
  );

  const disposeGraphBindings = useCallback(() => {
    for (const b of graphBindingsRef.current) b.dispose();
    graphBindingsRef.current = [];
  }, []);

  const attachGraphBindings = useCallback(() => {
    disposeGraphBindings();
    const g0 = graphsRef.current[0];
    if (!g0) return;
    graphBindingsRef.current = [
      bindAuxOptions(g0, [
        {
          name: 'dots',
          backendValue: wave$,
          readonly: true,
          transformReceive: (raw: number[]) => paint(raw),
        },
      ]),
    ];
  }, [wave$, disposeGraphBindings, paint]);

  const detach = useCallback(() => {
    disposeGraphBindings();
    const inst = chartRef.current;
    const graphs = graphsRef.current;
    graphsRef.current = [];
    chartRef.current = null;
    setChartSvg(null);
    setGradTargets([]);
    if (!inst || inst.isDestructed?.()) return;
    for (const g of graphs) disposeGraph(inst, g);
  }, [disposeGraphBindings]);

  const attach = useCallback(
    (inst: AuxChartInstance) => {
      chartRef.current = inst;
      if (inst.isDestructed?.()) return;

      const modeNow = metaRef.current.mode;
      const targets: SVGElement[] = [];

      if (modeNow === 'master') {
        const refG = inst.addGraph({
          dots: null,
          type: 'L',
          mode: 'center',
          class: 'align-wave-ref',
        });
        addGraphClasses(
          refG.element,
          'align-wave-ref',
          'fill-gradient fill-full stroke-none',
        );
        // Outline only — mode "center" would stroke the mid close-edge.
        const mixG = inst.addGraph({
          dots: null,
          type: 'L',
          mode: 'line',
          class: 'align-wave-mix',
        });
        addGraphClasses(
          mixG.element,
          'align-wave-mix',
          'fill-none stroke-color stroke-medium',
        );
        graphsRef.current = [refG, mixG];
        if (refG.element) targets.push(refG.element);
      } else {
        const ghost = inst.addGraph({
          dots: null,
          type: 'L',
          mode: 'center',
          class: 'align-wave-ghost',
        });
        addGraphClasses(
          ghost.element,
          'align-wave-ghost',
          'fill-gradient fill-full stroke-none',
        );
        const laneG = inst.addGraph({
          dots: null,
          type: 'L',
          mode: 'line',
          class: 'align-wave-lane',
        });
        addGraphClasses(
          laneG.element,
          'align-wave-lane',
          'fill-none stroke-color stroke-medium',
        );
        graphsRef.current = [ghost, laneG];
        if (ghost.element) targets.push(ghost.element);
      }

      setGradTargets(targets);
      setChartSvg(inst.svg ?? null);
      attachGraphBindings();
    },
    [attachGraphBindings],
  );

  const widgetRef = useCallback(
    (inst: AuxChartInstance | null) => {
      if (!inst) {
        detach();
        return;
      }
      if (chartRef.current && chartRef.current !== inst) detach();
      attach(inst);
    },
    [attach, detach],
  );

  useEffect(() => {
    if (!chartRef.current || graphsRef.current.length === 0) return;
    attachGraphBindings();
  }, [attachGraphBindings]);

  useEffect(() => {
    const g0 = graphsRef.current[0];
    const dots = paint((wave$.value as number[] | undefined) ?? EMPTY_WAVE);
    g0?.set('dots', dots);
  }, [lane, anchor, mode, channel, wave$, paint]);

  useEffect(() => () => detach(), [detach]);

  const cls = ['AlignWaveStrip', className ?? ''].filter(Boolean).join(' ');
  return <ChartWidget className={cls} widgetRef={widgetRef} />;
}
