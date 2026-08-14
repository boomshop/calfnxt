import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { postToHost } from '../../bridge';
import { useChartGradient } from '../../hooks/useChartGradient';
import { themeColors$ } from '../../theme/themeColors';
import './SpectrumChart.scss';

export const SPECTRUM_DB_MIN = -90;
export const SPECTRUM_DB_MAX = 0;
export const SPECTRUM_VIZ_ID = 'fft';

/** Analyzer display modes — keep in sync with DSP `mode` param. */
export const SPECTRUM_MODE = {
  Average: 0,
  Max: 1,
  Stereo: 2,
  Difference: 3,
  Spectralizer: 4,
} as const;

/** Display scale — keep in sync with DSP `scale` param. */
export const SPECTRUM_SCALE = {
  Linear: 0,
  Pink3: 1,
  Modern45: 2,
} as const;

export type SpectrumMode = (typeof SPECTRUM_MODE)[keyof typeof SPECTRUM_MODE];

const DB_GRID = 6;
const DB_LABEL = 12;
const F_MIN = 20;
const F_MAX = 20000;
const CORRIDOR_HALF_DB = 6;
/**
 * Extra UI smooth on L−R. L/R are already DSP-EMA'd (~100 ms); this adds a
 * light calm on the bipolar balance curve (~120 ms at ~30 Hz viz).
 * Retention a: y = a·y + (1−a)·x  with a = exp(−1/(τ·fps)).
 */
const DIFF_EMA = Math.exp(-1 / (0.12 * 30));

function slopeDbPerOct(scale: number): number {
  const s = Math.round(scale);
  if (s === SPECTRUM_SCALE.Pink3) return 3;
  if (s === SPECTRUM_SCALE.Modern45) return 4.5;
  return 0;
}

/** Log-bin index → Hz (matches DSP binning 20…20k). */
export function binToHz(i: number, bins: number): number {
  const t = (i + 0.5) / Math.max(1, bins);
  return F_MIN * Math.pow(F_MAX / F_MIN, t);
}

/** SPAN-style tilt: add slope·log2(f/1k) so pink looks flat. */
export function tiltDb(db: number, freqHz: number, slopePerOct: number): number {
  if (!(slopePerOct > 0) || !(freqHz > 0)) return db;
  return db + slopePerOct * Math.log2(freqHz / 1000);
}

function buildDbGridY(min: number, max: number, step: number, labelStep: number) {
  const lines: { pos: number; label?: string; class?: string }[] = [];
  const start = Math.ceil(min / step) * step;
  for (let db = start; db <= max; db += step) {
    const major = db % labelStep === 0;
    lines.push({
      pos: db,
      label: major ? `${db}` : undefined,
      class: major ? 'major' : undefined,
    });
  }
  return lines;
}

/** Vertical freq lines — same decade marks as AUX Equalizer / FrequencyResponse. */
const FREQ_GRID_MARKS: { hz: number; label?: string }[] = [
  { hz: 20, label: '20Hz' },
  { hz: 30 },
  { hz: 40 },
  { hz: 50 },
  { hz: 60 },
  { hz: 70 },
  { hz: 80 },
  { hz: 90 },
  { hz: 100, label: '100Hz' },
  { hz: 200 },
  { hz: 300 },
  { hz: 400 },
  { hz: 500 },
  { hz: 600 },
  { hz: 700 },
  { hz: 800 },
  { hz: 900 },
  { hz: 1000, label: '1kHz' },
  { hz: 2000 },
  { hz: 3000 },
  { hz: 4000 },
  { hz: 5000 },
  { hz: 6000 },
  { hz: 7000 },
  { hz: 8000 },
  { hz: 9000 },
  { hz: 10000, label: '10kHz' },
  { hz: 20000, label: '20kHz' },
];

