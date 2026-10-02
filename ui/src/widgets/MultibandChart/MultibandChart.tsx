import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChartHandle as AuxChartHandle,
  Equalizer as AuxEqualizer,
  EqBand as AuxEqBand,
  EqualizerGraph as AuxEqualizerGraph,
} from '@deutschesoft/aux-widgets/src/index.pure.js';
import {
  componentFromWidget,
  useWidgetsWithBindingsAndEvents,
} from '@deutschesoft/use-aux-widgets';
import { DynamicValue, ListValue } from '@deutschesoft/awml';
import type { Bindings } from '@deutschesoft/awml/src/bindings.js';
import {
  auxHighpassGain24,
  auxHighpassGain48,
  auxHighpassGain96,
  auxLowpassGain24,
  auxLowpassGain48,
  auxLowpassGain96,
} from '../../dsp/eqFilters';
import { useChartGradient } from '../../hooks/useChartGradient';
import { bindAuxOptions } from '../../utils/aux_bindings';
import { postToHost } from '../../utils/bridge';
import {
  SPECTRUM_MIN_BINS,
  spectrumScaleSlope,
} from '../SpectrumChart/SpectrumChart';
import {
  spectrumOverlayLayers,
  type SpectrumOverlayAxis,
} from '../../utils/spectrumDiffOverlay';
import { addGraphClasses, GRAPH_STYLE } from '../../styles/graphStyles';
import type { EditGesture } from '../editGesture';
import './MultibandChart.scss';

export const MB_MAX_BANDS = 6;
export const MB_FREQ_MIN = 20;
export const MB_FREQ_MAX = 20000;
/** Shared with the threshold handles — GR curves hang below 0 dB. */
export const MB_GAIN_MIN = -60;
export const MB_GAIN_MAX = 0;
/** Linkwitz-Riley crossovers are Butterworth cascades. */
const MB_XOVER_Q = 0.707;

const MB_SPECTRUM_AXIS = {
  fMin: MB_FREQ_MIN,
  fMax: MB_FREQ_MAX,
  yMin: MB_GAIN_MIN,
  yMax: MB_GAIN_MAX,
} as const;

const EqualizerBindings = {};

const EqualizerOptions = {
  auto_size: true,
  range_x: { min: MB_FREQ_MIN, max: MB_FREQ_MAX },
  range_y: { min: MB_GAIN_MIN, max: MB_GAIN_MAX },
  range_z: { min: 0.1, max: 20, step: 0.1 },
  db_grid: 12,
};

const EqualizerWidget = componentFromWidget(
  AuxEqualizer,
  EqualizerBindings,
  EqualizerOptions,
  'MultibandChart',
);

type AuxType = (O: unknown) => unknown;

function lowpassType(slopeDb: number): AuxType {
  if (slopeDb >= 72) return auxLowpassGain96 as AuxType;
  if (slopeDb >= 36) return auxLowpassGain48 as AuxType;
  return auxLowpassGain24 as AuxType;
}

function highpassType(slopeDb: number): AuxType {
  if (slopeDb >= 72) return auxHighpassGain96 as AuxType;
  if (slopeDb >= 36) return auxHighpassGain48 as AuxType;
  return auxHighpassGain24 as AuxType;
}

function formatFreq(hz: number): string {
  if (!Number.isFinite(hz)) return '';
  return hz >= 1000
    ? `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)} kHz`
    : `${Math.round(hz)} Hz`;
}

/** DSP sends ≤0 dB; host models may already carry positive meter amounts. */
function grToGainDb(v: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  const db = v > 0 ? -v : v;
  return Math.max(MB_GAIN_MIN, Math.min(MB_GAIN_MAX, db));
}

