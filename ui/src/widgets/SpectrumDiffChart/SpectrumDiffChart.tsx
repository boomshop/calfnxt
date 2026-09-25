import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { bindAuxOptions } from '../../utils/aux_bindings';
import { useChartGradient } from '../../hooks/useChartGradient';
import type { Bindings } from '@deutschesoft/awml/src/bindings.js';
import {
  buildDbGridY,
  buildFreqGridX,
  parseSpectrumPayload,
  seriesDots,
} from '../SpectrumChart/SpectrumChart';
import './SpectrumDiffChart.scss';

const EMPTY: number[] = [];
const DB = 24;
const DIFF_STOPS = { cut: '50%', boost: '50%' };

const ChartWidget = componentFromWidget(
  AuxChart,
  {},
  {
    auto_size: true,
    show_grid: true,
    label: false,
    range_x: { min: 0, max: 128 },
    range_y: { min: -DB, max: DB },
    grid_x: buildFreqGridX(128),
    grid_y: buildDbGridY(-DB, DB, 6, 12),
  },
  'SpectrumDiffChart',
);

type AuxGraph = {
  set: (k: string, v: unknown) => void;
  element?: SVGElement;
};

type AuxChartInstance = {
  isDestructed?: () => boolean;
  set: (k: string, v: unknown) => void;
  addGraph: (opts: unknown) => AuxGraph;
  removeGraph: (g: AuxGraph) => void;
  element?: Element;
  svg?: SVGSVGElement;
};

/**
 * L−R on the same frequency grid and smoothing as the main analyzer.
 * Y is bipolar dB. Tilt is not applied.
 */
export function SpectrumDiffChart(props: { data$: DynamicValue<number[]> }) {
  const chartRef = useRef<AuxChartInstance | null>(null);
  const graphRef = useRef<AuxGraph | null>(null);
  const bindRef = useRef<Bindings | null>(null);
  const binsRef = useRef(128);
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const [strokeEl, setStrokeEl] = useState<SVGElement | null>(null);

  const gradTargets = useMemo(
    () => (strokeEl ? [strokeEl] : []),
    [strokeEl],
  );

  useChartGradient({
    svg,
    enabled: !!svg && !!strokeEl,
    targets: gradTargets,
    paint: 'stroke',
    reverse: true,
    cssVar: '--chart-diff-stroke',
    stopOffsets: DIFF_STOPS,
  });

  const paint = useCallback((raw: number[]) => {
    const chart = chartRef.current;
    const graph = graphRef.current;
    if (!chart || chart.isDestructed?.() || !graph) return null;
    const payload = parseSpectrumPayload(raw);
    if (!payload) return null;
    if (payload.bins !== binsRef.current) {
      binsRef.current = payload.bins;
      chart.set('range_x', { min: 0, max: payload.bins });
      chart.set('grid_x', buildFreqGridX(payload.bins));
    }
    const diff = new Float32Array(payload.bins);
    for (let i = 0; i < payload.bins; ++i)
      diff[i] = (payload.L[i] ?? -120) - (payload.R[i] ?? -120);
    const width = chart.element?.getBoundingClientRect().width ?? payload.bins;
    const px = width / Math.max(1, payload.bins);
    return seriesDots(diff, payload.bins, -DB, DB, 0, px);
  }, []);

  const widgetRef = useCallback(
    (chart: AuxChartInstance | null) => {
      bindRef.current?.dispose();
      bindRef.current = null;
      if (chartRef.current && graphRef.current && !chartRef.current.isDestructed?.())
        chartRef.current.removeGraph(graphRef.current);
      chartRef.current = chart;
      graphRef.current = null;
      setSvg(null);
      setStrokeEl(null);
      if (!chart || chart.isDestructed?.()) return;
      setSvg(chart.svg ?? null);
      const g = chart.addGraph({
        dots: null,
        type: 'L',
        mode: 'line',
        class: 'spec-diff',
      });
      g.element?.classList.add('spec-diff');
      graphRef.current = g;
      setStrokeEl(g.element ?? null);
      bindRef.current = bindAuxOptions(g, [
        {
          name: 'dots',
          backendValue: props.data$,
          readonly: true,
          transformReceive: (raw: unknown) =>
            paint(Array.isArray(raw) ? (raw as number[]) : EMPTY),
        },
      ]);
    },
    [paint, props.data$],
  );

  useEffect(() => () => {
    bindRef.current?.dispose();
  }, []);

  return (
    <div className="SpectrumDiffChart">
      <ChartWidget widgetRef={widgetRef} />
      <span className="diff-tag l">L</span>
      <span className="diff-tag r">R</span>
    </div>
  );
}
