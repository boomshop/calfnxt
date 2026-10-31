import { useCallback, useEffect, useRef, useState } from 'react';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import { DragValue } from '@deutschesoft/aux-widgets/src/modules/dragvalue.js';
import { Range as AuxRange } from '@deutschesoft/aux-widgets/src/modules/range.js';
import type { DynamicValue } from '@deutschesoft/awml';
import type { Bindings } from '@deutschesoft/awml/src/bindings.js';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { useChartGradient } from '../../hooks/useChartGradient';
import { ALIGNER_LANES } from '../../host/alignerHost';
import { addGraphClasses } from '../../styles/graphStyles';
import { PALETTE_STEP } from '../../theme/themeGradient';
import { bindAuxOptions } from '../../utils/aux_bindings';
import { buildBipolarTimeGridX } from '../../utils/chartGrid';
import './AlignWaveStrip.scss';

const EMPTY_WAVE: number[] = [];
/** Header: bins, nLanes, preBins, viewPreMs, viewPostMs. */
const WAVE_HDR = 5;
const SILENCE_PEAK = 1e-4;

/** Map lane index 0…n-1 → palette step 0…100 (step 5), ends inclusive. */
function paletteStepForIndex(
  index: number,
  count: number = ALIGNER_LANES,
): number {
  const n = Math.max(1, count | 0);
  const i = Math.max(0, Math.min(n - 1, index | 0));
  const t = n <= 1 ? 0 : i / (n - 1);
  return Math.round((t * 100) / PALETTE_STEP) * PALETTE_STEP;
}

type WaveDot = { x: number; y: number };

type AuxGraph = {
  set: (k: string, v: unknown) => void;
  element?: SVGElement;
  toFront?: () => void;
  destroyAndRemove?: () => void;
  destroy?: () => void;
};

type AuxRangeLike = {
  options: { min: number; max: number; basis: number };
  set: (k: string, v: unknown) => void;
};

type AuxChartInstance = {
  isDestructed?: () => boolean;
  element?: Element;
  svg?: SVGSVGElement;
  range_x?: AuxRangeLike;
  set: (k: string, v: unknown) => void;
  addGraph: (opts: unknown) => AuxGraph;
  removeGraph: (g: AuxGraph) => void;
};

type DragValueLike = {
  destroy: () => void;
  set: (k: string, v: unknown) => void;
  on: (ev: string, cb: (...args: unknown[]) => void) => void;
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
  for (let i = 0; i < bins; ++i)
    peak = Math.max(peak, Math.abs(v[off + i] ?? 0));
  return peak;
}

/** Per-channel peak normalize so fill and outline each reach ±1 independently. */
function packChannel(
  v: number[],
  bins: number,
  off: number,
  pre: number,
  post: number,
  shiftMs = 0,
): WaveDot[] | null {
  const peak = channelPeak(v, bins, off);
  if (peak < SILENCE_PEAK) return null;
  const span = pre + post;
  const pts: WaveDot[] = [];
  for (let i = 0; i < bins; ++i) {
    const x = -pre + (i / (bins - 1)) * span + shiftMs;
    pts.push({ x, y: (v[off + i] ?? 0) / peak });
  }
  return pts;
}

/** Peak-normalize the sum of two lanes (stereo Anchor → mono ghost = L+R). */
function packChannelSum(
  v: number[],
  bins: number,
  offA: number,
  offB: number,
  pre: number,
  post: number,
  shiftMs = 0,
): WaveDot[] | null {
  let peak = 0;
  for (let i = 0; i < bins; ++i)
    peak = Math.max(peak, Math.abs((v[offA + i] ?? 0) + (v[offB + i] ?? 0)));
  if (peak < SILENCE_PEAK) return null;
  const span = pre + post;
  const pts: WaveDot[] = [];
  for (let i = 0; i < bins; ++i) {
    const x = -pre + (i / (bins - 1)) * span + shiftMs;
    pts.push({ x, y: ((v[offA + i] ?? 0) + (v[offB + i] ?? 0)) / peak });
  }
  return pts;
}

function packGhost(
  v: number[],
  bins: number,
  nLanes: number,
  ghost: number | [number, number],
  pre: number,
  post: number,
): WaveDot[] | null {
  if (Array.isArray(ghost)) {
    const a = Math.max(0, Math.min(nLanes - 1, Math.round(ghost[0])));
    const b = Math.max(0, Math.min(nLanes - 1, Math.round(ghost[1])));
    return packChannelSum(
      v,
      bins,
      WAVE_HDR + a * bins,
      WAVE_HDR + b * bins,
      pre,
      post,
    );
  }
  const g = Math.max(0, Math.min(nLanes - 1, Math.round(ghost)));
  return packChannel(v, bins, WAVE_HDR + g * bins, pre, post);
}

