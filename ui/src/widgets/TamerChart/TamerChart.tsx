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
import { useChartGradient } from '../../hooks/useChartGradient';
import {
  tamerAuxHpType,
  tamerAuxLpType,
  tamerSlopeDbFromPlain,
} from '../../host/tamerHost';
import {
  SPECTRUM_DB_MAX,
  SPECTRUM_DB_MIN,
  binToHz,
  smoothSeriesY,
  spectrumPxPerBin,
  tiltDb,
} from '../SpectrumChart/SpectrumChart';
import './TamerChart.scss';

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
/** GR / Depth viz axis. */
export const TAMER_DB_MIN = -24;
export const TAMER_DB_MAX = 0;
export const TAMER_VIZ_ID = 'tamer';
const SPECTRUM_VIZ_ID = 'fft';
const SEARCH_Q = 0.707;

const EMPTY: number[] = [];

export type TamerChartEdit = {
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
    TAMER_DB_MIN + Math.min(1, Math.max(0, t)) * (TAMER_DB_MAX - TAMER_DB_MIN)
  );
}

function parseSpectrum(v: number[]): { bins: number; avg: Float32Array } {
  const bins = Math.max(1, Math.min(256, Math.round(v[0] ?? 0)));
  const avg = new Float32Array(bins);
  for (let i = 0; i < bins; ++i) avg[i] = v[2 + i] ?? SPECTRUM_DB_MIN;
  return { bins, avg };
}

function parseGr(v: number[]): { bins: number; gr: Float32Array } {
  const bins = Math.max(1, Math.min(512, Math.round(v[0] ?? 0)));
  const gr = new Float32Array(bins);
  for (let i = 0; i < bins; ++i) gr[i] = v[1 + i] ?? 0;
  return { bins, gr };
}

function formatFreq(hz: number): string {
  if (!(hz > 0) || !Number.isFinite(hz)) return '—';
  if (hz >= 1000) return `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)} kHz`;
  return `${Math.round(hz)} Hz`;
}

/** Same decade marks as AUX Equalizer / SpectrumChart (Hz positions). */
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

/** EQ-style: major dB lines every 6 dB (Tamer Y is −24…0). */
function buildDbGridY() {
  const lines: { pos: number; label?: string; class?: string }[] = [];
  for (let db = TAMER_DB_MIN; db <= TAMER_DB_MAX; db += 6) {
    lines.push({
      pos: db,
      label: `${db}`,
      class: 'major',
    });
  }
  return lines;
}

export interface TamerChartProps {
  spectrum$: DynamicValue<number[]>;
  gr$: DynamicValue<number[]>;
  /** 0 Linear / 1 −3 / 2 −4.5 */
  spectrumTilt: number;
  fLo$: DynamicValue<number>;
  fHi$: DynamicValue<number>;
  hpSlope$: DynamicValue<number>;
  lpSlope$: DynamicValue<number>;
  fLoEdit?: TamerChartEdit;
  fHiEdit?: TamerChartEdit;
  className?: string;
}

/**
 * Input spectrum (blue) + out spectrum (white, UI = in+GR) + GR curve
 * (reverse level gradient). Search HP/LP as EqBand block handles + white
 * EqualizerGraph overlay (detection filter shape).
 */
