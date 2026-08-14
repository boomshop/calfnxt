import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import {
  Compressor as AuxCompressor,
  Expander as AuxExpander,
} from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import { useChartGradient } from '../../hooks/useChartGradient';
import { expanderResponseDots } from '../../dsp/expanderCurve';
import { composeInteractingOnSet, type AuxOnSet } from '../editGesture';
import './DynamicsChart.scss';

const DynamicsBindings = {
  threshold$: { name: 'threshold' },
  ratio$: { name: 'ratio' },
  makeup$: { name: 'makeup' },
  knee$: { name: 'knee' },
  range$: { name: 'range' },
};

const CompressorOptions = {
  type: 'compressor',
  min: -60,
  max: 24,
  db_grid: 12,
  show_handle: true,
  show_ratio: true,
  ratio_x: 12,
  range_z: { min: 1, max: 20, basis: 300 },
  makeup: 0,
};

const ExpanderOptions = {
  type: 'expander',
  min: -60,
  max: 24,
  db_grid: 12,
  show_handle: true,
  show_ratio: true,
  ratio_x: 12,
  range_z: { min: 1, max: 20, basis: 300 },
  makeup: 0,
  range: -60,
};

const CompressorWidget = componentFromWidget(
  AuxCompressor,
  DynamicsBindings,
  CompressorOptions,
  'DynamicsChart',
);

const ExpanderWidget = componentFromWidget(
  AuxExpander,
  DynamicsBindings,
  ExpanderOptions,
  'DynamicsChart',
);

type AuxHandle = {
  set: (k: string, v: unknown) => void;
  toBack?: () => void;
};

type AuxGraph = {
  element?: SVGElement;
  set?: (k: string, v: unknown) => void;
};

type AuxDynamicsInstance = {
  isDestructed: () => boolean;
  element: Element;
  svg?: SVGSVGElement;
  response?: AuxGraph;
  range_y?: { options?: { basis?: number } };
  addHandle?: (opts: Record<string, unknown>) => AuxHandle;
  removeHandle?: (handle: AuxHandle) => void;
  addGraph?: (opts: Record<string, unknown>) => AuxGraph;
  removeGraph?: (graph: AuxGraph) => void;
  set?: (k: string, v: unknown) => void;
  get?: (k: string) => unknown;
  /** AUX regenerates the hard expander polyline here — we override for soft knee. */
  drawGraph?: () => void;
};

export interface DynamicsChartProps {
  className?: string;
  type?: 'compressor' | 'expander';
  threshold$?: DynamicValue<number>;
  releaseThreshold$?: DynamicValue<number>;
  ratio$?: DynamicValue<number>;
  makeup$?: DynamicValue<number>;
  knee$?: DynamicValue<number>;
  range$?: DynamicValue<number>;
  /** Operating point [inDb, outDb] from DSP viz. */
  point$?: DynamicValue<number[]>;
  beginEdit?: () => void;
  endEdit?: () => void;
  onSet?: AuxOnSet;
  [key: string]: unknown;
}

/**
 * AUX Dynamics transfer curve + optional DSP operating-point handle.
 * Expander: open + release transfer curves (same shape, shifted), soft knee/floor,
 * release-threshold handle, hysteresis band.
 */
