import { useCallback, useEffect, useMemo, useState } from 'react';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { Reverb as AuxReverb } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import { useChartGradient } from '../../hooks/useChartGradient';
import { composeInteractingOnSet, type AuxOnSet } from '../editGesture';
import {
  buildErReflections,
  normalizeErMode,
  reverbTimeframeMs,
  type ErReflection,
} from './reverbChartModel';
import './ReverbChart.scss';

/**
 * AUX Reverb chart semantics (see aux-widgets `reverb.js`):
 * - reflections — ONLY via `options.reflections` (`{time,level}[]` | false).
 *   AUX creates/destroys the Graph children itself.
 *
 * AUX pitfalls we work around:
 * 1. `adjustReflections` shrinks with `removeGraph` + `destroyAndRemove` (double
 *    unlink → "Graph is not a child"). We shrink via `destroyAndRemove` only.
 * 2. `removeGraph` does not remove the SVG path from `_graphs`; destroying
 *    without keeping the element reference leaves orphan strokes.
 * 3. Remounting a Reverb with many Graphs hits a removeChildren map-while-splice
 *    bug. Keep one widget instance; truncate `_reflections` before set().
 */
const ReverbBindings = {
  predelay$: { name: 'predelay' },
  attack$: { name: 'attack' },
  rlevel$: { name: 'rlevel' },
  rtime$: { name: 'rtime' },
  erlevel$: { name: 'erlevel' },
};

const ReverbOptions = {
  delay: 0,
  delay_min: 0,
  delay_max: 0,
  gain: 0,
  gain_min: -60,
  gain_max: 12,
  predelay_min: 0,
  predelay_max: 540,
  rlevel_min: -60,
  rlevel_max: 12,
  rtime_min: 400,
  rtime_max: 15000,
  erlevel_min: -60,
  erlevel_max: 12,
  attack: 0,
  reference: -60,
  noisefloor: -96,
  show_input: false,
  show_input_handle: false,
  show_rlevel_handle: true,
  show_rtime_handle: true,
  range_x: { min: 0, max: 5000 },
  range_y: { min: -90, max: 12 },
  timeframe: 5000,
  reflections: false as const,
};

const ReverbWidget = componentFromWidget(
  AuxReverb,
  ReverbBindings,
  ReverbOptions,
  'ReverbChart',
);

type AuxReflectionGraph = {
  destroy?: () => void;
  destroyAndRemove?: () => void;
  element?: Element | null;
};

type AuxReflectionSlot = {
  graph?: AuxReflectionGraph | null;
};

type AuxReverbInstance = {
  isDestructed: () => boolean;
  element: Element;
  svg?: SVGSVGElement;
  reverb?: { element?: SVGElement };
  range_y?: { options?: { basis?: number } };
  set: (key: string, value: unknown) => void;
  get?: (key: string) => unknown;
  options?: { _reflections?: AuxReflectionSlot[] };
  removeGraph?: (g: AuxReflectionGraph) => void;
};

export interface ReverbChartProps {
  className?: string;
  predelay$: DynamicValue<number>;
  attack$: DynamicValue<number>;
  rlevel$: DynamicValue<number>;
  rtime$: DynamicValue<number>;
  erlevel$: DynamicValue<number>;
  roomSize: number;
  distance: number;
  /** 0 = Off, 1 = Multi-Tap, 2 = Velvet */
  erMode: number;
  decaySec: number;
  beginEdit?: () => void;
  endEdit?: () => void;
  onSet?: AuxOnSet;
}

function reflectionSlots(chart: AuxReverbInstance): AuxReflectionSlot[] {
  const fromGet = chart.get?.('_reflections');
  if (Array.isArray(fromGet)) return fromGet as AuxReflectionSlot[];
  const fromOpts = chart.options?._reflections;
  return Array.isArray(fromOpts) ? fromOpts : [];
}

/**
 * Dispose one reflection Graph.
 * Chart.removeGraph only unlinks the widget tree — SVG stays in `_graphs`.
 * AUX's adjustReflections does removeGraph + destroyAndRemove (double unlink →
 * "is not a child"). destroyAndRemove alone: parent unlink + DOM remove.
 * If that fails, fall back with element captured *before* destroy() nulls it.
 */
function disposeReflectionGraph(
  chart: AuxReverbInstance,
  G: AuxReflectionGraph,
) {
  try {
    G.destroyAndRemove?.();
    return;
  } catch {
    // fall through
  }
  const el = G.element ?? null;
  try {
    chart.removeGraph?.(G);
  } catch {
    // already detached
  }
  try {
    G.destroy?.();
  } catch {
    // ignore
  }
  el?.remove?.();
}

/**
 * Drop excess AUX reflection Graphs without using the broken shrink path.
 * After this, `R.length === keep` so `set('reflections', …)` only updates/grows.
 */
function truncateReflections(chart: AuxReverbInstance, keep: number) {
  const R = reflectionSlots(chart);
  if (R.length <= keep) return;

  for (let i = keep; i < R.length; ++i) {
    const G = R[i]?.graph;
    if (G) disposeReflectionGraph(chart, G);
    R[i] = { graph: null };
  }
  R.length = keep;
}

function applyReflections(chart: AuxReverbInstance, taps: readonly ErReflection[]) {
  truncateReflections(chart, taps.length);
  if (taps.length === 0) {
    chart.set('reflections', false);
    return;
  }
  chart.set(
    'reflections',
    taps.map((t) => ({ time: t.time, level: t.level })),
  );
}

/**
 * AUX Reverb chart: ER taps + late triangle. Dry/input impulse is not shown.
 */
export function ReverbChart(props: ReverbChartProps) {
  const {
    className,
    beginEdit,
    endEdit,
    onSet,
    roomSize,
    distance,
    erMode,
    decaySec,
    ...rest
  } = props;

  const [chart, setChart] = useState<AuxReverbInstance | null>(null);
  const mode = normalizeErMode(erMode);

  const composedOnSet = useMemo(
    () => composeInteractingOnSet({ beginEdit, endEdit }, onSet),
    [beginEdit, endEdit, onSet],
  );

  const reflections = useMemo(
    () => buildErReflections(roomSize, distance, mode),
    [roomSize, distance, mode],
  );

  const timeframe = useMemo(() => reverbTimeframeMs(decaySec), [decaySec]);

  useEffect(() => {
    if (!chart || chart.isDestructed()) return;
    applyReflections(chart, reflections);
  }, [chart, reflections]);

  const reverbTargets = useMemo(
    () => (chart?.reverb?.element ? [chart.reverb.element] : []),
    [chart],
  );
  const getChartHeight = useCallback(
    (svg: SVGSVGElement) =>
      chart?.range_y?.options?.basis || svg.clientHeight || 1,
    [chart],
  );
  useChartGradient({
    svg: chart?.svg,
    enabled: !!chart,
    targets: reverbTargets,
    paint: 'stroke',
    getHeight: getChartHeight,
  });

  const widgetRef = useCallback((w: AuxReverbInstance | null) => {
    if (!w || w.isDestructed()) {
      setChart(null);
      return;
    }
    setChart(w);
  }, []);

  const cls = ['ReverbChart', className ?? ''].filter(Boolean).join(' ');

  return (
    <ReverbWidget
      className={cls}
      widgetRef={widgetRef}
      onSet={composedOnSet}
      reflections={false}
      timeframe={timeframe}
      range_x={{ min: 0, max: timeframe }}
      {...rest}
    />
  );
}
