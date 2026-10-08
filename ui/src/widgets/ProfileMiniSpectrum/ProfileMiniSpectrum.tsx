import { useCallback, useEffect, useRef, useState } from 'react';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import { useChartGradient } from '../../hooks/useChartGradient';
import { addGraphClasses } from '../../styles/graphStyles';
import { observeVizBins } from '../../utils/vizBins';
import {
  SPECTRUM_DB_MAX,
  SPECTRUM_DB_MIN,
  SPECTRUM_MAX_BINS,
  SPECTRUM_MIN_BINS,
  binToHz,
  buildFreqGridX,
  catmullRomDensify,
  spectrumScaleSlope,
  tiltDb,
} from '../SpectrumChart/SpectrumChart';
import './ProfileMiniSpectrum.scss';

/** vizcfg id — thumbnail width, separate from the main spectrum bin count. */
const MINI_VIZ_ID = 'denoiser_mini';

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
    range_x: { min: 0, max: 128 },
    range_y: { min: SPECTRUM_DB_MIN, max: SPECTRUM_DB_MAX },
    grid_x: buildFreqGridX(128),
  },
  'ProfileMiniSpectrumChart',
);

function clampDb(y: number): number {
  return Math.min(SPECTRUM_DB_MAX, Math.max(SPECTRUM_DB_MIN, y));
}

/**
 * Light 3-tap over the whole series.
 * Repeated FFT bins are flat runs; single HF bins spike. Two short passes
 * join both without the spectrum smoother's heavy low-end iron (that turned
 * the contour into a straight shelf and left the top end as needles).
 */
function softenProfile(ys: number[]): number[] {
  if (ys.length < 3) return ys;
  let cur = ys.slice();
  for (let pass = 0; pass < 2; ++pass) {
    const next = cur.slice();
    for (let i = 1; i < cur.length - 1; ++i) {
      const avg = 0.25 * cur[i - 1]! + 0.5 * cur[i]! + 0.25 * cur[i + 1]!;
      next[i] = cur[i]! * 0.35 + avg * 0.65;
    }
    cur = next;
  }
  return cur;
}

/**
 * One published log-bin → one vertex on a linear bin-index axis.
 * Densify only when a bin is wider than a pixel; a 1:1 Catmull-Rom rings
 * the HF spikes back into needles.
 */
function profileDots(
  db: ArrayLike<number>,
  cssWidth: number,
  slope: number,
): { x: number; y: number }[] | null {
  const n = db.length;
  if (n < 2) return null;
  const ys: number[] = [];
  for (let i = 0; i < n; ++i) {
    const f = binToHz(i, n);
    const raw = db[i];
    const dbv =
      typeof raw === 'number' && Number.isFinite(raw) ? raw : SPECTRUM_DB_MIN;
    ys.push(clampDb(tiltDb(dbv, f, slope)));
  }
  const width = cssWidth > 1 ? cssWidth : n;
  const smoothed = softenProfile(ys);
  const mid = smoothed.map((y, i) => ({ x: i + 0.5, y }));
  const px = width / n;
  const curved = px > 1.4 ? catmullRomDensify(mid, width, 'linear') : mid;
  for (const p of curved) p.y = clampDb(p.y);
  return curved;
}

export type ProfileMiniSpectrumProps = {
  /** Log-binned dB, 20 Hz…20 kHz, already sized to this chart. */
  db: number[];
  valid: boolean;
  /** Header spectrum tilt: 0 linear / 1 −3 / 2 −4.5 dB/oct. */
  tilt: number;
};

export function ProfileMiniSpectrum(props: ProfileMiniSpectrumProps) {
  const { db, valid, tilt } = props;
  const slope = spectrumScaleSlope(tilt);
  const slopeRef = useRef(slope);
  slopeRef.current = slope;
  const dbRef = useRef(db);
  dbRef.current = db;
  const validRef = useRef(valid);
  validRef.current = valid;

  const chartRef = useRef<AuxChartInstance | null>(null);
  const graphRef = useRef<AuxGraph | null>(null);
  const widthRef = useRef(0);
  const stopViz = useRef<(() => void) | null>(null);
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
    const series =
      validRef.current && dbRef.current.length >= 2 ? dbRef.current : null;
    if (!series) {
      graph.set('dots', null);
      return;
    }
    const bins = series.length;
    const svgW = chart.svg?.clientWidth ?? chart.element?.clientWidth ?? 0;
    const width = svgW > 8 ? svgW : widthRef.current;
    chart.set('range_x', { min: 0, max: bins });
    chart.set('range_y', { min: SPECTRUM_DB_MIN, max: SPECTRUM_DB_MAX });
    chart.set('grid_x', buildFreqGridX(bins));
    graph.set('dots', profileDots(series, width, slopeRef.current));
    reassertRef.current();
  }, []);

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
      stopViz.current?.();
      stopViz.current = null;
      stopResize.current?.();
      stopResize.current = null;
      if (!inst || inst.isDestructed?.()) return;

      inst.set('range_x', { min: 0, max: 128 });
      inst.set('range_y', { min: SPECTRUM_DB_MIN, max: SPECTRUM_DB_MAX });
      inst.set('grid_x', buildFreqGridX(128));
      const g = inst.addGraph({
        dots: null,
        type: 'L',
        mode: 'bottom',
        class: 'profile-mini',
      });
      // Same fill as the upper spectrum: area under the curve, down to the floor.
      addGraphClasses(
        g.element,
        'profile-mini',
        'fill-gradient fill-full stroke-none',
      );
      graphRef.current = g;
      setChartSvg(inst.svg ?? null);
      const el = inst.element ?? inst.svg;
      if (el) {
        const w = el.getBoundingClientRect().width;
        if (w > 8) widthRef.current = w;
        stopViz.current = observeVizBins(
          el,
          MINI_VIZ_ID,
          SPECTRUM_MIN_BINS,
          SPECTRUM_MAX_BINS,
        );
        if (typeof ResizeObserver !== 'undefined') {
          const ro = new ResizeObserver(() => {
            const next = el.getBoundingClientRect().width;
            if (!(next > 8) || Math.abs(next - widthRef.current) < 1) return;
            widthRef.current = next;
            paint();
          });
          ro.observe(el);
          stopResize.current = () => ro.disconnect();
        }
      }
      paint();
    },
    [paint],
  );

  useEffect(() => {
    paint();
  }, [paint, db, valid, slope]);

  useEffect(
    () => () => {
      stopViz.current?.();
      stopResize.current?.();
    },
    [],
  );

  return <ChartWidget widgetRef={widgetRef} className="ProfileMiniSpectrumChart" />;
}