export function DynamicsChart(props: DynamicsChartProps) {
  const {
    className,
    type = 'compressor',
    beginEdit,
    endEdit,
    onSet,
    point$,
    releaseThreshold$,
    threshold$,
    ratio$,
    knee$,
    range$,
    ...rest
  } = props;

  const composedOnSet = composeInteractingOnSet({ beginEdit, endEdit }, onSet);
  const chartInstRef = useRef<AuxDynamicsInstance | null>(null);
  const pointHandleRef = useRef<AuxHandle | null>(null);
  const relHandleRef = useRef<AuxHandle | null>(null);
  /** Native AUX handle.set — bypasses our drag wrapper (avoids sync loops). */
  const relOrigSetRef = useRef<((k: string, v: unknown) => void) | null>(null);
  const bandRef = useRef<AuxGraph | null>(null);
  const releaseCurveRef = useRef<AuxGraph | null>(null);
  const pointUnsubRef = useRef<(() => void) | null>(null);
  const [chart, setChart] = useState<AuxDynamicsInstance | null>(null);

  const responseTargets = useMemo(
    () => (chart?.response?.element ? [chart.response.element] : []),
    [chart],
  );
  const getChartHeight = useCallback(
    (svg: SVGSVGElement) =>
      chart?.range_y?.options?.basis || svg.clientHeight || 1,
    [chart],
  );
  const reassertGradStroke = useChartGradient({
    svg: chart?.svg,
    enabled: !!chart,
    targets: responseTargets,
    paint: 'stroke',
    getHeight: getChartHeight,
  });
  const reassertRef = useRef(reassertGradStroke);
  reassertRef.current = reassertGradStroke;

  const detachPoint = useCallback(() => {
    pointUnsubRef.current?.();
    pointUnsubRef.current = null;

    const w = chartInstRef.current;
    const alive = w && !w.isDestructed();
    // Must removeHandle — otherwise band switches / widgetRef rebinds leave
    // orphaned operating-point dots on the transfer curve.
    if (alive) {
      if (pointHandleRef.current)
        try {
          w.removeHandle?.(pointHandleRef.current);
        } catch {
          /* destroyed */
        }
      if (relHandleRef.current)
        try {
          w.removeHandle?.(relHandleRef.current);
        } catch {
          /* destroyed */
        }
      if (releaseCurveRef.current)
        try {
          w.removeGraph?.(releaseCurveRef.current);
        } catch {
          /* destroyed */
        }
      if (bandRef.current)
        try {
          w.removeGraph?.(bandRef.current);
        } catch {
          /* destroyed */
        }
    }

    pointHandleRef.current = null;
    relHandleRef.current = null;
    relOrigSetRef.current = null;
    bandRef.current = null;
    releaseCurveRef.current = null;
  }, []);

  const syncExpanderCurve = useCallback(
    (w: AuxDynamicsInstance) => {
      if (type !== 'expander' || !w.response?.set) return;
      const th = threshold$?.value ?? -32;
      const rel = Math.min(releaseThreshold$?.value ?? th, th);
      const ratio = ratio$?.value ?? 4;
      const knee = knee$?.value ?? 6;
      const range = range$?.value ?? -60;
      // Open curve (attack / open threshold).
      w.response.set(
        'dots',
        expanderResponseDots(-60, 24, th, ratio, knee, range),
      );
      // Release curve: same shape, keyed at release threshold.
      releaseCurveRef.current?.set?.(
        'dots',
        expanderResponseDots(-60, 24, rel, ratio, knee, range),
      );
      reassertRef.current();
    },
    [type, threshold$, releaseThreshold$, ratio$, knee$, range$],
  );

  const syncHysteresisBand = useCallback(
    (open: number, rel: number) => {
      bandRef.current?.set?.('dots', [
        { x: rel, y: -60 },
        { x: open, y: -60 },
        { x: open, y: 24 },
        { x: rel, y: 24 },
        { x: rel, y: -60 },
      ]);
    },
    [],
  );

  const syncHysteresis = useCallback(
    (_w: AuxDynamicsInstance) => {
      if (type !== 'expander') return;
      const open = threshold$?.value ?? -32;
      const rel = Math.min(releaseThreshold$?.value ?? open, open);
      const set = relOrigSetRef.current;
      set?.('x', rel);
      set?.('y', rel);
      syncHysteresisBand(open, rel);
    },
    [type, threshold$, releaseThreshold$, syncHysteresisBand],
  );

  const widgetRef = useCallback(
    (w: AuxDynamicsInstance | null) => {
      detachPoint();
      chartInstRef.current = null;

      if (!w || w.isDestructed()) {
        setChart(null);
        return;
      }

      chartInstRef.current = w;
      setChart(w);

      // AUX Expander.drawGraph() ignores knee and overwrites response dots.
      // Always redraw with our soft-knee / range-floor path instead.
      if (type === 'expander') {
        w.drawGraph = () => {
          syncExpanderCurve(w);
        };
      }

      if (typeof w.addHandle === 'function') {
        pointHandleRef.current = w.addHandle({
          class: 'aux-operating',
          mode: 'circular',
          x: -60,
          y: -60,
          z: 1,
          min_size: 10,
          max_size: 14,
          format_label: false,
          label: '',
          show_handle: true,
          active: true,
        });
        pointHandleRef.current.toBack?.();

        if (type === 'expander' && releaseThreshold$) {
          relHandleRef.current = w.addHandle({
            class: 'aux-release-thresh',
            mode: 'circular',
            x: releaseThreshold$.value,
            y: releaseThreshold$.value,
            z: 1,
            min_size: 18,
            max_size: 18,
            format_label: false,
            label: '',
            show_handle: true,
            active: true,
            // Lock to unity diagonal via userset below.
          });
          // Drag → release threshold (x), clamp ≤ open threshold.
          const h = relHandleRef.current;
          const origSet = h.set.bind(h);
          relOrigSetRef.current = origSet;
          h.set = (k: string, v: unknown) => {
            if (k === 'x' || k === 'y') {
              const open = threshold$?.value ?? 0;
              const x = Math.min(Number(v), open);
              if (releaseThreshold$.value !== x) releaseThreshold$.set(x);
              origSet('x', x);
              origSet('y', x);
              syncHysteresisBand(open, x);
              return;
            }
            origSet(k, v);
          };
        }
      }

      if (type === 'expander' && typeof w.addGraph === 'function') {
        // Release transfer (same shape as open, keyed at release threshold).
        releaseCurveRef.current = w.addGraph({
          class: 'aux-response-release',
          mode: 'line',
          dots: [],
        });
        bandRef.current = w.addGraph({
          class: 'aux-hysteresis-band',
          mode: 'fill',
          dots: [],
        });
      }

      if (point$ && pointHandleRef.current) {
        const h = pointHandleRef.current;
        const apply = (v: number[]) => {
          if (!Array.isArray(v) || v.length < 2) return;
          h.set('x', v[0]);
          h.set('y', v[1]);
          reassertRef.current();
        };
        apply(point$.value);
        pointUnsubRef.current = point$.subscribe(apply, false);
      }

      syncExpanderCurve(w);
      syncHysteresis(w);
    },
    [
      detachPoint,
      point$,
      type,
      releaseThreshold$,
      threshold$,
      syncExpanderCurve,
      syncHysteresis,
      syncHysteresisBand,
    ],
  );

  useEffect(() => () => detachPoint(), [detachPoint]);

  useEffect(() => {
    pointHandleRef.current?.toBack?.();
  }, [chart]);

  useEffect(() => {
    if (!chart || chart.isDestructed()) return;
    const unsubs: (() => void)[] = [];
    const bump = () => {
      syncExpanderCurve(chart);
      syncHysteresis(chart);
    };
    for (const dv of [threshold$, ratio$, knee$, range$, releaseThreshold$]) {
      if (dv) unsubs.push(dv.subscribe(bump, false));
    }
    bump();
    return () => unsubs.forEach((u) => u());
  }, [
    chart,
    threshold$,
    ratio$,
    knee$,
    range$,
    releaseThreshold$,
    syncExpanderCurve,
    syncHysteresis,
  ]);

  const cls = ['DynamicsChart', type, className ?? '']
    .filter(Boolean)
    .join(' ');

  const Widget = type === 'expander' ? ExpanderWidget : CompressorWidget;

  return (
    <Widget
      className={cls}
      widgetRef={widgetRef}
      {...rest}
      threshold$={threshold$}
      ratio$={ratio$}
      knee$={knee$}
      range$={range$}
      makeup={0}
      {...(composedOnSet ? { onSet: composedOnSet } : {})}
    />
  );
}
