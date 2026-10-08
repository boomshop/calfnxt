import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Chart as AuxChart,
  EqBand as AuxEqBand,
  EqualizerGraph as AuxEqualizerGraph,
} from '@deutschesoft/aux-widgets/src/index.pure.js';
import { DynamicValue } from '@deutschesoft/awml';
import type { Bindings } from '@deutschesoft/awml/src/bindings.js';
import {
  componentFromWidget,
  useWidgetsWithBindingsAndEvents,
} from '@deutschesoft/use-aux-widgets';
import { bindAuxOptions } from '../../utils/aux_bindings';
import { postToHost } from '../../utils/bridge';
import { buildDbGridY } from '../../utils/chartGrid';
import { useChartGradient } from '../../hooks/useChartGradient';
import { addGraphClasses } from '../../styles/graphStyles';
import { auxHighpass24, auxLowpass24 } from '../../dsp/eqFilters';
import {
  SPECTRUM_DB_MAX,
  SPECTRUM_DB_MIN,
  SPECTRUM_MAX_BINS,
  SPECTRUM_MIN_BINS,
  binToHz,
  catmullRomDensify,
  smoothSeriesY,
  spectrumPxPerBin,
  tiltDb,
} from '../SpectrumChart/SpectrumChart';
import './DenoiserChart.scss';

type AuxChartInstance = InstanceType<typeof AuxChart> & {
  addGraph: (opts: Record<string, unknown>) => AuxGraph;
  removeGraph: (g: AuxGraph) => void;
  addHandle?: (h: unknown) => unknown;
  removeHandle?: (h: unknown) => void;
  svg?: SVGSVGElement | null;
  element?: Element | null;
  isDestructed?: () => boolean;
  set: (key: string, value: unknown) => void;
};
type AuxGraph = {
  set: (key: string, value: unknown) => void;
  element?: Element | null;
  toFront?: () => void;
};
type AuxWidget = {
  element?: Element | null;
  set?: (key: string, value: unknown) => void;
  invalidate?: (key: string) => void;
};

const ChartWidget = componentFromWidget(AuxChart);

const F_MIN = 20;
const F_MAX = 20000;
/** GR / Depth viz axis (same scale as TamerChart). */
export const DENOISER_DB_MIN = -24;
export const DENOISER_DB_MAX = 0;
export const DENOISER_VIZ_ID = 'denoiser';
export const DENOISER_PROF_VIZ_ID = 'denoiser_prof';
const SPECTRUM_VIZ_ID = 'fft';
const SEARCH_Q = 0.707;

const EMPTY: number[] = [];

export type DenoiserChartEdit = {
  beginEdit?: () => void;
  endEdit?: () => void;
};

function spectrumSlope(scale: number): number {
  const s = Math.round(scale);
  if (s === 1) return 3;
  if (s === 2) return 4.5;
  return 0;
}

/** Map analyzer dBFS (−96…0) onto the GR axis (−24…0) as a background fill. */
function spectrumToGrY(db: number): number {
  const t = (db - SPECTRUM_DB_MIN) / (SPECTRUM_DB_MAX - SPECTRUM_DB_MIN);
  return (
    DENOISER_DB_MIN + Math.min(1, Math.max(0, t)) * (DENOISER_DB_MAX - DENOISER_DB_MIN)
  );
}

/**
 * Same polyline as the main spectrum fill: Hz from the log-bin index, tilt,
 * −96…0 mapped onto the chart, then the shared smoother.
 * When the series is denser than the CSS width (mini reuses the main chart's
 * bin count), keep one vertex per pixel so AUX does not stack bins.
 */
export function spectrumCurveDots(
  db: ArrayLike<number>,
  cssWidth: number,
  slope: number,
): { x: number; y: number }[] | null {
  const n = db.length;
  if (n < 2) return null;
  const width = cssWidth > 1 ? cssWidth : 0;
  const count = width > 1 ? Math.max(2, Math.min(n, Math.floor(width))) : n;
  const ys: number[] = [];
  const hz: number[] = [];
  for (let i = 0; i < count; ++i) {
    const j =
      count === n
        ? i
        : Math.min(n - 1, Math.round(((i + 0.5) * n) / count - 0.5));
    const f = binToHz(j, n);
    const raw = db[j];
    const dbv =
      typeof raw === 'number' && Number.isFinite(raw) ? raw : SPECTRUM_DB_MIN;
    hz.push(f);
    ys.push(spectrumToGrY(tiltDb(dbv, f, slope)));
  }
  const smoothed = smoothSeriesY(ys, hz, spectrumPxPerBin(width, count));
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < smoothed.length; ++i)
    pts.push({ x: hz[i]!, y: smoothed[i]! });
  return pts.length ? catmullRomDensify(pts, width > 1 ? width : count, 'log') : null;
}