function buildFreqGridX(bins: number) {
  const lines: { pos: number; label?: string; class?: string }[] = [];
  for (const mark of FREQ_GRID_MARKS) {
    if (mark.hz < F_MIN || mark.hz > F_MAX) continue;
    const t = Math.log(mark.hz / F_MIN) / Math.log(F_MAX / F_MIN);
    lines.push({
      pos: t * bins,
      label: mark.label,
      class: mark.label ? 'major' : undefined,
    });
  }
  return lines;
}

const ChartBindings = {};
const ChartOptions = {
  auto_size: true,
  show_grid: true,
  label: false,
  range_x: { min: 0, max: 128 },
  range_y: { min: SPECTRUM_DB_MIN, max: SPECTRUM_DB_MAX },
  grid_x: buildFreqGridX(128),
  grid_y: buildDbGridY(SPECTRUM_DB_MIN, SPECTRUM_DB_MAX, DB_GRID, DB_LABEL),
};

const ChartWidget = componentFromWidget(
  AuxChart,
  ChartBindings,
  ChartOptions,
  'SpectrumChart',
);

type AuxGraph = {
  set: (k: string, v: unknown) => void;
  element?: SVGElement;
  toFront?: () => void;
};

type AuxChartInstance = {
  isDestructed?: () => boolean;
  element?: Element;
  svg?: SVGSVGElement;
  set: (k: string, v: unknown) => void;
  addGraph: (opts: unknown) => AuxGraph;
  removeGraph: (g: AuxGraph) => void;
};

export type SpectrumPayload = {
  bins: number;
  hold: boolean;
  avg: Float32Array;
  max: Float32Array;
  L: Float32Array;
  R: Float32Array;
};

export function parseSpectrumPayload(v: number[] | null | undefined): SpectrumPayload | null {
  if (!v || v.length < 2) return null;
  const bins = Math.max(1, Math.min(256, Math.round(v[0] ?? 0)));
  const need = 2 + 4 * bins;
  if (v.length < need) return null;
  return {
    bins,
    hold: (v[1] ?? 0) >= 0.5,
    avg: Float32Array.from(v.slice(2, 2 + bins)),
    max: Float32Array.from(v.slice(2 + bins, 2 + 2 * bins)),
    L: Float32Array.from(v.slice(2 + 2 * bins, 2 + 3 * bins)),
    R: Float32Array.from(v.slice(2 + 3 * bins, 2 + 4 * bins)),
  };
}

/** Extra bin-units past [0, bins] so mode=bottom vertical closers are clipped. */
const SERIES_EDGE_PAD = 1.25;

function seriesDots(
  data: Float32Array,
  bins: number,
  yMin = SPECTRUM_DB_MIN,
  yMax = SPECTRUM_DB_MAX,
  slope = 0,
): { x: number; y: number }[] {
  if (bins < 1) return [];
  const ys: number[] = [];
  for (let i = 0; i < bins; ++i) {
    const raw = data[i] ?? yMin;
    let y = tiltDb(raw, binToHz(i, bins), slope);
    // Snap near-floor to floor so the fill/stroke ends at the bottom.
    if (y <= yMin + 0.75) y = yMin;
    ys.push(Math.min(yMax, Math.max(yMin, y)));
  }
  const first = ys[0]!;
  const last = ys[bins - 1]!;
  const pts: { x: number; y: number }[] = [
    // Hang past the plot so AUX bottom-fill vertical edges are off-screen.
    { x: -SERIES_EDGE_PAD, y: first },
  ];
  for (let i = 0; i < bins; ++i)
    pts.push({ x: i + 0.5, y: ys[i]! });
  pts.push({ x: bins + SERIES_EDGE_PAD, y: last });
  return pts;
}

/** Midband mean (200 Hz…2 kHz) of tilted curve — corridor center. */
function midbandMean(data: Float32Array, bins: number, slope: number): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < bins; ++i) {
    const f = binToHz(i, bins);
    if (f < 200 || f > 2000) continue;
    sum += tiltDb(data[i] ?? SPECTRUM_DB_MIN, f, slope);
    n += 1;
  }
  return n > 0 ? sum / n : -24;
}