function clampDelay(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

const ChartBindings = {};
const ChartOptions = {
  auto_size: true,
  show_grid: true,
  label: false,
  range_x: { min: -8, max: 24 },
  range_y: { min: -1, max: 1 },
  grid_x: buildBipolarTimeGridX(-8, 24),
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
  /**
   * Fill / ghost source. One lane index, or a stereo pair summed to L+R.
   * Defaults to `lane` when omitted (unused); callers pass the Anchor ghost.
   */
  ghost?: number | [number, number];
  /** @deprecated Prefer `ghost` — kept as alias for the hit-trigger lane index. */
  anchor?: number;
  /** Master: one channel (0=L, 1=R) — ref fill + mix outline. */
  mode?: 'lane' | 'master';
  /** Master channel index (0=L, 1=R). */
  channel?: 0 | 1;
  /**
   * Delay (ms). Horizontal drag writes this param (lane Delay or Master Trim).
   * The outline shifts by delay − captureDelay until the next hit pack arrives.
   * Master: mix outline only (Reference fill stays put).
   */
  delay$?: DynamicValue<number>;
  delayMin?: number;
  delayMax?: number;
  beginEdit?: () => void;
  endEdit?: () => void;
  /** When true, no live delay nudge / drag (DSP shows undelayed packs). */
  bypass$?: DynamicValue<boolean>;
}

/**
 * Hit-window overlay. Lane: Anchor ghost + lane signal.
 * Master: one stereo side — Reference fill + mix outline.
 */
export function AlignWaveStrip(props: AlignWaveStripProps) {
  const {
    className,
    wave$,
    lane = 0,
    ghost,
    anchor = 0,
    mode = 'lane',
    channel = 0,
    delay$,
    delayMin = -50,
    delayMax = 50,
    beginEdit,
    endEdit,
    bypass$,
  } = props;
  const ghostSrc: number | [number, number] = ghost ?? anchor;
  const metaRef = useRef({ lane, ghost: ghostSrc, mode, channel });
  metaRef.current = { lane, ghost: ghostSrc, mode, channel };

  const chartRef = useRef<AuxChartInstance | null>(null);
  const graphsRef = useRef<AuxGraph[]>([]);
  const graphBindingsRef = useRef<Bindings[]>([]);
  const dragRef = useRef<DragValueLike | null>(null);
  const delayRangeRef = useRef<InstanceType<typeof AuxRange> | null>(null);
  /** Delay at last wave pack — outline x += delay$ − this until next pack. */
  const captureDelayRef = useRef(0);
  const delay$Ref = useRef(delay$);
  delay$Ref.current = delay$;
  const bypass$Ref = useRef(bypass$);
  bypass$Ref.current = bypass$;
  const delayMinRef = useRef(delayMin);
  const delayMaxRef = useRef(delayMax);
  delayMinRef.current = delayMin;
  delayMaxRef.current = delayMax;
  const beginEditRef = useRef(beginEdit);
  const endEditRef = useRef(endEdit);
  beginEditRef.current = beginEdit;
  endEditRef.current = endEdit;

  const [chartSvg, setChartSvg] = useState<SVGSVGElement | null>(null);
  const [gradTargets, setGradTargets] = useState<SVGElement[]>([]);

  // Suite standard level ramp: warn (hot) at top → accent (cold) at bottom.
  const reassertGrad = useChartGradient({
    svg: chartSvg,
    targets: gradTargets,
    paint: 'fill',
  });
  const reassertRef = useRef(reassertGrad);
  reassertRef.current = reassertGrad;

  const syncDelayDragRange = useCallback((pre: number, post: number) => {
    const chart = chartRef.current;
    const delayRange = delayRangeRef.current;
    if (!chart?.range_x || !delayRange) return;
    const span = Math.max(1e-6, pre + post);
    const basis = Math.max(1, chart.range_x.options.basis || 1);
    const delaySpan = Math.max(1e-6, delayMaxRef.current - delayMinRef.current);
    // Match chart ms/px so 1 ms drag ≈ 1 ms on the wave axis.
    delayRange.set('basis', (delaySpan * basis) / span);
    delayRange.set('min', delayMinRef.current);
    delayRange.set('max', delayMaxRef.current);
  }, []);

  const lastAxisRef = useRef<{ pre: number; post: number }>({ pre: NaN, post: NaN });
  const syncRangeX = useCallback(
    (raw: number[] | undefined) => {
      const inst = chartRef.current;
      if (!inst || inst.isDestructed?.() || !raw || raw.length < WAVE_HDR) return;
      const { pre, post } = waveWindowMs(raw);
      // Axis is Wave-knob only — skip redundant set() so live fill cannot flicker the grid.
      const prev = lastAxisRef.current;
      if (prev.pre === pre && prev.post === post) return;
      lastAxisRef.current = { pre, post };
      inst.set('range_x', { min: -pre, max: post });
      inst.set('grid_x', buildBipolarTimeGridX(-pre, post));
      syncDelayDragRange(pre, post);
    },
    [syncDelayDragRange],
  );

  /** Paints outline (g1); returns fill dots for g0 (binding must not stomp them). */
  const paint = useCallback(
    (raw: number[] | undefined): WaveDot[] | null => {
      const { lane: li, ghost: gh, mode: m, channel: ch } = metaRef.current;
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
        // Live Master Trim nudge on the mix outline only (ref fill stays).
        const bypassOn = bypass$Ref.current?.value === true;
        const d$ = delay$Ref.current;
        const shiftMs =
          bypassOn || !d$
            ? 0
            : (typeof d$.value === 'number' ? d$.value : 0) - captureDelayRef.current;
        const mixDots = packChannel(v, bins, mixOff, pre, post, shiftMs);
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
      const lIdx = Math.max(0, Math.min(nLanes - 1, Math.round(li)));
      const lOff = WAVE_HDR + lIdx * bins;
      // Live delay nudge until the next DSP hit pack replaces the capture.
      // Bypass: DSP packs undelayed — do not keep a knob nudge on screen.
      const bypassOn = bypass$Ref.current?.value === true;
      const d$ = delay$Ref.current;
      const shiftMs =
        bypassOn || !d$
          ? 0
          : (typeof d$.value === 'number' ? d$.value : 0) - captureDelayRef.current;
      const laneDots = packChannel(v, bins, lOff, pre, post, shiftMs);
      if (!laneDots) {
        graphs[0]?.set('dots', null);
        graphs[1]?.set('dots', null);
        return null;
      }
      const ghostDots = packGhost(v, bins, nLanes, gh, pre, post);
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
          transformReceive: (raw: number[]) => {
            // New hit pack was captured at the current delay — zero the nudge.
            const d$ = delay$Ref.current;
            captureDelayRef.current =
              d$ && typeof d$.value === 'number' ? d$.value : 0;
            return paint(raw);
          },
        },
      ]),
    ];
  }, [wave$, disposeGraphBindings, paint]);

  const destroyDrag = useCallback(() => {
    try {
      dragRef.current?.destroy();
    } catch {
      /* already gone */
    }
    dragRef.current = null;
    delayRangeRef.current = null;
  }, []);

  const attachDrag = useCallback(
    (inst: AuxChartInstance) => {
      destroyDrag();
      if (!delay$Ref.current) return;
      const node = (inst.element as HTMLElement | undefined) ?? inst.svg;
      if (!node) return;

      const delayRange = new AuxRange({
        scale: 'linear',
        min: delayMinRef.current,
        max: delayMaxRef.current,
        basis: 100,
        step: 0,
        snap: 0.01,
        shift_up: 4,
        shift_down: 0.25,
      });
      delayRangeRef.current = delayRange;

      const drag = new DragValue(inst, {
        node,
        classes: node,
        direction: 'horizontal',
        cursor: true,
        limit: true,
        range: () => delayRange,
        get: () => {
          const d$ = delay$Ref.current;
          return d$ && typeof d$.value === 'number' ? d$.value : 0;
        },
        set: (v: number) => {
          if (bypass$Ref.current?.value === true) return;
          const d$ = delay$Ref.current;
          if (!d$) return;
          d$.set(clampDelay(v, delayMinRef.current, delayMaxRef.current));
        },
        events: () => inst,
      }) as DragValueLike;
      drag.on('startdrag', () => beginEditRef.current?.());
      drag.on('stopdrag', () => endEditRef.current?.());
      dragRef.current = drag;

      const raw = wave$.value as number[] | undefined;
      if (raw && raw.length >= WAVE_HDR) {
        const { pre, post } = waveWindowMs(raw);
        syncDelayDragRange(pre, post);
      }
    },
    [destroyDrag, syncDelayDragRange, wave$],
  );

  /** @param clearChartRef false = rebuild in place (HMR / mode); keep the Aux chart. */
  const detach = useCallback(
    (clearChartRef = true) => {
      destroyDrag();
      disposeGraphBindings();
      const inst = chartRef.current;
      const graphs = graphsRef.current;
      graphsRef.current = [];
      if (clearChartRef) chartRef.current = null;
      setChartSvg(null);
      setGradTargets([]);
      if (!inst || inst.isDestructed?.()) return;
      for (const g of graphs) disposeGraph(inst, g);
    },
    [destroyDrag, disposeGraphBindings],
  );

  const attach = useCallback(
    (inst: AuxChartInstance) => {
      // Always own the chart before sweeping — rebuild may pass the same instance.
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
        // Same recipe as lane strips: quiet ref fill, mix outline by side.
        addGraphClasses(
          refG.element,
          'align-wave-ref',
          'fill-color fill-faint stroke-none',
        );
        // Outline only — mode "center" would stroke the mid close-edge.
        const mixG = inst.addGraph({
          dots: null,
          type: 'L',
          mode: 'line',
          class: 'align-wave-mix',
        });
        const mixStroke =
          metaRef.current.channel === 1 ? 'stroke-warn' : 'stroke-accent';
        addGraphClasses(
          mixG.element,
          'align-wave-mix',
          'fill-none',
          mixStroke,
          'stroke-medium',
        );
        graphsRef.current = [refG, mixG];
      } else {
        const ghost = inst.addGraph({
          dots: null,
          type: 'L',
          mode: 'center',
          class: 'align-wave-ghost',
        });
        // Anchor ghost: quiet foreground fill. Lane outline: palette by strip.
        addGraphClasses(
          ghost.element,
          'align-wave-ghost',
          'fill-color fill-faint stroke-none',
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
          'fill-none',
          `stroke-palette-${paletteStepForIndex(metaRef.current.lane)}`,
          'stroke-medium',
        );
        graphsRef.current = [ghost, laneG];
      }

      setGradTargets(targets);
      setChartSvg(inst.svg ?? null);
      attachGraphBindings();
      attachDrag(inst);
      // Force paint — binding may not re-fire if wave$ already holds the fixture.
      const dots = paint((wave$.value as number[] | undefined) ?? EMPTY_WAVE);
      graphsRef.current[0]?.set('dots', dots);
    },
    [attachGraphBindings, attachDrag, paint, wave$],
  );

  const attachRef = useRef(attach);
  const detachRef = useRef(detach);
  attachRef.current = attach;
  detachRef.current = detach;

  // Stable callback identity — changing attach/detach must not go through
  // widgetRef(null) or the following useEffect cleanup will wipe a fresh attach.
  const widgetRef = useCallback((inst: AuxChartInstance | null) => {
    if (!inst) {
      detachRef.current(true);
      return;
    }
    if (chartRef.current && chartRef.current !== inst) detachRef.current(true);
    attachRef.current(inst);
  }, []);

  // HMR / mode / lane: rebuild graphs on the live chart without dropping Aux.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDestructed?.()) return;
    detachRef.current(false);
    attachRef.current(chart);
  }, [attach, mode, lane, channel]);

  useEffect(() => {
    if (!chartRef.current || graphsRef.current.length === 0) return;
    attachGraphBindings();
    const dots = paint((wave$.value as number[] | undefined) ?? EMPTY_WAVE);
    graphsRef.current[0]?.set('dots', dots);
  }, [attachGraphBindings, paint, wave$]);

  useEffect(() => {
    const g0 = graphsRef.current[0];
    const dots = paint((wave$.value as number[] | undefined) ?? EMPTY_WAVE);
    g0?.set('dots', dots);
  }, [lane, ghostSrc, mode, channel, wave$, paint]);

  // Knob / drag writes: nudge the outline without waiting for a new hit pack.
  useEffect(() => {
    if (!delay$) return;
    return delay$.subscribe(() => {
      const g0 = graphsRef.current[0];
      if (!g0) return;
      const dots = paint((wave$.value as number[] | undefined) ?? EMPTY_WAVE);
      g0.set('dots', dots);
    }, false);
  }, [delay$, paint, wave$]);

  useEffect(() => {
    if (!bypass$) return;
    return bypass$.subscribe(() => {
      const g0 = graphsRef.current[0];
      if (!g0) return;
      const dots = paint((wave$.value as number[] | undefined) ?? EMPTY_WAVE);
      g0.set('dots', dots);
    }, false);
  }, [bypass$, paint, wave$]);

  useEffect(() => () => detachRef.current(true), []);

  const cls = [
    'AlignWaveStrip',
    className ?? '',
    delay$ ? 'is-draggable' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return <ChartWidget className={cls} widgetRef={widgetRef} />;
}
