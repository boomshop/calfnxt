import { useCallback, useEffect, useRef } from 'react';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import './BandBridgeChart.scss';

const ChartBindings = {};
/** Normalized space: x 0…1 across the editor, y 1 = upper edge, 0 = lower edge. */
const ChartOptions = {
  auto_size: true,
  show_grid: false,
  label: false,
  range_x: { min: 0, max: 1 },
  range_y: { min: 0, max: 1 },
};

const ChartWidget = componentFromWidget(
  AuxChart,
  ChartBindings,
  ChartOptions,
  'BandBridgeChart',
);

type AuxGraph = {
  set: (k: string, v: unknown) => void;
  element?: SVGElement;
  destroy?: () => void;
  destroyAndRemove?: () => void;
};

type AuxChartInstance = {
  isDestructed?: () => boolean;
  set: (k: string, v: unknown) => void;
  addGraph: (opts: unknown) => AuxGraph;
  removeGraph: (g: AuxGraph) => void;
};

/**
 * Chart.removeGraph only unlinks the widget tree — the SVG path stays in
 * `_graphs`. destroyAndRemove unlinks and drops the path; fall back to a
 * captured element if that throws (same pitfall as ReverbChart).
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

function addBridgeGraph(chart: AuxChartInstance, index: number): AuxGraph {
  const g = chart.addGraph({
    dots: null,
    type: 'L',
    mode: 'fill',
    class: `bridge-band bridge-band-${index}`,
  });
  g.element?.classList.add('bridge-band', `bridge-band-${index}`);
  return g;
}

/** One trapezoid: upper edge `in1…in2`, lower edge `out1…out2` (all 0…1). */
export type BandBridgeSegment = {
  in1: number;
  in2: number;
  out1: number;
  out2: number;
};

export interface BandBridgeChartProps {
  segments: BandBridgeSegment[];
  className?: string;
}

function segmentDots(segment: BandBridgeSegment) {
  return [
    { x: segment.in1, y: 1 },
    { x: segment.in2, y: 1 },
    { x: segment.out2, y: 0 },
    { x: segment.out1, y: 0 },
  ];
}

/**
 * Thin connector strip: maps band widths of the chart above onto the equally
 * sized band strips below (or vice versa) with one trapezoid per band.
 */
export function BandBridgeChart(props: BandBridgeChartProps) {
  const { segments, className } = props;

  const chartRef = useRef<AuxChartInstance | null>(null);
  const graphsRef = useRef<AuxGraph[]>([]);
  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;

  const sync = useCallback(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDestructed?.()) return;

    const specs = segmentsRef.current;
    const graphs = graphsRef.current;

    while (graphs.length > specs.length) {
      const g = graphs.pop();
      if (g) disposeGraph(chart, g);
    }
    while (graphs.length < specs.length) {
      graphs.push(addBridgeGraph(chart, graphs.length));
    }

    specs.forEach((segment, i) => graphs[i]?.set('dots', segmentDots(segment)));
  }, []);

  const detach = useCallback(() => {
    const chart = chartRef.current;
    const graphs = graphsRef.current;
    graphsRef.current = [];
    chartRef.current = null;
    if (!chart || chart.isDestructed?.()) return;
    for (const g of graphs) disposeGraph(chart, g);
  }, []);

  const widgetRef = useCallback(
    (chart: AuxChartInstance | null) => {
      detach();
      if (!chart) return;
      chartRef.current = chart;
      sync();
    },
    [detach, sync],
  );

  useEffect(() => sync(), [segments, sync]);
  useEffect(() => () => detach(), [detach]);

  const cls = ['BandBridgeChart', className ?? ''].filter(Boolean).join(' ');

  return <ChartWidget className={cls} widgetRef={widgetRef} />;
}
