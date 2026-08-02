import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { Compressor as AuxCompressor } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import { useChartGradient } from '../../hooks/useChartGradient';
import { composeInteractingOnSet, type AuxOnSet } from '../editGesture';
import './DynamicsChart.scss';

const DynamicsBindings = {
  threshold$: { name: 'threshold' },
  ratio$: { name: 'ratio' },
  makeup$: { name: 'makeup' },
  knee$: { name: 'knee' },
};

/** Match knob ranges: threshold −60…0, ratio 1…20, makeup up to +24. */
const DynamicsOptions = {
  type: 'compressor',
  min: -60,
  max: 24,
  db_grid: 12,
  show_handle: true,
  show_ratio: true,
  ratio_x: 12,
  // Chart default range_z is 0…1; Dynamics.snap(ratio) would clamp every
  // ratio to 1 without an explicit ratio range (z = ratio on the handle).
  range_z: { min: 1, max: 20, basis: 300 },
};

const DynamicsWidget = componentFromWidget(
  AuxCompressor,
  DynamicsBindings,
  DynamicsOptions,
  'DynamicsChart',
);

type AuxHandle = {
  set: (k: string, v: unknown) => void;
};

type AuxGraph = {
  element?: SVGElement;
};

type AuxDynamicsInstance = {
  isDestructed: () => boolean;
  element: Element;
  svg?: SVGSVGElement;
  response?: AuxGraph;
  range_y?: { options?: { basis?: number } };
  addHandle?: (opts: Record<string, unknown>) => AuxHandle;
};

export interface DynamicsChartProps {
  className?: string;
  threshold$?: DynamicValue<number>;
  ratio$?: DynamicValue<number>;
  makeup$?: DynamicValue<number>;
  knee$?: DynamicValue<number>;
  /** Operating point [inDb, outDb] from DSP viz. */
  point$?: DynamicValue<number[]>;
  beginEdit?: () => void;
  endEdit?: () => void;
  onSet?: AuxOnSet;
  [key: string]: unknown;
}

/**
 * AUX Compressor transfer curve + optional DSP operating-point handle.
 * Stub layout — style later.
 */
export function DynamicsChart(props: DynamicsChartProps) {
  const { className, beginEdit, endEdit, onSet, point$, ...rest } = props;

  const composedOnSet = composeInteractingOnSet({ beginEdit, endEdit }, onSet);
  const pointHandleRef = useRef<AuxHandle | null>(null);
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
    pointHandleRef.current = null;
  }, []);

  const widgetRef = useCallback(
    (w: AuxDynamicsInstance | null) => {
      detachPoint();

      if (!w || w.isDestructed()) {
        setChart(null);
        return;
      }

      setChart(w);

      // Live operating point on the curve. Keep `active: true` — AUX hides
      // inactive ChartHandles (`display: none`). Dragging is blocked in CSS.
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
      }    },
    [detachPoint, point$],
  );

  useEffect(() => () => detachPoint(), [detachPoint]);

  const cls = ['DynamicsChart', className ?? ''].filter(Boolean).join(' ');

  return (
    <DynamicsWidget
      className={cls}
      widgetRef={widgetRef}
      {...rest}
      {...(composedOnSet ? { onSet: composedOnSet } : {})}
    />
  );
}