function parseSpectrum(v: number[]): { bins: number; avg: Float32Array } {
  const bins = Math.max(1, Math.min(SPECTRUM_MAX_BINS, Math.round(v[0] ?? 0)));
  const avg = new Float32Array(bins);
  for (let i = 0; i < bins; ++i) avg[i] = v[2 + i] ?? SPECTRUM_DB_MIN;
  return { bins, avg };
}

/** DSP layout [bins, grL×N, grR×N] — use L channel (linked → L==R). */
function parseGr(v: number[]): { bins: number; gr: Float32Array } {
  const bins = Math.max(1, Math.min(SPECTRUM_MAX_BINS, Math.round(v[0] ?? 0)));
  const gr = new Float32Array(bins);
  for (let i = 0; i < bins; ++i) gr[i] = v[1 + i] ?? 0;
  return { bins, gr };
}

function formatFreq(hz: number): string {
  if (!(hz > 0) || !Number.isFinite(hz)) return '—';
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)} kHz`;
  return `${Math.round(hz)} Hz`;
}

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

function buildFreqGridX() {
  const lines: { pos: number; label?: string; class?: string }[] = [];
  for (const mark of FREQ_GRID_MARKS) {
    if (mark.hz < F_MIN || mark.hz > F_MAX) continue;
    lines.push({
      pos: mark.hz,
      label: mark.label,
      class: mark.label ? 'major' : undefined,
    });
  }
  return lines;
}

const DENOISER_DB_GRID = buildDbGridY(DENOISER_DB_MIN, DENOISER_DB_MAX, 6, 6, {
  labelEvery: true,
});

export interface DenoiserChartProps {
  spectrum$: DynamicValue<number[]>;
  /** Active / blended profile spectrum (thin stroke). */
  profileSpectrum$: DynamicValue<number[]>;
  gr$: DynamicValue<number[]>;
  /** 0 Linear / 1 −3 / 2 −4.5 */
  spectrumTilt: number;
  fLo$: DynamicValue<number>;
  fHi$: DynamicValue<number>;
  fLoOn$: DynamicValue<boolean>;
  fHiOn$: DynamicValue<boolean>;
  fLoEdit?: DenoiserChartEdit;
  fHiEdit?: DenoiserChartEdit;
  className?: string;
}

/**
 * Input spectrum fill + out (in+GR) + thick GR stroke + thin active profile.
 * Band edges as fixed 24 dB HP/LP EqBand handles.
 */
export function DenoiserChart(props: DenoiserChartProps) {
  const {
    spectrum$,
    profileSpectrum$,
    gr$,
    spectrumTilt,
    fLo$,
    fHi$,
    fLoOn$,
    fHiOn$,
    fLoEdit,
    fHiEdit,
    className,
  } = props;

  const chartRef = useRef<AuxChartInstance | null>(null);
  const graphsRef = useRef<AuxGraph[]>([]);
  const bindingsRef = useRef<Bindings[]>([]);
  const resizeRoRef = useRef<ResizeObserver | null>(null);
  const tiltRef = useRef(spectrumTilt);
  const binsRef = useRef(128);
  const chartWidthRef = useRef(0);
  const spectrumLatest = useRef<number[]>(EMPTY);
  const profileLatest = useRef<number[]>(EMPTY);
  const grLatest = useRef<number[]>(EMPTY);
  tiltRef.current = spectrumTilt;

  const [chart, setChart] = useState<AuxChartInstance | null>(null);
  const [chartSvg, setChartSvg] = useState<SVGSVGElement | null>(null);

  const loMax$ = useMemo(() => DynamicValue.fromConstant(F_MAX), []);
  const hiMin$ = useMemo(() => DynamicValue.fromConstant(F_MIN), []);

  useEffect(() => {
    const sync = () => {
      const lo = fLo$.value ?? F_MIN;
      const hi = fHi$.value ?? F_MAX;
      loMax$.set(Math.max(F_MIN, Math.min(F_MAX, hi)));
      hiMin$.set(Math.max(F_MIN, Math.min(F_MAX, lo)));
    };
    sync();
    const u0 = fLo$.subscribe(sync, false);
    const u1 = fHi$.subscribe(sync, false);
    return () => {
      u0();
      u1();
    };
  }, [fLo$, fHi$, loMax$, hiMin$]);

  const reassert = useChartGradient({
    svg: chartSvg,
    enabled: true,
    reverse: false,
  });
  const reassertRef = useRef(reassert);
  reassertRef.current = reassert;

  const sendVizBins = useCallback((el: Element) => {
    const width = Math.round(el.getBoundingClientRect().width);
    chartWidthRef.current = Math.max(1, width);
    const next = Math.max(SPECTRUM_MIN_BINS, Math.min(SPECTRUM_MAX_BINS, width));
    postToHost({ t: 'vizcfg', id: SPECTRUM_VIZ_ID, bins: next });
    postToHost({ t: 'vizcfg', id: DENOISER_VIZ_ID, bins: next });
    postToHost({ t: 'vizcfg', id: DENOISER_PROF_VIZ_ID, bins: next });
  }, []);

  const handleOptions = useMemo(
    () => [
      {
        mode: 'block-left',
        type: auxHighpass24,
        class: 'denoiser-band-lo',
        label: 'Low',
        format_label: (_l: string, x: number) => formatFreq(x),
        preferences: ['right', 'left'],
        gain: 0,
        q: SEARCH_Q,
        active: true,
        y_min: DENOISER_DB_MIN,
        y_max: DENOISER_DB_MAX,
        freq: fLo$.value ?? 20,
        x_min: F_MIN,
        x_max: F_MAX,
        show_axis: false,
        min_size: 16,
        max_size: 48,
      },
      {
        mode: 'block-right',
        type: auxLowpass24,
        class: 'denoiser-band-hi',
        label: 'High',
        format_label: (_l: string, x: number) => formatFreq(x),
        preferences: ['left', 'right'],
        gain: 0,
        q: SEARCH_Q,
        active: true,
        y_min: DENOISER_DB_MIN,
        y_max: DENOISER_DB_MAX,
        freq: fHi$.value ?? 160,
        x_min: F_MIN,
        x_max: F_MAX,
        show_axis: false,
        min_size: 16,
        max_size: 48,
      },
    ],
    [fLo$, fHi$],
  );

  const handleBindings = useMemo(
    () => [
      [
        { name: 'freq', backendValue: fLo$ },
        { name: 'x_max', backendValue: loMax$, readonly: true },
        { name: 'active', backendValue: fLoOn$, readonly: true },
      ],
      [
        { name: 'freq', backendValue: fHi$ },
        { name: 'x_min', backendValue: hiMin$, readonly: true },
        { name: 'active', backendValue: fHiOn$, readonly: true },
      ],
    ],
    [fLo$, fHi$, fLoOn$, fHiOn$, loMax$, hiMin$],
  );

  const handleEvents = useMemo(
    () => [
      {
        set_interacting: (on: unknown) => {
          if (on) fLoEdit?.beginEdit?.();
          else fLoEdit?.endEdit?.();
        },
      },
      {
        set_interacting: (on: unknown) => {
          if (on) fHiEdit?.beginEdit?.();
          else fHiEdit?.endEdit?.();
        },
      },
    ],
    [fLoEdit, fHiEdit],
  );

  const handles = useWidgetsWithBindingsAndEvents(
    AuxEqBand,
    handleOptions,
    handleBindings,
    handleEvents,
  );

  const eqGraphOptions = useMemo(
    () => [
      {
        bands: handles,
        mode: 'line',
        class: 'denoiser-band-eq',
        active: true,
        accuracy: 1,
        oversampling: 8,
        threshold: 3,
      },
    ],
    [handles],
  );

  const eqGraphs = useWidgetsWithBindingsAndEvents(AuxEqualizerGraph, eqGraphOptions);

  useEffect(() => {
    for (const g of eqGraphs) {
      (g as AuxWidget).invalidate?.('bands');
    }
  }, [eqGraphs, handles]);

  const buildSpecDots = useCallback(
    (raw: number[]): { x: number; y: number }[] | null => {
      if (raw.length < 2) return null;
      const slope = spectrumSlope(tiltRef.current);
      const { bins: sb, avg } = parseSpectrum(raw);
      binsRef.current = sb;
      return spectrumCurveDots(avg, chartWidthRef.current, slope);
    },
    [],
  );

  const buildOutDots = useCallback(
    (specRaw: number[], grRaw: number[]): { x: number; y: number }[] | null => {
      if (specRaw.length < 2) return null;
      const slope = spectrumSlope(tiltRef.current);
      const { bins: sb, avg } = parseSpectrum(specRaw);
      const gr = grRaw.length >= 1 ? parseGr(grRaw).gr : null;
      const gb = gr ? gr.length : 0;
      const ys: number[] = [];
      const hz: number[] = [];
      for (let i = 0; i < sb; ++i) {
        const f = binToHz(i, sb);
        let g = 0;
        if (gr && gb > 0) {
          if (gb === sb) g = gr[i] ?? 0;
          else {
            const j = Math.min(gb - 1, Math.max(0, Math.round((i / sb) * gb)));
            g = gr[j] ?? 0;
          }
        }
        const inY = spectrumToGrY(tiltDb(avg[i] ?? SPECTRUM_DB_MIN, f, slope));
        const outY = Math.min(DENOISER_DB_MAX, Math.max(DENOISER_DB_MIN, inY + g));
        hz.push(f);
        ys.push(outY);
      }
      const smoothed = smoothSeriesY(
        ys,
        hz,
        spectrumPxPerBin(chartWidthRef.current, sb),
      );
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < smoothed.length; ++i)
        pts.push({ x: hz[i]!, y: smoothed[i]! });
      return pts.length
        ? catmullRomDensify(pts, chartWidthRef.current, 'log')
        : null;
    },
    [],
  );

  const buildGrDots = useCallback(
    (raw: number[]): { x: number; y: number }[] | null => {
      if (raw.length < 1) return null;
      const { bins: gb, gr } = parseGr(raw);
      binsRef.current = gb;
      const ys: number[] = [];
      const hz: number[] = [];
      for (let i = 0; i < gb; ++i) {
        hz.push(binToHz(i, gb));
        ys.push(Math.min(DENOISER_DB_MAX, Math.max(DENOISER_DB_MIN, gr[i] ?? 0)));
      }
      const smoothed = smoothSeriesY(
        ys,
        hz,
        spectrumPxPerBin(chartWidthRef.current, gb),
      );
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < smoothed.length; ++i)
        pts.push({ x: hz[i]!, y: smoothed[i]! });
      return pts.length
        ? catmullRomDensify(pts, chartWidthRef.current, 'log')
        : null;
    },
    [],
  );

  const paintOutSibling = useCallback(() => {
    const gOut = graphsRef.current[1];
    if (!gOut) return;
    gOut.set('dots', buildOutDots(spectrumLatest.current, grLatest.current));
  }, [buildOutDots]);

  const disposeBindings = useCallback(() => {
    for (const b of bindingsRef.current) b.dispose();
    bindingsRef.current = [];
  }, []);

  const attachBindings = useCallback(() => {
    disposeBindings();
    const gIn = graphsRef.current[0];
    const gOut = graphsRef.current[1];
    const gGr = graphsRef.current[2];
    const gProf = graphsRef.current[3];
    if (!gIn || !gOut || !gGr || !gProf) return;

    bindingsRef.current = [
      bindAuxOptions(gIn, [
        {
          name: 'dots',
          backendValue: spectrum$,
          readonly: true,
          transformReceive: (raw: unknown) => {
            const next =
              Array.isArray(raw) && raw.length ? (raw as number[]) : EMPTY;
            spectrumLatest.current = next;
            paintOutSibling();
            reassertRef.current();
            return buildSpecDots(next);
          },
        },
      ]),
      bindAuxOptions(gGr, [
        {
          name: 'dots',
          backendValue: gr$,
          readonly: true,
          transformReceive: (raw: unknown) => {
            const next =
              Array.isArray(raw) && raw.length ? (raw as number[]) : EMPTY;
            grLatest.current = next;
            paintOutSibling();
            gGr.toFront?.();
            gProf.toFront?.();
            reassertRef.current();
            return buildGrDots(next);
          },
        },
      ]),
      bindAuxOptions(gProf, [
        {
          name: 'dots',
          backendValue: profileSpectrum$,
          readonly: true,
          transformReceive: (raw: unknown) => {
            const next =
              Array.isArray(raw) && raw.length ? (raw as number[]) : EMPTY;
            profileLatest.current = next;
            gProf.toFront?.();
            return buildSpecDots(next);
          },
        },
      ]),
    ];
  }, [
    spectrum$,
    profileSpectrum$,
    gr$,
    buildSpecDots,
    buildGrDots,
    paintOutSibling,
    disposeBindings,
  ]);

  useEffect(() => {
    const gIn = graphsRef.current[0];
    const gOut = graphsRef.current[1];
    const gGr = graphsRef.current[2];
    const gProf = graphsRef.current[3];
    if (!gIn || !gOut || !gGr || !gProf) return;
    gIn.set('dots', buildSpecDots(spectrumLatest.current));
    gOut.set('dots', buildOutDots(spectrumLatest.current, grLatest.current));
    gGr.set('dots', buildGrDots(grLatest.current));
    gProf.set('dots', buildSpecDots(profileLatest.current));
    gGr.toFront?.();
    gProf.toFront?.();
    reassertRef.current();
  }, [spectrumTilt, buildSpecDots, buildOutDots, buildGrDots]);

  const detach = useCallback(() => {
    resizeRoRef.current?.disconnect();
    resizeRoRef.current = null;
    disposeBindings();
    const c = chartRef.current;
    const graphs = graphsRef.current;
    graphsRef.current = [];
    chartRef.current = null;
    setChart(null);
    setChartSvg(null);
    if (!c || c.isDestructed?.()) return;
    for (const g of graphs) c.removeGraph(g);
  }, [disposeBindings]);

  const attach = useCallback(
    (inst: AuxChartInstance) => {
      chartRef.current = inst;
      setChart(inst);
      if (inst.isDestructed?.()) return;

      inst.set('range_x', { min: F_MIN, max: F_MAX, scale: 'frequency' });
      inst.set('range_y', { min: DENOISER_DB_MIN, max: DENOISER_DB_MAX });
      inst.set('grid_x', buildFreqGridX());
      inst.set('grid_y', DENOISER_DB_GRID);

      if (graphsRef.current.length === 0) {
        const gIn = inst.addGraph({
          dots: null,
          type: 'L',
          mode: 'bottom',
          class: 'denoiser-in',
        });
        addGraphClasses(
          gIn.element,
          'denoiser-in',
          'fill-gradient fill-full stroke-none',
        );
        const gOut = inst.addGraph({
          dots: null,
          type: 'L',
          mode: 'bottom',
          class: 'denoiser-out',
        });
        addGraphClasses(
          gOut.element,
          'denoiser-out',
          'fill-background fill-semi stroke-none',
        );
        const gGr = inst.addGraph({
          dots: null,
          type: 'L',
          mode: 'line',
          class: 'denoiser-gr',
        });
        addGraphClasses(
          gGr.element,
          'denoiser-gr',
          'fill-none stroke-color stroke-thick',
        );
        const gProf = inst.addGraph({
          dots: null,
          type: 'L',
          mode: 'line',
          class: 'denoiser-prof',
        });
        addGraphClasses(
          gProf.element,
          'denoiser-prof',
          'fill-none stroke-color stroke-thinner stroke-semi',
        );
        graphsRef.current = [gIn, gOut, gGr, gProf];
      }

      setChartSvg(inst.svg ?? null);
      attachBindings();

      if (!resizeRoRef.current) {
        const el = inst.element ?? inst.svg;
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
      }
    },
    [attachBindings, sendVizBins],
  );

  useEffect(() => {
    const inst = chart;
    if (!inst || inst.isDestructed?.()) return;
    for (const h of handles) inst.addHandle?.(h);
    for (const g of eqGraphs) {
      (
        inst as AuxChartInstance & { addGraph: (g: unknown) => unknown }
      ).addGraph(g);
      addGraphClasses(
        (g as AuxGraph).element,
        'denoiser-band-eq',
        'fill-none stroke-gradient stroke-dashed stroke-thicker',
      );
    }
    return () => {
      if (inst.isDestructed?.()) return;
      for (const g of eqGraphs) {
        try {
          inst.removeGraph(g as unknown as AuxGraph);
        } catch {
          /* already gone */
        }
      }
      for (const h of handles) inst.removeHandle?.(h);
    };
  }, [chart, handles, eqGraphs]);

  const widgetRef = useCallback(
    (w: AuxChartInstance | null) => {
      if (!w) {
        detach();
        return;
      }
      attach(w);
    },
    [attach, detach],
  );

  return (
    <div className={`DenoiserChart${className ? ` ${className}` : ''}`}>
      <ChartWidget
        widgetRef={widgetRef}
        className="denoiser-chart-aux"
        options={{
          auto_size: true,
          show_grid: true,
          show_labels: true,
        }}
      />
    </div>
  );
}