export interface MultibandChartProps {
  /** Active band count 2…6 (crossovers = bandCount − 1). */
  bandCount: number;
  slope$: DynamicValue<number>;
  /**
   * Per-band threshold models for circular ChartHandles.
   * Optional when `showThresholds` is false (GR curves + xovers only).
   */
  threshold$?: DynamicValue<number>[];
  /** Gain reduction per band (positive amount or ≤0 dB). */
  gr$: DynamicValue<number>[];
  xover$: DynamicValue<number>[];
  /** Per-band bypass — dims the curve stroke when true. */
  bypass$?: DynamicValue<boolean>[];
  /** Per-band listen/solo — warn color on threshold handles and band curves. */
  listen$?: DynamicValue<boolean>[];
  selectedBand?: number;
  onSelectBand?: (index: number) => void;
  thresholdEdit?: (index: number) => EditGesture;
  xoverEdit?: (index: number) => EditGesture;
  /** When false, omit threshold ChartHandles (still show GR curves + xovers). */
  showThresholds?: boolean;
  /** Pre-dynamics spectrum payload (fft_in). */
  spectrumIn$?: DynamicValue<number[]>;
  /** Post-dynamics spectrum payload (fft_out). */
  spectrumOut$?: DynamicValue<number[]>;
  /**
   * Analyzer-style display tilt (0 Linear / 1 −3 / 2 −4.5 dB/oct).
   * When omitted, spectrum overlay stays linear.
   */
  spectrumScale$?: DynamicValue<number>;
  className?: string;
}

type AuxRange = {
  get: (key: string) => number;
  pixelToValue: (px: number) => number;
  valueToPixel: (v: number) => number;
};

type AuxWidget = {
  element: Element;
  set?: (key: string, value: unknown) => void;
  options?: {
    mode?: string;
    accuracy?: number;
    oversampling?: number;
    threshold?: number;
  };
  drawPath?: () => unknown;
  invalidate?: (key: string) => void;
  range_x?: AuxRange;
  range_y?: AuxRange;
  getFilterFunctions?: () => Array<(f: number) => number>;
  __mbDotsPatched?: boolean;
};

type AuxEqualizerInstance = {
  isDestructed: () => boolean;
  addGraph: (graph: unknown) => unknown;
  removeGraph: (graph: unknown) => void;
  addHandle: (handle: unknown) => unknown;
  removeHandle: (handle: unknown) => void;
  subscribe: (event: string, cb: (...args: unknown[]) => void) => () => void;
  baseline: { set: (key: string, value: unknown) => void };
  svg?: SVGSVGElement;
  range_y?: { options?: { basis?: number } };
};

/**
 * EqualizerGraph.drawPath emits a pixel SVG *string*, which bypasses Graph's
 * mode=_start/_end (see https://docs.deuso.de/AUX/Graph.html). Replace it with
 * value-space `{x,y}[]` so `mode: "bottom"` fills under the curve. Sample a few
 * px past the plot edges (AUX uses ±10) so closing strokes stay off-canvas.
 */
function installEqualizerGraphValueDots(graph: AuxWidget) {
  if (graph.__mbDotsPatched) return;
  graph.__mbDotsPatched = true;

  graph.drawPath = function drawValueDots(this: AuxWidget) {
    const rangeX = this.range_x;
    const rangeY = this.range_y;
    const filters = this.getFilterFunctions?.() ?? [];
    if (!rangeX || !rangeY || filters.length === 0) return [];

    const end = rangeX.get('basis') | 0;
    const step = Math.max(1, this.options?.accuracy ?? 1);
    const over = Math.max(1, this.options?.oversampling ?? 1);
    const thres = this.options?.threshold ?? 5;
    const dots: { x: number; y: number }[] = [];

    const gainAt = (f: number) => {
      let y = 0;
      for (const fn of filters) y += fn(f);
      if (!Number.isFinite(y)) return MB_GAIN_MIN - 6;
      // Allow a little below chart min so stopband + fill closure sit off-canvas.
      return Math.max(MB_GAIN_MIN - 6, Math.min(MB_GAIN_MAX + 6, y));
    };

    const pushAtPx = (px: number) => {
      const f = rangeX.pixelToValue(px);
      dots.push({ x: f, y: gainAt(f) });
    };

    pushAtPx(-10);
    let prevYpx = rangeY.valueToPixel(dots[0]!.y);
    let pursue = false;

    for (let px = 0; px <= end; px += step) {
      if (px > 0 && over > 1) {
        const f = rangeX.pixelToValue(px);
        const yPx = rangeY.valueToPixel(gainAt(f));
        const diff = Math.abs(yPx - prevYpx) >= thres;
        if (diff || pursue) {
          pursue = !!diff;
          for (let k = 1; k < over; k++) {
            const spx = px - step + (step / over) * k;
            pushAtPx(spx);
          }
        }
      }
      pushAtPx(px);
      prevYpx = rangeY.valueToPixel(dots[dots.length - 1]!.y);
    }
    pushAtPx(end + 10);
    return dots;
  };
}