export function TamerChart(props: TamerChartProps) {
  const {
    spectrum$,
    gr$,
    spectrumTilt,
    fLo$,
    fHi$,
    hpSlope$,
    lpSlope$,
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
  const chartWidthRef = useRef(128);
  const spectrumLatest = useRef<number[]>(EMPTY);
  const grLatest = useRef<number[]>(EMPTY);
  tiltRef.current = spectrumTilt;

  const [chart, setChart] = useState<AuxChartInstance | null>(null);
  const [chartSvg, setChartSvg] = useState<SVGSVGElement | null>(null);
  const [gradTargets, setGradTargets] = useState<SVGElement[]>([]);

  // Keep lo < hi while dragging either edge (only these limits change).
  const loMax$ = useMemo(() => DynamicValue.fromConstant(F_MAX), []);
  const hiMin$ = useMemo(() => DynamicValue.fromConstant(F_MIN), []);
  // Slope → EqBand filter factory (EQ curve). Gain/Q stay as static options;
  // mode is also bound (see handleBindings) because AUX can overwrite it.
  const hpType$ = useMemo(
    () =>
      DynamicValue.fromConstant(
        tamerAuxHpType(tamerSlopeDbFromPlain(hpSlope$.value ?? 2)),
      ),
    [hpSlope$],
  );
  const lpType$ = useMemo(
    () =>
      DynamicValue.fromConstant(
        tamerAuxLpType(tamerSlopeDbFromPlain(lpSlope$.value ?? 2)),
      ),
    [lpSlope$],
  );

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

  useEffect(() => {
    const syncHp = () =>
      hpType$.set(tamerAuxHpType(tamerSlopeDbFromPlain(hpSlope$.value ?? 2)));
    const syncLp = () =>
      lpType$.set(tamerAuxLpType(tamerSlopeDbFromPlain(lpSlope$.value ?? 2)));
    syncHp();
    syncLp();
    const u0 = hpSlope$.subscribe(syncHp, false);
    const u1 = lpSlope$.subscribe(syncLp, false);
    return () => {
      u0();
      u1();
    };
  }, [hpSlope$, lpSlope$, hpType$, lpType$]);

  const reassert = useChartGradient({
    svg: chartSvg,
    enabled: true,
    targets: gradTargets,
    paint: 'stroke',
    // Same as HistoryChart GR: top accent blue → bottom warn pink.
    reverse: true,
  });
  const reassertRef = useRef(reassert);
  reassertRef.current = reassert;

  const sendVizBins = useCallback((el: Element) => {
    const width = Math.round(el.getBoundingClientRect().width);
    chartWidthRef.current = Math.max(1, width);
    const next = Math.max(32, Math.min(256, width));
    postToHost({ t: 'vizcfg', id: SPECTRUM_VIZ_ID, bins: next });
    postToHost({ t: 'vizcfg', id: TAMER_VIZ_ID, bins: next });
  }, []);

  // Constant modes: AUX EqBand.initialize defaults type to string "parametric",
  // which forces mode→circular, then "restores" via this.get('mode') (already
  // circular). Seed a function type so that path is skipped; bind mode after
  // type like EQChart so any later string type cannot stick circular.
  const hpMode$ = useMemo(
    () => DynamicValue.fromConstant('block-left'),
    [],
  );
  const lpMode$ = useMemo(
    () => DynamicValue.fromConstant('block-right'),
    [],
  );

  const handleOptions = useMemo(
    () => [
      {
        mode: 'block-left',
        // Function type at create — avoids AUX string type_to_mode overwrite.
        type: tamerAuxHpType(tamerSlopeDbFromPlain(hpSlope$.value ?? 2)),
        class: 'tamer-search-lo',
        label: 'Low',
        format_label: (_l: string, x: number) => formatFreq(x),
        preferences: ['right', 'left'],
        gain: 0,
        q: SEARCH_Q,
        active: true,
        y_min: TAMER_DB_MIN,
        y_max: TAMER_DB_MAX,
        freq: fLo$.value ?? 200,
        x_min: F_MIN,
        x_max: F_MAX,
        show_axis: false,
        min_size: 16,
        max_size: 48,
      },
      {
        mode: 'block-right',
        type: tamerAuxLpType(tamerSlopeDbFromPlain(lpSlope$.value ?? 2)),
        class: 'tamer-search-hi',
        label: 'High',
        format_label: (_l: string, x: number) => formatFreq(x),
        preferences: ['left', 'right'],
        gain: 0,
        q: SEARCH_Q,
        active: true,
        y_min: TAMER_DB_MIN,
        y_max: TAMER_DB_MAX,
        freq: fHi$.value ?? 5000,
        x_min: F_MIN,
        x_max: F_MAX,
        show_axis: false,
        min_size: 16,
        max_size: 48,
      },
    ],
    // Create-time type only (bindings update slope); do not remount on slope.
    [fLo$, fHi$],
  );

  const handleBindings = useMemo(
    () => [
      [
        { name: 'freq', backendValue: fLo$ },
        { name: 'x_max', backendValue: loMax$, readonly: true },
        { name: 'type', backendValue: hpType$, readonly: true },
        { name: 'mode', backendValue: hpMode$, readonly: true },
      ],
      [
        { name: 'freq', backendValue: fHi$ },
        { name: 'x_min', backendValue: hiMin$, readonly: true },
        { name: 'type', backendValue: lpType$, readonly: true },
        { name: 'mode', backendValue: lpMode$, readonly: true },
      ],
    ],
    [fLo$, fHi$, loMax$, hiMin$, hpType$, lpType$, hpMode$, lpMode$],
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
        class: 'tamer-search-eq',
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
  }, [eqGraphs, handles, hpType$, lpType$]);

  const buildSpecDots = useCallback(
    (raw: number[]): { x: number; y: number }[] | null => {
      if (raw.length < 2) return null;
      const slope = spectrumSlope(tiltRef.current);
      const { bins: sb, avg } = parseSpectrum(raw);
      binsRef.current = sb;
      const ys: number[] = [];
      const hz: number[] = [];
      for (let i = 0; i < sb; ++i) {
        const f = binToHz(i, sb);
        hz.push(f);
        ys.push(spectrumToGrY(tiltDb(avg[i] ?? SPECTRUM_DB_MIN, f, slope)));
      }
      const smoothed = smoothSeriesY(
        ys,
        hz,
        spectrumPxPerBin(chartWidthRef.current, sb),
      );
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < smoothed.length; ++i)
        pts.push({ x: hz[i]!, y: smoothed[i]! });
      return pts.length ? pts : null;
    },
    [],
  );

  /**
   * Out spectrum in the UI — no second FFT. Apply GR in *chart* Y-space so a
   * −12 dB GR moves the white curve down by 12 on the −24…0 axis (same scale
   * as the GR line). Remapping `in_dBFS + GR` through spectrumToGrY would
   * shrink the gap by ~4× (analyzer −96…0 squeezed onto −24…0).
   */
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
        const outY = Math.min(TAMER_DB_MAX, Math.max(TAMER_DB_MIN, inY + g));
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
      return pts.length ? pts : null;
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
        ys.push(Math.min(TAMER_DB_MAX, Math.max(TAMER_DB_MIN, gr[i] ?? 0)));
      }
      const smoothed = smoothSeriesY(
        ys,
        hz,
        spectrumPxPerBin(chartWidthRef.current, gb),
      );
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i < smoothed.length; ++i)
        pts.push({ x: hz[i]!, y: smoothed[i]! });
      return pts.length ? pts : null;
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
    if (!gIn || !gOut || !gGr) return;

    // SpectrumChart pattern: Binding returns dots for the bound graph;
    // siblings (out) are updated via set() inside transformReceive.
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
            reassertRef.current();
            return buildGrDots(next);
          },
        },
      ]),
    ];
  }, [
    spectrum$,
    gr$,
    buildSpecDots,
    buildGrDots,
    paintOutSibling,
    disposeBindings,
  ]);

  // Rare: tilt change — re-apply last buffers (Binding does not re-fire).
  useEffect(() => {
    const gIn = graphsRef.current[0];
    const gOut = graphsRef.current[1];
    const gGr = graphsRef.current[2];
    if (!gIn || !gOut || !gGr) return;
    gIn.set('dots', buildSpecDots(spectrumLatest.current));
    gOut.set('dots', buildOutDots(spectrumLatest.current, grLatest.current));
    gGr.set('dots', buildGrDots(grLatest.current));
    gGr.toFront?.();
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
    setGradTargets([]);
    if (!c || c.isDestructed?.()) return;
    for (const g of graphs) c.removeGraph(g);
  }, [disposeBindings]);

  const attach = useCallback(
    (inst: AuxChartInstance) => {
      chartRef.current = inst;
      setChart(inst);
      if (inst.isDestructed?.()) return;

      inst.set('range_x', { min: F_MIN, max: F_MAX, scale: 'frequency' });
      inst.set('range_y', { min: TAMER_DB_MIN, max: TAMER_DB_MAX });
      inst.set('grid_x', buildFreqGridX());
      inst.set('grid_y', buildDbGridY());

      if (graphsRef.current.length === 0) {
        // Paint order: input (back) → out → GR (front). Styles match
        // Compressor HistoryChart hist-audio / hist-audio-filtered / hist-gr.
        const gIn = inst.addGraph({
          dots: null,
          type: 'L',
          mode: 'bottom',
          class: 'tamer-in',
        });
        gIn.element?.classList.add('tamer-in');
        const gOut = inst.addGraph({
          dots: null,
          type: 'L',
          mode: 'bottom',
          class: 'tamer-out',
        });
        gOut.element?.classList.add('tamer-out');
        const gGr = inst.addGraph({
          dots: null,
          type: 'L',
          mode: 'line',
          class: 'tamer-gr',
        });
        gGr.element?.classList.add('tamer-gr');
        graphsRef.current = [gIn, gOut, gGr];
        setGradTargets(gGr.element ? [gGr.element as SVGElement] : []);
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
      (g as AuxGraph).element?.classList.add('tamer-search-eq');
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
    <div className={`TamerChart${className ? ` ${className}` : ''}`}>
      <ChartWidget
        widgetRef={widgetRef}
        className="tamer-chart-aux"
        options={{
          auto_size: true,
          show_grid: true,
          show_labels: true,
        }}
      />
    </div>
  );
}