function corridorBandStyle(centerDb: number, half: number): { top: string; height: string } {
  const yLo = Math.max(SPECTRUM_DB_MIN, centerDb - half);
  const yHi = Math.min(SPECTRUM_DB_MAX, centerDb + half);
  const range = SPECTRUM_DB_MAX - SPECTRUM_DB_MIN;
  const top = ((SPECTRUM_DB_MAX - yHi) / range) * 100;
  const height = ((yHi - yLo) / range) * 100;
  return { top: `${top}%`, height: `${Math.max(0.5, height)}%` };
}

function lerpByte(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function parseCssColor(c: string): [number, number, number] {
  const hex = c.trim();
  if (hex.startsWith('#') && (hex.length === 7 || hex.length === 4)) {
    const s = hex.slice(1);
    if (s.length === 3) {
      return [
        parseInt(s[0] + s[0], 16),
        parseInt(s[1] + s[1], 16),
        parseInt(s[2] + s[2], 16),
      ];
    }
    return [
      parseInt(s.slice(0, 2), 16),
      parseInt(s.slice(2, 4), 16),
      parseInt(s.slice(4, 6), 16),
    ];
  }
  const m = hex.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return [80, 180, 220];
}

export interface SpectrumChartProps {
  data$: DynamicValue<number[]>;
  /** 0…4 — Average / Max / Stereo / Difference / Spectralizer */
  mode: number;
  /** 0 Linear / 1 −3 dB/oct / 2 −4.5 dB/oct */
  scale?: number;
  hold: boolean;
  vizId?: string;
  className?: string;
}

/**
 * Spectrum analyzer chart. Curve modes use AUX Chart; Spectralizer is a
 * scrolling canvas waterfall (freq → x, time scrolls up).
 */
export function SpectrumChart(props: SpectrumChartProps) {
  const {
    data$,
    mode,
    scale = 0,
    hold,
    vizId = SPECTRUM_VIZ_ID,
    className,
  } = props;

  const chartRef = useRef<AuxChartInstance | null>(null);
  const graphsRef = useRef<AuxGraph[]>([]);
  const resizeRoRef = useRef<ResizeObserver | null>(null);
  const dataRef = useRef<number[]>([]);
  const modeRef = useRef(mode);
  const holdRef = useRef(hold);
  const scaleRef = useRef(scale);
  const diffSmoothRef = useRef<Float32Array | null>(null);
  modeRef.current = mode;
  holdRef.current = hold;
  scaleRef.current = scale;

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const waterfallRef = useRef<ImageData | null>(null);

  const [chartSvg, setChartSvg] = useState<SVGSVGElement | null>(null);
  const [gradTargets, setGradTargets] = useState<SVGElement[]>([]);
  const [bins, setBins] = useState(128);
  const corridorElRef = useRef<HTMLDivElement | null>(null);
  const isSpectralizer = Math.round(mode) === SPECTRUM_MODE.Spectralizer;
  const isStereo = Math.round(mode) === SPECTRUM_MODE.Stereo;
  // Level hue gradient for Average/Max stroke; Stereo uses solid L/R colors.
  const useLevelGrad = !isSpectralizer && !isStereo;

  const reassert = useChartGradient({
    svg: chartSvg,
    enabled: useLevelGrad,
    targets: gradTargets,
    paint: 'stroke',
  });
  const reassertRef = useRef(reassert);
  reassertRef.current = reassert;

  const sendVizBins = useCallback(
    (el: Element) => {
      const width = Math.round(el.getBoundingClientRect().width);
      const next = Math.max(32, Math.min(256, width));
      postToHost({ t: 'vizcfg', id: vizId, bins: next });
    },
    [vizId],
  );

  const paintWaterfall = useCallback(
    (payload: SpectrumPayload, slope: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      const cssW = Math.max(1, Math.floor(canvas.clientWidth));
      const cssH = Math.max(1, Math.floor(canvas.clientHeight));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(cssW * dpr));
      const h = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        waterfallRef.current = null;
      }

      let img = waterfallRef.current;
      if (!img || img.width !== w || img.height !== h) {
        img = ctx.createImageData(w, h);
        waterfallRef.current = img;
      }

      // Scroll existing pixels up by 1 row.
      const rowBytes = w * 4;
      img.data.copyWithin(0, rowBytes);
      // Clear bottom row (will fill with new spectrum).
      img.data.fill(0, (h - 1) * rowBytes);

      const colors = themeColors$.value;
      const [ar, ag, ab] = parseCssColor(colors.accent);
      const [wr, wg, wb] = parseCssColor(colors.warn);
      const n = payload.bins;
      const y0 = (h - 1) * rowBytes;
      const range = SPECTRUM_DB_MAX - SPECTRUM_DB_MIN;

      for (let x = 0; x < w; ++x) {
        const bin = Math.min(n - 1, Math.floor((x / w) * n));
        const raw = payload.avg[bin] ?? SPECTRUM_DB_MIN;
        const db = tiltDb(raw, binToHz(bin, n), slope);
        const t = Math.min(1, Math.max(0, (db - SPECTRUM_DB_MIN) / range));
        const i = y0 + x * 4;
        if (t < 0.015) {
          img.data[i] = 0;
          img.data[i + 1] = 0;
          img.data[i + 2] = 0;
          img.data[i + 3] = 0;
        } else {
          img.data[i] = lerpByte(ar, wr, t);
          img.data[i + 1] = lerpByte(ag, wg, t);
          img.data[i + 2] = lerpByte(ab, wb, t);
          // Opacity tracks level: silence → 0, full scale → 1.
          img.data[i + 3] = Math.round(t * 255);
        }
      }

      ctx.putImageData(img, 0, 0);
    },
    [],
  );

  const buildPoints = useCallback(
    (raw: number[]) => {
      const m = Math.round(modeRef.current);
      const slope = slopeDbPerOct(scaleRef.current);
      const payload = parseSpectrumPayload(raw);
      if (!payload) return;

      if (m === SPECTRUM_MODE.Spectralizer) {
        paintWaterfall(payload, slope);
        if (corridorElRef.current)
          corridorElRef.current.hidden = true;
        return;
      }

      const chart = chartRef.current;
      const graphs = graphsRef.current;
      if (!chart || chart.isDestructed?.()) return;

      if (payload.bins !== bins) {
        setBins(payload.bins);
        chart.set('range_x', { min: 0, max: payload.bins });
        chart.set('grid_x', buildFreqGridX(payload.bins));
      }

      const showHold = holdRef.current || payload.hold;

      if (m === SPECTRUM_MODE.Difference) {
        chart.set('range_y', { min: -24, max: 24 });
        chart.set('grid_y', buildDbGridY(-24, 24, 6, 12));
      } else {
        chart.set('range_y', { min: SPECTRUM_DB_MIN, max: SPECTRUM_DB_MAX });
        chart.set(
          'grid_y',
          buildDbGridY(SPECTRUM_DB_MIN, SPECTRUM_DB_MAX, DB_GRID, DB_LABEL),
        );
      }

      for (const g of graphs) g.set('dots', null);

      const [g0, g1, gHold] = graphs;
      if (m !== SPECTRUM_MODE.Difference)
        gHold?.element?.classList.remove('spec-diff');

      if (m === SPECTRUM_MODE.Average) {
        g0?.set('dots', seriesDots(payload.avg, payload.bins, SPECTRUM_DB_MIN, SPECTRUM_DB_MAX, slope));
        if (showHold)
          gHold?.set('dots', seriesDots(payload.max, payload.bins, SPECTRUM_DB_MIN, SPECTRUM_DB_MAX, slope));
      } else if (m === SPECTRUM_MODE.Max) {
        g0?.set('dots', seriesDots(payload.max, payload.bins, SPECTRUM_DB_MIN, SPECTRUM_DB_MAX, slope));
      } else if (m === SPECTRUM_MODE.Stereo) {
        g0?.set('dots', seriesDots(payload.L, payload.bins, SPECTRUM_DB_MIN, SPECTRUM_DB_MAX, slope));
        g1?.set('dots', seriesDots(payload.R, payload.bins, SPECTRUM_DB_MIN, SPECTRUM_DB_MAX, slope));
        if (showHold)
          gHold?.set('dots', seriesDots(payload.max, payload.bins, SPECTRUM_DB_MIN, SPECTRUM_DB_MAX, slope));
      } else if (m === SPECTRUM_MODE.Difference) {
        let smooth = diffSmoothRef.current;
        if (!smooth || smooth.length !== payload.bins) {
          smooth = new Float32Array(payload.bins);
          diffSmoothRef.current = smooth;
        }
        for (let i = 0; i < payload.bins; ++i) {
          const d = (payload.L[i] ?? SPECTRUM_DB_MIN) - (payload.R[i] ?? SPECTRUM_DB_MIN);
          smooth[i] = DIFF_EMA * smooth[i] + (1 - DIFF_EMA) * d;
        }
        gHold?.set('dots', seriesDots(smooth, payload.bins, -24, 24, 0));
        gHold?.element?.classList.add('spec-diff');
      }

      // Filled midband corridor in tilted Average/Max/Stereo views.
      const band = corridorElRef.current;
      if (
        band
        && slope > 0
        && (m === SPECTRUM_MODE.Average || m === SPECTRUM_MODE.Max || m === SPECTRUM_MODE.Stereo)
      ) {
        const src = m === SPECTRUM_MODE.Max ? payload.max : payload.avg;
        const center = midbandMean(src, payload.bins, slope);
        const st = corridorBandStyle(center, CORRIDOR_HALF_DB);
        band.hidden = false;
        band.style.top = st.top;
        band.style.height = st.height;
      } else if (band) {
        band.hidden = true;
      }

      gHold?.toFront?.();
      reassertRef.current();
    },
    [bins, paintWaterfall],
  );

  const detach = useCallback(() => {
    resizeRoRef.current?.disconnect();
    resizeRoRef.current = null;
    const chart = chartRef.current;
    const graphs = graphsRef.current;
    graphsRef.current = [];
    chartRef.current = null;
    setChartSvg(null);
    setGradTargets([]);
    if (!chart || chart.isDestructed?.()) return;
    for (const g of graphs) chart.removeGraph(g);
  }, []);

  const attach = useCallback(
    (chart: AuxChartInstance) => {
      chartRef.current = chart;
      if (chart.isDestructed?.()) return;

      chart.set('range_x', { min: 0, max: bins });
      chart.set('grid_x', buildFreqGridX(bins));

      const specs = [
        { className: 'spec-primary', mode: 'bottom' as const, gradient: true },
        { className: 'spec-secondary', mode: 'bottom' as const, gradient: false },
        { className: 'spec-hold', mode: 'line' as const, gradient: false },
      ];
      const aux: AuxGraph[] = [];
      const grads: SVGElement[] = [];
      for (const spec of specs) {
        const g = chart.addGraph({
          dots: null,
          type: 'L',
          mode: spec.mode,
          class: spec.className,
        });
        g.element?.classList.add(spec.className);
        if (spec.gradient && g.element) grads.push(g.element);
        aux.push(g);
      }
      graphsRef.current = aux;
      setChartSvg(chart.svg ?? null);
      setGradTargets(grads);
      buildPoints(dataRef.current);

      const el = chart.element ?? chart.svg;
      if (el) {
        sendVizBins(el);
        let raf = 0;
        const ro = new ResizeObserver(() => {
          if (raf) cancelAnimationFrame(raf);
          raf = requestAnimationFrame(() => sendVizBins(el));
        });
        ro.observe(el);
        resizeRoRef.current = ro;
      }
    },
    [bins, buildPoints, sendVizBins],
  );

  /** Spectralizer: AUX Chart used only as frequency/dB grid overlay. */
  const gridAttach = useCallback(
    (chart: AuxChartInstance) => {
      if (chart.isDestructed?.()) return;
      chart.set('range_x', { min: 0, max: bins });
      chart.set('grid_x', buildFreqGridX(bins));
      chart.set('range_y', { min: SPECTRUM_DB_MIN, max: SPECTRUM_DB_MAX });
      chart.set(
        'grid_y',
        buildDbGridY(SPECTRUM_DB_MIN, SPECTRUM_DB_MAX, DB_GRID, DB_LABEL),
      );
      chart.set('show_grid', true);
    },
    [bins],
  );

  const gridWidgetRef = useCallback(
    (chart: AuxChartInstance | null) => {
      if (chart) gridAttach(chart);
    },
    [gridAttach],
  );

  const widgetRef = useCallback(
    (chart: AuxChartInstance | null) => {
      if (!chart) {
        detach();
        return;
      }
      detach();
      attach(chart);
    },
    [attach, detach],
  );

  useEffect(() => {
    let raf = 0;
    const sync = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        buildPoints(dataRef.current);
      });
    };
    sync();
    const unsub = data$.subscribe((v) => {
      dataRef.current = Array.isArray(v) ? v : [];
      sync();
    }, false);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      unsub();
    };
  }, [data$, buildPoints]);

  useEffect(() => {
    buildPoints(dataRef.current);
  }, [mode, hold, scale, buildPoints]);

  useEffect(() => () => detach(), [detach]);

  // Waterfall: also listen for canvas size / theme and request bins from canvas.
  useEffect(() => {
    if (!isSpectralizer) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    sendVizBins(canvas);
    const ro = new ResizeObserver(() => {
      waterfallRef.current = null;
      sendVizBins(canvas);
      buildPoints(dataRef.current);
    });
    ro.observe(canvas);
    const unsubTheme = themeColors$.subscribe(() => {
      waterfallRef.current = null;
    });
    return () => {
      ro.disconnect();
      unsubTheme();
    };
  }, [isSpectralizer, sendVizBins, buildPoints]);

  const viewClass = useMemo(() => {
    const m = Math.round(mode);
    if (m === SPECTRUM_MODE.Stereo) return 'view-stereo';
    if (m === SPECTRUM_MODE.Difference) return 'view-difference';
    if (m === SPECTRUM_MODE.Spectralizer) return 'view-spectralizer';
    // Average + Max: one primary curve
    return 'view-single';
  }, [mode]);

  const modeClass = useMemo(() => {
    switch (Math.round(mode)) {
      case SPECTRUM_MODE.Max:
        return 'mode-max';
      case SPECTRUM_MODE.Stereo:
        return 'mode-stereo';
      case SPECTRUM_MODE.Difference:
        return 'mode-difference';
      case SPECTRUM_MODE.Spectralizer:
        return 'mode-spectralizer';
      case SPECTRUM_MODE.Average:
      default:
        return 'mode-average';
    }
  }, [mode]);

  const cls = useMemo(
    () =>
      ['SpectrumChart', viewClass, modeClass, className ?? '']
        .filter(Boolean)
        .join(' '),
    [className, modeClass, viewClass],
  );

  return (
    <div className={cls}>
      {!isSpectralizer && (
        <>
          <ChartWidget className="SpectrumChart-aux" widgetRef={widgetRef} />
          <div ref={corridorElRef} className="spec-corridor-fill" hidden aria-hidden />
        </>
      )}
      {isSpectralizer && (
        <>
          <canvas
            ref={canvasRef}
            className="SpectrumChart-waterfall"
            aria-label="Spectralizer"
          />
          <ChartWidget
            className="SpectrumChart-gridOverlay"
            widgetRef={gridWidgetRef}
          />
        </>
      )}
    </div>
  );
}
