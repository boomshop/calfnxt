import { useCallback, useEffect, useRef, useState } from 'react';
import type { DynamicValue } from '@deutschesoft/awml';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import { useChartGradient } from '../../hooks/useChartGradient';
import { addGraphClasses } from '../../styles/graphStyles';
import { DENOISER_DB_MAX, DENOISER_DB_MIN } from '../DenoiserChart/DenoiserChart';
import {
  SPECTRUM_MAX_BINS,
  buildFreqGridX,
  readSeriesT,
  seriesDots,
  spectrumScaleSlope,
} from '../SpectrumChart/SpectrumChart';
import './ProfileMiniSpectrum.scss';

type AuxGraph = {
  set: (k: string, v: unknown) => void;
  element?: Element | null;
};

type AuxChartInstance = {
  isDestructed?: () => boolean;
  set: (k: string, v: unknown) => void;
  addGraph: (opts: Record<string, unknown>) => AuxGraph;
  removeGraph: (g: AuxGraph) => void;
  svg?: SVGSVGElement | null;
  element?: Element | null;
};

const ChartWidget = componentFromWidget(
  AuxChart,
  {},
  {
    auto_size: true,
    show_grid: true,
    show_labels: false,
    label: false,
    range_x: { min: 0, max: 1 },
    range_y: { min: DENOISER_DB_MIN, max: DENOISER_DB_MAX },
    grid_x: buildFreqGridX(1),
  },
  'ProfileMiniSpectrumChart',
);

const EMPTY: number[] = [];

/** Spectrum snapshot → one filled curve. `t` is series 4 (no rms). */
function profileDots(
  raw: ArrayLike<number>,
  cssWidth: number,
  cssHeight: number,
  slope: number,
): { x: number; y: number }[] | null {
  if (raw.length < 2) return null;
  const bins = Math.max(1, Math.min(SPECTRUM_MAX_BINS, Math.round(raw[0] ?? 0)));
  if (raw.length < 2 + bins) return null;
  const avg = new Float32Array(bins);
  for (let i = 0; i < bins; ++i) avg[i] = raw[2 + i] ?? DENOISER_DB_MIN;
  const span = DENOISER_DB_MAX - DENOISER_DB_MIN;
  const pxPerY = cssHeight > 8 && span > 0 ? cssHeight / span : 0;
  const dots = seriesDots(
    avg,
    readSeriesT(raw, bins, 4),
    bins,
    DENOISER_DB_MIN,
    DENOISER_DB_MAX,
    slope,
    cssWidth,
    pxPerY,
  );
  return dots.length >= 2 ? dots : null;
}

export type ProfileMiniSpectrumProps = {
  /** Spectrum snapshot from viz (`denoiser_p1` … `denoiser_p3`). */
  data$: DynamicValue<number[]>;
  /** Header spectrum tilt: 0 linear / 1 −3 / 2 −4.5 dB/oct. */
  tilt: number;
};

export function ProfileMiniSpectrum(props: ProfileMiniSpectrumProps) {
  const { data$, tilt } = props;
  const slope = spectrumScaleSlope(tilt);
  const slopeRef = useRef(slope);
  slopeRef.current = slope;
  const rawRef = useRef<number[]>(EMPTY);

  const chartRef = useRef<AuxChartInstance | null>(null);
  const graphRef = useRef<AuxGraph | null>(null);
  const widthRef = useRef(0);
  const heightRef = useRef(0);
  const stopResize = useRef<(() => void) | null>(null);
  const [chartSvg, setChartSvg] = useState<SVGSVGElement | null>(null);

  const reassert = useChartGradient({
    svg: chartSvg,
    enabled: !!chartSvg,
  });
  const reassertRef = useRef(reassert);
  reassertRef.current = reassert;

  const paint = useCallback(() => {
    const chart = chartRef.current;
    const graph = graphRef.current;
    if (!chart || chart.isDestructed?.() || !graph) return;
    const svgW = chart.svg?.clientWidth ?? chart.element?.clientWidth ?? 0;
    const svgH = chart.svg?.clientHeight ?? chart.element?.clientHeight ?? 0;
    const width = svgW > 8 ? svgW : widthRef.current;
    const height = svgH > 8 ? svgH : heightRef.current;
    chart.set('range_x', { min: 0, max: 1 });
    chart.set('range_y', { min: DENOISER_DB_MIN, max: DENOISER_DB_MAX });
    chart.set('grid_x', buildFreqGridX(1));
    graph.set('dots', profileDots(rawRef.current, width, height, slopeRef.current));
    reassertRef.current();
  }, []);

  useEffect(() => {
    const unsub = data$.subscribe((raw: number[]) => {
      rawRef.current = Array.isArray(raw) && raw.length ? raw : EMPTY;
      paint();
    }, true);
    return () => {
      unsub();
    };
  }, [data$, paint]);

  const widgetRef = useCallback(
    (inst: AuxChartInstance | null) => {
      const prev = chartRef.current;
      const prevG = graphRef.current;
      if (prev && prevG && !prev.isDestructed?.()) {
        try {
          prev.removeGraph(prevG);
        } catch {
          /* gone */
        }
      }
      chartRef.current = inst;
      graphRef.current = null;
      setChartSvg(null);
      stopResize.current?.();
      stopResize.current = null;
      if (!inst || inst.isDestructed?.()) return;

      inst.set('range_x', { min: 0, max: 1 });
      inst.set('range_y', { min: DENOISER_DB_MIN, max: DENOISER_DB_MAX });
      inst.set('grid_x', buildFreqGridX(1));
      const g = inst.addGraph({
        dots: null,
        type: 'L',
        mode: 'bottom',
        class: 'profile-mini',
      });
      addGraphClasses(g.element, 'profile-mini', 'fill-gradient fill-full stroke-none');
      graphRef.current = g;
      setChartSvg(inst.svg ?? null);
      const el = inst.element ?? inst.svg;
      if (el && typeof ResizeObserver !== 'undefined') {
        const box = el.getBoundingClientRect();
        if (box.width > 8) widthRef.current = box.width;
        if (box.height > 8) heightRef.current = box.height;
        const ro = new ResizeObserver(() => {
          const next = el.getBoundingClientRect();
          const dw = next.width > 8 ? Math.abs(next.width - widthRef.current) : 0;
          const dh = next.height > 8 ? Math.abs(next.height - heightRef.current) : 0;
          if (dw < 1 && dh < 1) return;
          if (next.width > 8) widthRef.current = next.width;
          if (next.height > 8) heightRef.current = next.height;
          paint();
        });
        ro.observe(el);
        stopResize.current = () => ro.disconnect();
      }
      paint();
    },
    [paint],
  );

  useEffect(() => {
    paint();
  }, [paint, slope]);

  useEffect(
    () => () => {
      stopResize.current?.();
    },
    [],
  );

  return <ChartWidget widgetRef={widgetRef} className="ProfileMiniSpectrumChart" />;
}