/**
 * AUX Equalizer showing the crossover bands of a multiband dynamics stage.
 * Each band is a HP/LP pair whose dB offset is the band's gain reduction;
 * vertical handles drag the crossovers, one circular handle per band drags
 * its threshold.
 */
export function MultibandChart(props: MultibandChartProps) {
  const {
    bandCount,
    slope$,
    threshold$,
    gr$,
    xover$,
    bypass$,
    listen$,
    selectedBand,
    onSelectBand,
    thresholdEdit,
    xoverEdit,
    showThresholds = true,
    spectrumIn$,
    spectrumOut$,
    spectrumScale$,
    className,
  } = props;

  const [eqWidget, setEqWidget] = useState<AuxEqualizerInstance | null>(null);
  const spectrumOuterRef = useRef<{
    set: (k: string, v: unknown) => void;
    element?: SVGElement;
    toFront?: () => void;
  } | null>(null);
  const spectrumMaskRef = useRef<{
    set: (k: string, v: unknown) => void;
    element?: SVGElement;
    toFront?: () => void;
  } | null>(null);
  const spectrumEdgeRef = useRef<{
    set: (k: string, v: unknown) => void;
    element?: SVGElement;
    toFront?: () => void;
  } | null>(null);
  const spectrumBindRef = useRef<Bindings | null>(null);
  const spectrumWidthRef = useRef(0);
  const spectrumResizeRoRef = useRef<ResizeObserver | null>(null);
  const bands = Math.max(2, Math.min(MB_MAX_BANDS, Math.round(bandCount)));
  const xoverCount = MB_MAX_BANDS - 1;

  // Derived models — created once, kept in sync by the effects below.
  const derived = useMemo(() => {
    const num = (v: number) => DynamicValue.fromConstant(v);
    const bool = (v: boolean) => DynamicValue.fromConstant(v);
    return {
      q$: num(MB_XOVER_Q),
      zeroGain$: num(0),
      freqMin$: num(MB_FREQ_MIN),
      freqMax$: num(MB_FREQ_MAX),
      lpType$: DynamicValue.fromConstant<AuxType>(lowpassType(slope$.value)),
      hpType$: DynamicValue.fromConstant<AuxType>(highpassType(slope$.value)),
      gain$: Array.from({ length: MB_MAX_BANDS }, () => num(0)),
      bandActive$: Array.from({ length: MB_MAX_BANDS }, () => bool(false)),
      lpActive$: Array.from({ length: MB_MAX_BANDS }, () => bool(false)),
      hpActive$: Array.from({ length: MB_MAX_BANDS }, () => bool(false)),
      center$: Array.from({ length: MB_MAX_BANDS }, () => num(MB_FREQ_MIN)),
      loEdge$: Array.from({ length: MB_MAX_BANDS }, () => num(MB_FREQ_MIN)),
      hiEdge$: Array.from({ length: MB_MAX_BANDS }, () => num(MB_FREQ_MAX)),
      xoverActive$: Array.from({ length: xoverCount }, () => bool(false)),
      xoverMin$: Array.from({ length: xoverCount }, () => num(MB_FREQ_MIN)),
      xoverMax$: Array.from({ length: xoverCount }, () => num(MB_FREQ_MAX)),
      bypassed$: Array.from({ length: MB_MAX_BANDS }, () => bool(false)),
    };
  }, [slope$, xoverCount]);

  useEffect(() => {
    const sync = () => {
      const slope = slope$.value;
      derived.lpType$.set(lowpassType(slope));
      derived.hpType$.set(highpassType(slope));
    };
    sync();
    return slope$.subscribe(sync, false);
  }, [derived, slope$]);

  useEffect(() => {
    const unsubs = gr$.map((dv, i) =>
      dv.subscribe((v) => {
        const next = grToGainDb(v);
        const gain$ = derived.gain$[i];
        if (gain$ && gain$.value !== next) gain$.set(next);
      }, true),
    );
    return () => unsubs.forEach((u) => u());
  }, [derived, gr$]);

  useEffect(() => {
    if (!bypass$) return;
    const unsubs = bypass$.map((dv, i) =>
      dv.subscribe((v) => derived.bypassed$[i]?.set(!!v), true),
    );
    return () => unsubs.forEach((u) => u());
  }, [bypass$, derived]);

  useEffect(() => {
    const xoverAt = (i: number) => {
      const v = xover$[i]?.value;
      return typeof v === 'number' && Number.isFinite(v) ? v : MB_FREQ_MAX;
    };

    const sync = () => {
      for (let b = 0; b < MB_MAX_BANDS; ++b) {
        const active = b < bands;
        const lo = b === 0 ? MB_FREQ_MIN : xoverAt(b - 1);
        const hi = b >= bands - 1 ? MB_FREQ_MAX : xoverAt(b);
        derived.bandActive$[b]?.set(active);
        derived.lpActive$[b]?.set(active && b < bands - 1);
        derived.hpActive$[b]?.set(active && b > 0);
        derived.loEdge$[b]?.set(lo);
        derived.hiEdge$[b]?.set(hi);
        derived.center$[b]?.set(Math.sqrt(Math.max(1, lo) * Math.max(1, hi)));
      }
      for (let i = 0; i < xoverCount; ++i) {
        derived.xoverActive$[i]?.set(i < bands - 1);
        derived.xoverMin$[i]?.set(i === 0 ? MB_FREQ_MIN : xoverAt(i - 1));
        derived.xoverMax$[i]?.set(
          i >= bands - 2 ? MB_FREQ_MAX : xoverAt(i + 1),
        );
      }
    };

    sync();
    const unsubs = xover$.map((dv) => dv.subscribe(sync, false));
    return () => unsubs.forEach((u) => u());
  }, [bands, derived, xover$, xoverCount]);

  const shapeOptions = useMemo(
    () =>
      Array.from({ length: MB_MAX_BANDS * 2 }, (_, i) => {
        const band = i % MB_MAX_BANDS;
        const isLow = i < MB_MAX_BANDS;
        return {
          label: '',
          format_label: false as const,
          show_handle: false,
          class: `mb-shape mb-band-${band} ${isLow ? 'mb-lp' : 'mb-hp'}`,
          y_min: MB_GAIN_MIN,
          y_max: MB_GAIN_MAX,
          show_axis: false,
        };
      }),
    [],
  );

  const shapeBindings = useMemo(
    () =>
      Array.from({ length: MB_MAX_BANDS * 2 }, (_, i) => {
        const band = i % MB_MAX_BANDS;
        const isLow = i < MB_MAX_BANDS;
        // Band 0 has no low edge, so its LP carries the GR offset; every other
        // band offsets its HP and leaves the LP flat (offsets must not double).
        const freq$ = isLow
          ? (xover$[band] ?? derived.freqMax$)
          : (xover$[band - 1] ?? derived.freqMin$);
        const gain$ =
          isLow && band > 0 ? derived.zeroGain$ : derived.gain$[band]!;
        return [
          { name: 'freq', backendValue: freq$, readonly: true },
          { name: 'gain', backendValue: gain$, readonly: true },
          { name: 'q', backendValue: derived.q$, readonly: true },
          {
            name: 'type',
            backendValue: isLow ? derived.lpType$ : derived.hpType$,
            readonly: true,
          },
          {
            name: 'active',
            backendValue: isLow
              ? derived.lpActive$[band]!
              : derived.hpActive$[band]!,
            readonly: true,
          },
        ];
      }),
    [derived, xover$],
  );

  const shapes = useWidgetsWithBindingsAndEvents(
    AuxEqBand,
    shapeOptions,
    shapeBindings,
  );

  const graphOptions = useMemo(
    () =>
      Array.from({ length: MB_MAX_BANDS }, (_, b) => ({
        bands: [shapes[b], shapes[b + MB_MAX_BANDS]].filter(Boolean),
        // Selected band uses bottom fill; others stay stroke-only.
        mode: b === selectedBand ? 'bottom' : 'line',
        class: `mb-curve mb-band-${b} fill-none stroke-gradient`,
        accuracy: 2,
        oversampling: 2,
        threshold: 4,
      })),
    [selectedBand, shapes],
  );

  const graphBindings = useMemo(
    () =>
      Array.from({ length: MB_MAX_BANDS }, (_, b) => [
        {
          name: 'active',
          backendValue: derived.bandActive$[b]!,
          readonly: true,
        },
      ]),
    [derived],
  );

  const graphs = useWidgetsWithBindingsAndEvents(
    AuxEqualizerGraph,
    graphOptions,
    graphBindings,
  );

  // Value-space dots so Graph mode=bottom/_start/_end run (string paths skip them).
  useEffect(() => {
    for (const graph of graphs) {
      const g = graph as AuxWidget;
      installEqualizerGraphValueDots(g);
      g.invalidate?.('bands');
    }
  }, [graphs]);

  const xoverOptions = useMemo(
    () =>
      Array.from({ length: xoverCount }, (_, i) => ({
        mode: 'line-vertical',
        class: `mb-xover mb-xover-${i}`,
        label: '',
        format_label: (_label: string, x: number) => formatFreq(x),
        preferences: ['top', 'bottom'],
        y: MB_GAIN_MIN,
        z: MB_XOVER_Q,
        min_size: 20,
        max_size: 20,
        y_min: MB_GAIN_MIN,
        y_max: MB_GAIN_MAX,
        show_axis: false,
      })),
    [xoverCount],
  );

  const xoverBindings = useMemo(
    () =>
      Array.from({ length: xoverCount }, (_, i) => [
        { name: 'x', backendValue: xover$[i] ?? derived.freqMax$ },
        { name: 'x_min', backendValue: derived.xoverMin$[i]!, readonly: true },
        { name: 'x_max', backendValue: derived.xoverMax$[i]!, readonly: true },
        {
          name: 'active',
          backendValue: derived.xoverActive$[i]!,
          readonly: true,
        },
      ]),
    [derived, xover$, xoverCount],
  );

  const xoverEvents = useMemo(
    () =>
      Array.from({ length: xoverCount }, (_, i) => {
        const gesture = xoverEdit?.(i);
        if (!gesture) return null;
        return {
          set_interacting: (on: unknown) => {
            if (on) gesture.beginEdit?.();
            else gesture.endEdit?.();
          },
        };
      }),
    [xoverCount, xoverEdit],
  );

  const xoverHandles = useWidgetsWithBindingsAndEvents(
    AuxChartHandle,
    xoverOptions,
    xoverBindings,
    xoverEvents,
  );

  const threshOptions = useMemo(
    () =>
      showThresholds
        ? Array.from({ length: MB_MAX_BANDS }, (_, b) => ({
            mode: 'block-bottom',
            class: `mb-thresh mb-band-${b}`,
            label: 'Band ' + String(b + 1),
            format_label: (label: string, _x: number, y: number) =>
              `${label}\n${y.toFixed(1)} dB`,
            preferences: ['top'],
            z: MB_XOVER_Q,
            y_min: MB_GAIN_MIN,
            y_max: MB_GAIN_MAX,
            min_size: 0,
            show_axis: false,
          }))
        : [],
    [showThresholds],
  );

  const threshBindings = useMemo(
    () =>
      showThresholds
        ? Array.from({ length: MB_MAX_BANDS }, (_, b) => [
            {
              name: 'y',
              backendValue: threshold$?.[b] ?? derived.zeroGain$,
            },
            { name: 'x', backendValue: derived.center$[b]!, readonly: true },
            {
              name: 'x_min',
              backendValue: derived.loEdge$[b]!,
              readonly: true,
            },
            {
              name: 'x_max',
              backendValue: derived.hiEdge$[b]!,
              readonly: true,
            },
            {
              name: 'active',
              backendValue: derived.bandActive$[b]!,
              readonly: true,
            },
          ])
        : [],
    [derived, showThresholds, threshold$],
  );

  const threshEvents = useMemo(
    () =>
      showThresholds
        ? Array.from({ length: MB_MAX_BANDS }, (_, b) => {
            const gesture = thresholdEdit?.(b);
            if (!gesture && !onSelectBand) return null;
            return {
              set_interacting: (on: unknown) => {
                if (on) gesture?.beginEdit?.();
                else gesture?.endEdit?.();
              },
              ...(onSelectBand ? { handlegrabbed: () => onSelectBand(b) } : {}),
            };
          })
        : [],
    [onSelectBand, showThresholds, thresholdEdit],
  );

  const threshHandles = useWidgetsWithBindingsAndEvents(
    AuxChartHandle,
    threshOptions,
    threshBindings,
    threshEvents,
  );

  // Individual band curves only — EqBands live on the graphs, not as Equalizer
  // children (that would spawn circular handles + baseline membership).
  useEffect(() => {
    const eq = eqWidget;
    if (!eq || eq.isDestructed()) return;
    graphs.forEach((graph) => eq.addGraph(graph));
    return () => {
      if (eq.isDestructed()) return;
      graphs.forEach((graph) => eq.removeGraph(graph));
    };
  }, [eqWidget, graphs]);

  useEffect(() => {
    const eq = eqWidget;
    if (!eq || eq.isDestructed()) return;
    // Keep sum baseline empty (no EqBand children on the Equalizer).
    eq.baseline.set('bands', []);
  }, [eqWidget]);

  useEffect(() => {
    const eq = eqWidget;
    if (!eq || eq.isDestructed()) return;
    const handles = [...xoverHandles, ...threshHandles];
    handles.forEach((handle) => eq.addHandle(handle));
    return () => {
      if (eq.isDestructed()) return;
      handles.forEach((handle) => eq.removeHandle(handle));
    };
  }, [eqWidget, threshHandles, xoverHandles]);

  useEffect(() => {
    const mark = (widgets: unknown[], index: number) => {
      const el = (widgets[index] as AuxWidget | undefined)?.element;
      el?.classList.toggle('mb-selected', index === selectedBand);
    };
    for (let b = 0; b < MB_MAX_BANDS; ++b) {
      const graph = graphs[b] as AuxWidget | undefined;
      mark(graphs, b);
      mark(threshHandles, b);
      const listening = !!listen$?.[b]?.value;
      // mode change re-renders from cached dots[] via Graph (no path rewrite).
      graph?.set?.('mode', b === selectedBand || listening ? 'bottom' : 'line');
      const bypassed = derived.bypassed$[b]?.value ?? false;
      graph?.element?.classList.toggle('mb-bypassed', bypassed);
    }
  }, [derived, graphs, listen$, selectedBand, threshHandles]);

  useEffect(() => {
    if (!bypass$) return;
    const sync = () => {
      for (let b = 0; b < MB_MAX_BANDS; ++b) {
        const el = (graphs[b] as AuxWidget | undefined)?.element;
        el?.classList.toggle(
          'mb-bypassed',
          !!(bypass$[b]?.value ?? derived.bypassed$[b]?.value),
        );
      }
    };
    sync();
    const unsubs = bypass$.map((dv) => dv.subscribe(sync, false));
    return () => unsubs.forEach((u) => u());
  }, [bypass$, derived, graphs]);

  useEffect(() => {
    if (!listen$) return;
    const sync = () => {
      for (let b = 0; b < MB_MAX_BANDS; ++b) {
        const listening = !!listen$[b]?.value;
        const graph = graphs[b] as AuxWidget | undefined;
        graph?.element?.classList.toggle('mb-listen', listening);
        const thresh = (threshHandles[b] as AuxWidget | undefined)?.element;
        thresh?.classList.toggle('mb-listen', listening);
        graph?.set?.(
          'mode',
          b === selectedBand || listening ? 'bottom' : 'line',
        );
      }
    };
    sync();
    const unsubs = listen$.map((dv) => dv.subscribe(sync, false));
    return () => unsubs.forEach((u) => u());
  }, [listen$, graphs, selectedBand, threshHandles]);

  const getEqHeight = useCallback(
    (svg: SVGSVGElement) =>
      eqWidget?.range_y?.options?.basis || svg.clientHeight || 1,
    [eqWidget],
  );

  // Expose --graph-gradient for .stroke-gradient on band curves (no inline
  // stroke — that would override `.mb-selected { stroke: var(--color) }`).
  useChartGradient({
    svg: eqWidget?.svg,
    enabled: !!eqWidget,
    getHeight: getEqHeight,
  });

  const spectrumPair$ = useMemo(() => {
    if (!spectrumIn$ || !spectrumOut$) return null;
    if (spectrumScale$)
      return new ListValue<[number[], number[], number]>([
        spectrumIn$,
        spectrumOut$,
        spectrumScale$,
      ]);
    return new ListValue<[number[], number[]]>([spectrumIn$, spectrumOut$]);
  }, [spectrumIn$, spectrumOut$, spectrumScale$]);

  // In/Out spectrum fills + output edge line (cut above / boost below).
  useEffect(() => {
    if (!eqWidget || !spectrumPair$) return;
    const eq = eqWidget as {
      addGraph: (opts: unknown) => {
        set: (k: string, v: unknown) => void;
        element?: SVGElement;
        toFront?: () => void;
      };
      removeGraph: (g: unknown) => void;
      isDestructed?: () => boolean;
      element?: Element;
      svg?: SVGSVGElement;
    };
    if (eq.isDestructed?.()) return;

    spectrumBindRef.current?.dispose();
    spectrumBindRef.current = null;

    if (!spectrumOuterRef.current) {
      const outer = eq.addGraph({
        dots: null,
        type: 'L',
        mode: 'bottom',
        class: 'mb-spectrum-outer',
      });
      addGraphClasses(
        outer.element,
        'mb-spectrum-outer',
        GRAPH_STYLE.outerDiff,
      );
      spectrumOuterRef.current = outer;
    }
    if (!spectrumMaskRef.current) {
      const mask = eq.addGraph({
        dots: null,
        type: 'L',
        mode: 'bottom',
        class: 'mb-spectrum-mask',
      });
      addGraphClasses(mask.element, 'mb-spectrum-mask', GRAPH_STYLE.maskDiff);
      spectrumMaskRef.current = mask;
    }
    if (!spectrumEdgeRef.current) {
      const edge = eq.addGraph({
        dots: null,
        type: 'L',
        mode: 'line',
        class: 'mb-spectrum-edge',
      });
      addGraphClasses(edge.element, 'mb-spectrum-edge', GRAPH_STYLE.gainEdge);
      spectrumEdgeRef.current = edge;
    }

    // Back→front under band curves: outer → mask → edge.
    const parent = spectrumOuterRef.current.element?.parentElement;
    if (parent) {
      parent.insertBefore(
        spectrumOuterRef.current.element!,
        parent.firstChild,
      );
      parent.insertBefore(
        spectrumMaskRef.current.element!,
        spectrumOuterRef.current.element!.nextSibling,
      );
      parent.insertBefore(
        spectrumEdgeRef.current.element!,
        spectrumMaskRef.current.element!.nextSibling,
      );
    }

    const outer = spectrumOuterRef.current;
    const mask = spectrumMaskRef.current;
    const edge = spectrumEdgeRef.current;
    const axisFor = (scalePlain: number): SpectrumOverlayAxis => ({
      ...MB_SPECTRUM_AXIS,
      slopeDbPerOct: spectrumScaleSlope(scalePlain),
    });
    const bindings = bindAuxOptions(outer, [
      {
        name: 'dots',
        backendValue: spectrumPair$,
        readonly: true,
        transformReceive: (pair: unknown) => {
          const row = (pair as [number[], number[], number?]) ?? [[], []];
          const inn = row[0] ?? [];
          const out = row[1] ?? [];
          const scalePlain = typeof row[2] === 'number' ? row[2] : 0;
          const axis = axisFor(scalePlain);
          const layers = spectrumOverlayLayers(
            inn,
            out,
            axis,
            spectrumWidthRef.current,
          );
          mask.set('dots', layers.mask);
          edge.set('dots', layers.edge);
          return layers.outer;
        },
      },
    ]);
    spectrumBindRef.current = bindings;

    const el = eq.element ?? eq.svg;
    spectrumResizeRoRef.current?.disconnect();
    spectrumResizeRoRef.current = null;
    if (el) {
      const sendBins = () => {
        const width = Math.round(el.getBoundingClientRect().width);
        spectrumWidthRef.current = Math.max(1, width);
        const next = Math.max(
          SPECTRUM_MIN_BINS,
          Math.min(192, width),
        );
        postToHost({ t: 'vizcfg', id: 'fft_in', bins: next });
        postToHost({ t: 'vizcfg', id: 'fft_out', bins: next });
      };
      sendBins();
      let raf = 0;
      const ro = new ResizeObserver(() => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(sendBins);
      });
      ro.observe(el);
      spectrumResizeRoRef.current = ro;
    }

    return () => {
      spectrumBindRef.current?.dispose();
      spectrumBindRef.current = null;
      spectrumResizeRoRef.current?.disconnect();
      spectrumResizeRoRef.current = null;
    };
  }, [eqWidget, spectrumPair$]);

  useEffect(() => {
    return () => {
      const eq = eqWidget as
        | { removeGraph: (g: unknown) => void; isDestructed?: () => boolean }
        | null;
      if (!eq || eq.isDestructed?.()) {
        spectrumOuterRef.current = null;
        spectrumMaskRef.current = null;
        spectrumEdgeRef.current = null;
        return;
      }
      if (spectrumOuterRef.current) {
        eq.removeGraph(spectrumOuterRef.current);
        spectrumOuterRef.current = null;
      }
      if (spectrumMaskRef.current) {
        eq.removeGraph(spectrumMaskRef.current);
        spectrumMaskRef.current = null;
      }
      if (spectrumEdgeRef.current) {
        eq.removeGraph(spectrumEdgeRef.current);
        spectrumEdgeRef.current = null;
      }
    };
  }, [eqWidget]);

  const cls = ['MultibandChart', className ?? ''].filter(Boolean).join(' ');

  return (
    <EqualizerWidget
      widgetRef={setEqWidget}
      className={cls}
      show_grid
      show_handles
    />
  );
}
