import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Equalizer as AuxEqualizer,
  EqBand as AuxEqBand,
  EqualizerGraph as AuxEqualizerGraph,
} from '@deutschesoft/aux-widgets/src/index.pure.js';
import {
  componentFromWidget,
  useWidgetsWithBindingsAndEvents,
} from '@deutschesoft/use-aux-widgets';
import type { EqFilterType, IEqualizerBand } from '../../host/equalizerHost';
import { addGraphClasses, GRAPH_STYLE } from '../../styles/graphStyles';
import {
  EQ_FILTER_MODES,
  EQ_FREQ_MAX,
  EQ_FREQ_MIN,
  EQ_GAIN_MAX,
  EQ_GAIN_MIN,
  EQ_Q_MAX,
  EQ_Q_MIN,
  bandSupportsDyn,
} from '../../host/equalizerHost';
import { DynamicValue, ListValue } from '@deutschesoft/awml';
import type { Bindings } from '@deutschesoft/awml/src/bindings.js';
import { bindAuxOptions } from '../../utils/aux_bindings';
import { postToHost } from '../../utils/bridge';
import { useChartGradient } from '../../hooks/useChartGradient';
import {
  SPECTRUM_MAX_BINS,
  SPECTRUM_MIN_BINS,
} from '../SpectrumChart/SpectrumChart';
import {
  spectrumOverlayContourDots,
  spectrumOverlayDiffDots,
} from '../../utils/spectrumDiffOverlay';
import './EQChart.scss';

export type EQChartFreqGuide = {
  freq$: DynamicValue<number>;
  /** When false / omitted-as-always-on, hide the marker. */
  visible$?: DynamicValue<boolean>;
  className?: string;
};

const EqualizerBindings = {};

const EqualizerOptions = {
  auto_size: true,
  range_x: { min: EQ_FREQ_MIN, max: EQ_FREQ_MAX },
  range_y: { min: EQ_GAIN_MIN, max: EQ_GAIN_MAX },
  range_z: { min: EQ_Q_MIN, max: EQ_Q_MAX, step: 0.1 },
  db_grid: 6,
};

const EqualizerWidget = componentFromWidget(
  AuxEqualizer,
  EqualizerBindings,
  EqualizerOptions,
  'EQChart',
);

export interface EQChartProps {
  bands: IEqualizerBand[];
  yRange?: { min: number; max: number };
  /**
   * Q axis for scroll-wheel on handles. Pin min===max (e.g. FrequencyRange
   * Butterworth Q) to disable Q gestures — they have no DSP effect there.
   */
  zRange?: { min: number; max: number; step?: number };
  dbGrid?: number;
  /** Full editor chart vs single-band miniature. */
  size?: 'normal' | 'mini';
  /**
   * When false (miniatures), only push model → widget (`readonly` in AWML).
   * Avoids bidirectional bindings on shared DynamicValues.
   */
  interactive?: boolean;
  /** Handle labels (B1…Bn). Default on for normal size, off for mini. */
  showLabels?: boolean;
  selectedBandId?: string | null;
  /** Select a band (never null — empty chart clicks do not clear selection). */
  onSelectBand?: (id: string) => void;
  className?: string;
  /**
   * Optional analyzer overlay (same In/Out mask + output edge as MultibandChart).
   * `spectrumMode`: 0 Off / 1 Linear / 2 −3 / 3 −4.5.
   * When Off, no vizcfg and no graph updates (DSP also skips FFT).
   */
  spectrumIn$?: DynamicValue<number[]>;
  spectrumOut$?: DynamicValue<number[]>;
  spectrumMode?: number;
  /**
   * When true (default), deactivate the sum baseline if every band is off
   * (Equalizer — grid highlight is the null). FrequencyRange keeps a flat
   * 0 dB stroke with `false`.
   */
  hideEmptyBaseline?: boolean;
  /**
   * Level-gradient stop offsets for `useChartGradient`. Default is a normal
   * full-height span (`0%`…`100%`). Override only for special layouts
   * (e.g. SpectrumDiff mid flip).
   */
  gradientStops?: { cut: string; boost: string };
  /**
   * When true, swap primary ↔ inv (`--graph-gradient` = accent-top).
   * Default false = suite standard (warn-top / accent-bottom).
   */
  gradientReverse?: boolean;
  /**
   * When false, omit band response fills / baseline (handles + spectrum only).
   * Used by Ringmod spectrum chart (Filter-style freq handles, no EQ curve).
   */
  showResponse?: boolean;
  /**
   * Read-only vertical frequency markers via AUX Graph (two dots, mode=line).
   * Prefer this over ChartHandle for non-interactive lines (e.g. live carrier).
   * Style via `className` + `.eq-freq-guide` in EQChart.scss.
   */
  freqGuides?: EQChartFreqGuide[];
  /** Host automation gesture while dragging a handle (Filter / Ringmod). */
  bandEdit?: (
    bandId: string,
  ) => { beginEdit?: () => void; endEdit?: () => void } | undefined;
}

/**
 * Map spectrum mode → Analyzer-style pink tilt (dB/oct).
 */
function spectrumSlope(mode: number): number {
  const m = Math.round(mode);
  if (m === 2) return 3;
  if (m === 3) return 4.5;
  return 0;
}

/**
 * AUX Equalizer: handle EqBands (static gain) + ghost EqBands (DSP effective
 * gain via viz) for individual curves and baseline sum.
 */
export function EQChart(props: EQChartProps) {
  const {
    bands: bandModels,
    yRange = { min: EQ_GAIN_MIN, max: EQ_GAIN_MAX },
    zRange = { min: EQ_Q_MIN, max: EQ_Q_MAX, step: 0.1 },
    dbGrid = 6,
    size = 'normal',
    interactive = size !== 'mini',
    showLabels = size !== 'mini',
    selectedBandId = null,
    onSelectBand,
    className,
    spectrumIn$,
    spectrumOut$,
    spectrumMode = 0,
    hideEmptyBaseline = true,
    gradientStops,
    gradientReverse = false,
    showResponse = true,
    freqGuides,
    bandEdit,
  } = props;
  const qLocked = zRange.min === zRange.max;

  const [eqWidget, setEqWidget] = useState<unknown>(null);
  const isMini = size === 'mini';
  // Miniatures still draw the band curve. `showResponse` is the opt-out
  // (Ringmod spectrum handles); size alone must not drop the path.
  const drawResponse = showResponse;
  const spectrumOn = !isMini && Math.round(spectrumMode) >= 1;
  // High-rate spectrum must NOT go through React state — paint AUX Graph directly.
  const spectrumOuterRef = useRef<{
    set: (k: string, v: unknown) => void;
    element?: SVGElement;
  } | null>(null);
  const spectrumMaskRef = useRef<{
    set: (k: string, v: unknown) => void;
    element?: SVGElement;
  } | null>(null);
  const spectrumEdgeRef = useRef<{
    set: (k: string, v: unknown) => void;
    element?: SVGElement;
  } | null>(null);
  const spectrumBindingsRef = useRef<Bindings | null>(null);
  const spectrumModeRef = useRef(spectrumMode);
  const yRangeRef = useRef(yRange);
  const spectrumLastPairRef = useRef<[number[], number[]] | null>(null);
  const spectrumWidthRef = useRef(0);
  const spectrumResizeRoRef = useRef<ResizeObserver | null>(null);
  spectrumModeRef.current = spectrumMode;
  yRangeRef.current = yRange;

  const eq = eqWidget as {
    svg: SVGSVGElement;
    range_y: { options: { basis: number } };
    baseline: { element: SVGElement };
    set: (key: string, value: unknown) => void;
  } | null;

  const getEqHeight = useCallback(
    (svg: SVGSVGElement) =>
      eq?.range_y?.options?.basis || svg.clientHeight || 1,
    [eq],
  );

  // Suite standard: warn↑ / accent↓ on `--graph-gradient` (reverse opt-in).
  useChartGradient({
    svg: eq?.svg,
    enabled: !!eq && !isMini,
    getHeight: getEqHeight,
    reverse: gradientReverse,
    stopOffsets: gradientStops,
  });

  useEffect(() => {
    if (!eq || isMini) return;
    eq.set('range_y', { min: yRange.min, max: yRange.max });
    eq.set('db_grid', dbGrid);
  }, [dbGrid, eq, isMini, yRange.max, yRange.min]);

  useEffect(() => {
    if (!eq) return;
    eq.set('range_z', {
      min: zRange.min,
      max: zRange.max,
      step: zRange.step ?? 0.1,
    });
  }, [eq, zRange.max, zRange.min, zRange.step]);

  const handleOptions = useMemo(
    () =>
      bandModels.map((band, i) => {
        const customLabel = band.handleLabel;
        const show =
          !band.handleReadonly &&
          (showLabels ||
            customLabel != null ||
            band.formatHandleLabel != null);
        const cls = [
          'eq-band',
          `eq-band-${i}`,
          !show ? 'eq-nolabel' : '',
          band.handleClass ?? '',
        ]
          .filter(Boolean)
          .join(' ');
        return {
          type: 'parametric',
          // AUX only appends block/line guide strokes from the label layout
          // pass. A measured (but hidden) label keeps that pass alive when
          // the chart itself shows no handle names.
          label:
            customLabel ??
            (show ? (showLabels ? `B${i + 1}` : '\u00b7') : '\u00b7'),
          ...(band.formatHandleLabel
            ? { format_label: band.formatHandleLabel }
            : !show
              ? { format_label: () => '\u00b7' }
              : {}),
          class: cls,
          // Live markers: zero grab size — vertical line still fills y_min…y_max.
          min_size: band.handleReadonly ? 0 : isMini ? 4 : 24,
          max_size: band.handleReadonly ? 0 : isMini ? 10 : 64,
          y_min: yRange.min,
          y_max: yRange.max,
          show_axis: false,
        };
      }),
    [bandModels, isMini, showLabels, yRange.max, yRange.min],
  );

  const ghostOptions = useMemo(
    () =>
      drawResponse
        ? bandModels.map((_, i) => ({
            type: 'parametric',
            label: '',
            format_label: false as const,
            show_handle: false,
            class: `eq-ghost eq-band-${i}`,
            y_min: yRange.min,
            y_max: yRange.max,
            show_axis: false,
          }))
        : [],
    [bandModels, drawResponse, yRange.max, yRange.min],
  );

  const alwaysOn$ = useMemo(() => DynamicValue.fromConstant(true), []);

  const handleBindings = useMemo(
    () =>
      bandModels.map((band) => {
        const canEdit = interactive && !band.handleReadonly;
        const fromModel = canEdit ? {} : { readonly: true as const };
        const qFromModel =
          canEdit && !qLocked ? {} : { readonly: true as const };
        const active$ = interactive ? band.active$ : alwaysOn$;
        return [
          { name: 'gain', backendValue: band.gain$, ...fromModel },
          { name: 'freq', backendValue: band.frequency$, ...fromModel },
          { name: 'q', backendValue: band.q$, ...qFromModel },
          // Always readonly — EqBand defaults active:true and would stomp mode/toggle.
          { name: 'active', backendValue: active$, readonly: true },
          {
            name: 'type',
            backendValue: band.auxType$,
            readonly: true,
          },
          {
            name: 'mode',
            backendValue: band.type$,
            transformReceive: (v: EqFilterType) =>
              EQ_FILTER_MODES[v] ?? 'circular',
            readonly: true,
          },
        ];
      }),
    [bandModels, interactive, alwaysOn$, qLocked],
  );

  const ghostBindings = useMemo(
    () =>
      drawResponse
        ? bandModels.map((band) => {
            const active$ = interactive ? band.active$ : alwaysOn$;
            return [
              {
                name: 'gain',
                backendValue: band.effectiveGain$,
                readonly: true,
              },
              {
                name: 'freq',
                backendValue: band.effectiveFrequency$ ?? band.frequency$,
                readonly: true,
              },
              { name: 'q', backendValue: band.q$, readonly: true },
              { name: 'active', backendValue: active$, readonly: true },
              {
                name: 'type',
                backendValue: band.auxType$,
                readonly: true,
              },
            ];
          })
        : [],
    [bandModels, interactive, alwaysOn$, drawResponse],
  );

  const handleEvents = useMemo(
    () =>
      bandModels.map((band) => {
        if (!interactive || band.handleReadonly) return null;
        const gesture = bandEdit?.(band.id);
        if (!onSelectBand && !gesture) return null;
        return {
          ...(onSelectBand
            ? { handlegrabbed: () => onSelectBand(band.id) }
            : {}),
          ...(gesture
            ? {
                set_interacting: (on: unknown) => {
                  if (on) gesture.beginEdit?.();
                  else gesture.endEdit?.();
                },
              }
            : {}),
        };
      }),
    [bandModels, onSelectBand, interactive, bandEdit],
  );

  const handles = useWidgetsWithBindingsAndEvents(
    AuxEqBand,
    handleOptions,
    handleBindings,
    handleEvents,
  );

  // Setting mode to the value it already has recreates line1 off-DOM and
  // does not invalidate. Re-run the label pass so the stroke is appended.
  useEffect(() => {
    for (const handle of handles) {
      (handle as { invalidate?: (key: string) => void }).invalidate?.('mode');
    }
  }, [handles]);

  const ghosts = useWidgetsWithBindingsAndEvents(
    AuxEqBand,
    ghostOptions,
    ghostBindings,
  );

  const graphsOptions = useMemo(
    () =>
      ghosts.map((ghost, index) => ({
        bands: [ghost],
        mode: 'center',
        class: `eq-individual eq-band-${index} fill-gradient fill-ghost stroke-none`,
        // Tiny canvases miss high-Q needles unless we always densify between pixels
        // (threshold 0 → oversample every segment; see AUX EqualizerGraph.drawPath).
        ...(isMini
          ? { accuracy: 1, oversampling: 16, threshold: 0 }
          : { accuracy: 1, oversampling: 8, threshold: 3 }),
      })),
    [ghosts, isMini],
  );

  const graphsBindings = useMemo(
    () =>
      drawResponse
        ? bandModels.map((band) => [
            {
              name: 'active',
              backendValue: interactive ? band.active$ : alwaysOn$,
              readonly: true,
            },
          ])
        : [],
    [bandModels, interactive, alwaysOn$, drawResponse],
  );

  const graphs = useWidgetsWithBindingsAndEvents(
    AuxEqualizerGraph,
    graphsOptions,
    graphsBindings,
  );

  // Individual graphs + baseline exclusively on ghosts (DSP effective gains).
  // Equalizer.addChild auto-adds every handle EqBand into baseline — that would
  // double-count handle+ghost (and re-runs after our set). Filter + re-sync.
  // Inactive individuals stay attached; Widget `active` → `.aux-inactive`,
  // CSS hides them (opacity 0).
  useEffect(() => {
    if (!eqWidget) return;
    const eq = eqWidget as {
      addGraph: (g: unknown) => void;
      removeGraph: (g: unknown) => void;
      subscribe: (event: string, cb: (...args: unknown[]) => void) => () => void;
      isDestructed: () => boolean;
      baseline: {
        toFront: () => void;
        set: (key: string, value: unknown) => void;
        get: (key: string) => unknown;
        element: SVGElement;
      };
    };

    if (eq.isDestructed()) return;

    const ghostOnly = (band: { get: (k: string) => unknown }) => {
      if (!band.get('active')) return false;
      const cls = band.get('class');
      return typeof cls === 'string' && cls.includes('eq-ghost');
    };

    const syncBaseline = () => {
      if (eq.isDestructed()) return;
      if (!drawResponse) {
        eq.baseline.set('bands', []);
        eq.baseline.set('active', false);
        return;
      }
      eq.baseline.set('rendering_filter', ghostOnly);
      eq.baseline.set('bands', ghosts.slice());
      // Hide empty sum (flat 0 dB path) when no band is active — reveals grid
      // aux-highlight null line (FrequencyResponse 0 dB). FrequencyRange keeps
      // the flat stroke as the “both Off” response.
      const anyActive = bandModels.some((b) =>
        interactive ? !!b.active$.value : true,
      );
      eq.baseline.set('active', hideEmptyBaseline ? anyActive : true);
      // Same densify as individual graphs — baseline uses EqualizerGraph defaults
      // (oversampling 4 / threshold 10) which skip sub-pixel needles on minis.
      if (isMini) {
        eq.baseline.set('accuracy', 1);
        eq.baseline.set('oversampling', 8);
        eq.baseline.set('threshold', 0);
      } else {
        eq.baseline.set('accuracy', 1);
        eq.baseline.set('oversampling', 5);
        eq.baseline.set('threshold', 3);
      }
    };

    const bringBaselineFront = () => {
      if (eq.isDestructed() || !drawResponse) return;
      // Must run after addGraph — new graphs append and would cover the sum curve.
      eq.baseline.toFront();
    };

    syncBaseline();
    if (drawResponse) graphs.forEach((graph) => eq.addGraph(graph));
    bringBaselineFront();
    // Handles re-added as children re-enter baseline — restore ghosts + z-order.
    // subscribe() skips removeEventListener when the Equalizer is already destroyed
    // (options/__events null) — raw off() would throw on unmount / hash switch.
    const unsubBandAdded = eq.subscribe('bandadded', () => {
      syncBaseline();
      bringBaselineFront();
    });
    const unsubActive =
      interactive && drawResponse
        ? bandModels.map((band) => band.active$.subscribe(syncBaseline, false))
        : [];
    return () => {
      unsubBandAdded();
      unsubActive.forEach((u) => u());
      if (eq.isDestructed()) return;
      if (drawResponse) graphs.forEach((graph) => eq.removeGraph(graph));
      eq.baseline.set('bands', []);
    };
  }, [
    eqWidget,
    graphs,
    ghosts,
    bandModels,
    interactive,
    isMini,
    hideEmptyBaseline,
    drawResponse,
  ]);

  useEffect(() => {
    type AuxEl = { element: Element };

    const syncClasses = () => {
      handles.forEach((band, i) => {
        const model = bandModels[i];
        if (!model) return;
        const el = (band as AuxEl).element;
        el.classList.toggle('eq-selected', model.id === selectedBandId);
        el.classList.toggle(
          'dyn',
          bandSupportsDyn(model.type$.value) && model.dyn$.value,
        );
      });

      graphs.forEach((graph, i) => {
        const model = bandModels[i];
        if (!model) return;
        (graph as AuxEl).element.classList.toggle(
          'eq-selected',
          model.id === selectedBandId,
        );
      });
    };

    syncClasses();
    const unsubs = bandModels.flatMap((model) => [
      model.dyn$.subscribe(syncClasses, false),
      model.type$.subscribe(syncClasses, false),
    ]);
    return () => unsubs.forEach((u) => u());
  }, [handles, graphs, bandModels, selectedBandId]);

  // In/Out spectrum fills + output edge (same as MultibandChart crossover).
  // Include spectrumMode$ in the ListValue so tilt changes re-paint even when
  // the FFT buffers are unchanged (MultibandChart scale$ pattern).
  const spectrumMode$ = useMemo(
    () => DynamicValue.fromConstant(spectrumMode),
    // Stable DV — value synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    spectrumMode$.set(spectrumMode);
  }, [spectrumMode, spectrumMode$]);

  const spectrumPair$ = useMemo(() => {
    if (!spectrumIn$ || !spectrumOut$) return null;
    return new ListValue<[number[], number[], number]>([
      spectrumIn$,
      spectrumOut$,
      spectrumMode$,
    ]);
  }, [spectrumIn$, spectrumOut$, spectrumMode$]);

  useEffect(() => {
    if (!eqWidget || isMini || !spectrumPair$) return;
    const eq = eqWidget as {
      addGraph: (opts: unknown) => {
        set: (k: string, v: unknown) => void;
        element?: SVGElement;
      };
      removeGraph: (g: unknown) => void;
      isDestructed?: () => boolean;
      element?: Element;
      svg?: SVGSVGElement;
      baseline?: { toFront: () => void };
    };
    if (eq.isDestructed?.()) return;

    spectrumBindingsRef.current?.dispose();
    spectrumBindingsRef.current = null;

    if (!spectrumOn) {
      spectrumOuterRef.current?.set('dots', null);
      spectrumMaskRef.current?.set('dots', null);
      spectrumEdgeRef.current?.set('dots', null);
      spectrumLastPairRef.current = null;
      return;
    }

    if (!spectrumOuterRef.current) {
      const outer = eq.addGraph({
        dots: null,
        type: 'L',
        mode: 'bottom',
        class: 'eq-spectrum-outer',
      });
      addGraphClasses(
        outer.element,
        'eq-spectrum-outer',
        GRAPH_STYLE.outerDiff,
      );
      spectrumOuterRef.current = outer;
    }
    if (!spectrumMaskRef.current) {
      const mask = eq.addGraph({
        dots: null,
        type: 'L',
        mode: 'bottom',
        class: 'eq-spectrum-mask',
      });
      addGraphClasses(
        mask.element,
        'eq-spectrum-mask',
        GRAPH_STYLE.maskDiff,
      );
      spectrumMaskRef.current = mask;
    }
    if (!spectrumEdgeRef.current) {
      const edge = eq.addGraph({
        dots: null,
        type: 'L',
        mode: 'bottom',
        class: 'eq-spectrum-edge',
      });
      addGraphClasses(
        edge.element,
        'eq-spectrum-edge',
        GRAPH_STYLE.gainEdge,
      );
      spectrumEdgeRef.current = edge;
    }

    // Keep spectrum under band curves / baseline.
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
    eq.baseline?.toFront?.();

    const outer = spectrumOuterRef.current;
    const mask = spectrumMaskRef.current;
    const edge = spectrumEdgeRef.current;
    if (!outer || !mask || !edge) return;

    const paintPair = (inn: number[], out: number[], modePlain: number) => {
      const yr = yRangeRef.current;
      const axis = {
        fMin: EQ_FREQ_MIN,
        fMax: EQ_FREQ_MAX,
        yMin: yr.min,
        yMax: yr.max,
        slopeDbPerOct: spectrumSlope(modePlain),
      };
      const w = spectrumWidthRef.current;
      mask.set('dots', spectrumOverlayDiffDots(inn, out, 'min', axis, w));
      edge.set('dots', spectrumOverlayContourDots(out, axis, w));
      return spectrumOverlayDiffDots(inn, out, 'max', axis, w);
    };

    const bindings = bindAuxOptions(outer, [
      {
        name: 'dots',
        backendValue: spectrumPair$,
        readonly: true,
        transformReceive: (pair: unknown) => {
          const row = (pair as [number[], number[], number?]) ?? [[], []];
          const inn = row[0] ?? [];
          const out = row[1] ?? [];
          const modePlain =
            typeof row[2] === 'number' ? row[2] : spectrumModeRef.current;
          if (
            (!Array.isArray(inn) || !inn.length) &&
            (!Array.isArray(out) || !out.length)
          ) {
            spectrumLastPairRef.current = null;
            mask.set('dots', null);
            edge.set('dots', null);
            return null;
          }
          spectrumLastPairRef.current = [inn, out];
          return paintPair(inn, out, modePlain);
        },
      },
    ]);
    spectrumBindingsRef.current = bindings;

    const el = eq.element ?? eq.svg;
    spectrumResizeRoRef.current?.disconnect();
    spectrumResizeRoRef.current = null;
    if (el) {
      const sendBins = () => {
        const width = Math.round(el.getBoundingClientRect().width);
        spectrumWidthRef.current = Math.max(1, width);
        const next = Math.max(
          SPECTRUM_MIN_BINS,
          Math.min(SPECTRUM_MAX_BINS, width),
        );
        postToHost({ t: 'vizcfg', id: 'fft_in', bins: next });
        postToHost({ t: 'vizcfg', id: 'fft_out', bins: next });
      };
      sendBins();
      let raf = 0;
      const ro = new ResizeObserver(() => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          raf = 0;
          sendBins();
        });
      });
      ro.observe(el);
      spectrumResizeRoRef.current = ro;
    }

    return () => {
      bindings.dispose();
      if (spectrumBindingsRef.current === bindings)
        spectrumBindingsRef.current = null;
      spectrumResizeRoRef.current?.disconnect();
      spectrumResizeRoRef.current = null;
    };
  }, [eqWidget, isMini, spectrumPair$, spectrumOn]);

  // Rare: y-range change — re-apply last buffer (tilt rides ListValue + mode$).
  useEffect(() => {
    if (!spectrumOn) return;
    const outer = spectrumOuterRef.current;
    const mask = spectrumMaskRef.current;
    const edge = spectrumEdgeRef.current;
    const pair = spectrumLastPairRef.current;
    if (!outer || !mask || !edge || !pair) return;
    const yr = yRangeRef.current;
    const axis = {
      fMin: EQ_FREQ_MIN,
      fMax: EQ_FREQ_MAX,
      yMin: yr.min,
      yMax: yr.max,
      slopeDbPerOct: spectrumSlope(spectrumModeRef.current),
    };
    const w = spectrumWidthRef.current;
    const [inn, out] = pair;
    mask.set('dots', spectrumOverlayDiffDots(inn, out, 'min', axis, w));
    edge.set('dots', spectrumOverlayContourDots(out, axis, w));
    outer.set('dots', spectrumOverlayDiffDots(inn, out, 'max', axis, w));
  }, [spectrumOn, yRange.min, yRange.max]);

  // Detach spectrum graphs on unmount / mini switch.
  useEffect(() => {
    return () => {
      spectrumBindingsRef.current?.dispose();
      spectrumBindingsRef.current = null;
      spectrumResizeRoRef.current?.disconnect();
      spectrumResizeRoRef.current = null;
      const eq = eqWidget as {
        removeGraph?: (g: unknown) => void;
        isDestructed?: () => boolean;
      } | null;
      const outer = spectrumOuterRef.current;
      const mask = spectrumMaskRef.current;
      const edge = spectrumEdgeRef.current;
      spectrumOuterRef.current = null;
      spectrumMaskRef.current = null;
      spectrumEdgeRef.current = null;
      spectrumLastPairRef.current = null;
      if (!eq || eq.isDestructed?.()) return;
      if (outer) eq.removeGraph?.(outer);
      if (mask) eq.removeGraph?.(mask);
      if (edge) eq.removeGraph?.(edge);
    };
  }, [eqWidget]);

  // Vertical freq markers as AUX Graphs (line through y_min…y_max at freq).
  const guideList = useMemo(() => freqGuides ?? [], [freqGuides]);
  useEffect(() => {
    const eq = eqWidget as {
      addGraph: (opts: unknown) => {
        set: (k: string, v: unknown) => void;
        element?: SVGElement;
      };
      removeGraph: (g: unknown) => void;
      isDestructed?: () => boolean;
    } | null;
    if (!eq || eq.isDestructed?.() || !guideList.length) return;

    type GuideGraph = {
      set: (k: string, v: unknown) => void;
      element?: SVGElement;
    };
    const graphs: GuideGraph[] = guideList.map((g, i) => {
      const graph = eq.addGraph({
        dots: null,
        type: 'L',
        mode: 'line',
        class: `eq-freq-guide eq-freq-guide-${i}`,
      });
      addGraphClasses(
        graph.element,
        'eq-freq-guide',
        'fill-none',
        'stroke-color',
        'stroke-thicker',
        'stroke-dashed',
        g.className,
      );
      return graph;
    });

    const paint = (index: number) => {
      const g = guideList[index];
      const graph = graphs[index];
      if (!g || !graph) return;
      const on = g.visible$ ? !!g.visible$.value : true;
      const f = g.freq$.value;
      if (!on || !Number.isFinite(f)) {
        graph.set('dots', null);
        return;
      }
      const yr = yRangeRef.current;
      graph.set('dots', [
        { x: f, y: yr.min },
        { x: f, y: yr.max },
      ]);
    };

    const unsubs = guideList.flatMap((g, i) => {
      paint(i);
      const uFreq = g.freq$.subscribe(() => paint(i), false);
      const uVis = g.visible$?.subscribe(() => paint(i), false);
      return [uFreq, uVis].filter(Boolean) as Array<() => void>;
    });

    return () => {
      unsubs.forEach((u) => u());
      if (eq.isDestructed?.()) return;
      graphs.forEach((g) => eq.removeGraph(g));
    };
  }, [eqWidget, guideList, yRange.min, yRange.max]);

  const cls = ['EQChart', size, className ?? ''].filter(Boolean).join(' ');

  return (
    <EqualizerWidget
      widgetRef={setEqWidget}
      bands={handles}
      className={cls}
      show_grid={!isMini}
      show_handles={isMini || interactive}
      range_y={yRange}
      range_z={zRange}
      db_grid={dbGrid}
    />
  );
}
