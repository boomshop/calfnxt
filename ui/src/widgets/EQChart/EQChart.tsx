import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { DynamicValue } from '@deutschesoft/awml';
import { postToHost } from '../../bridge';
import {
  useChartGradient,
} from '../../hooks/useChartGradient';
import {
  SPECTRUM_DB_MIN,
  SPECTRUM_VIZ_ID,
  binToHz,
  parseSpectrumPayload,
  tiltDb,
} from '../SpectrumChart/SpectrumChart';
import './EQChart.scss';

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
   * Optional analyzer overlay. `spectrumMode`: 0 Off / 1 Linear / 2 −3 / 3 −4.5.
   * When Off, no vizcfg and no graph updates (DSP also skips FFT).
   */
  spectrum$?: DynamicValue<number[]>;
  spectrumMode?: number;
}

/**
 * Map spectrum dBFS onto the full EQ gain axis (same visual span as Analyzer,
 * just relabeled): −96 → yMin (−24), 0 → yMax (+24).
 */
function spectrumDbToEqY(db: number, yMin: number, yMax: number): number {
  const t = (db - SPECTRUM_DB_MIN) / (0 - SPECTRUM_DB_MIN);
  return yMin + Math.min(1, Math.max(0, t)) * (yMax - yMin);
}

function spectrumSlope(mode: number): number {
  const m = Math.round(mode);
  if (m === 2) return 3;
  if (m === 3) return 4.5;
  return 0;
}

function spectrumSeriesDots(
  data: Float32Array,
  bins: number,
  yMin: number,
  yMax: number,
  slope: number,
): { x: number; y: number }[] {
  if (bins < 1) return [];
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < bins; ++i) {
    const hz = binToHz(i, bins);
    if (hz < EQ_FREQ_MIN || hz > EQ_FREQ_MAX) continue;
    const raw = data[i] ?? SPECTRUM_DB_MIN;
    const db = tiltDb(raw, hz, slope);
    pts.push({ x: hz, y: spectrumDbToEqY(db, yMin, yMax) });
  }
  return pts;
}

/**
 * AUX Equalizer: handle EqBands (static gain) + ghost EqBands (DSP effective
 * gain via viz) for individual curves and baseline sum.
 */
export function EQChart(props: EQChartProps) {
  const {
    bands: bandModels,
    yRange = { min: EQ_GAIN_MIN, max: EQ_GAIN_MAX },
    dbGrid = 6,
    size = 'normal',
    interactive = size !== 'mini',
    showLabels = size !== 'mini',
    selectedBandId = null,
    onSelectBand,
    className,
    spectrum$,
    spectrumMode = 0,
  } = props;

  const [eqWidget, setEqWidget] = useState<unknown>(null);
  const isMini = size === 'mini';
  const spectrumOn = !isMini && Math.round(spectrumMode) >= 1;
  const spectrumGraphRef = useRef<{
    set: (k: string, v: unknown) => void;
    element?: SVGElement;
  } | null>(null);
  const spectrumModeRef = useRef(spectrumMode);
  const yRangeRef = useRef(yRange);
  spectrumModeRef.current = spectrumMode;
  yRangeRef.current = yRange;

  const eq = eqWidget as {
    svg: SVGSVGElement;
    range_y: { options: { basis: number } };
    baseline: { element: SVGElement };
    set: (key: string, value: unknown) => void;
  } | null;

  useEffect(() => {
    if (!eq || isMini) return;
    eq.set('range_y', { min: yRange.min, max: yRange.max });
    eq.set('db_grid', dbGrid);
  }, [dbGrid, eq, isMini, yRange.max, yRange.min]);

  const baselineTargets = useMemo(
    () => (eq?.baseline?.element ? [eq.baseline.element] : []),
    [eq],
  );
  const getEqHeight = useCallback(
    (svg: SVGSVGElement) =>
      eq?.range_y?.options?.basis || svg.clientHeight || 1,
    [eq],
  );
  const reassertGradStroke = useChartGradient({
    svg: eq?.svg,
    enabled: !!eq && !isMini,
    targets: baselineTargets,
    getHeight: getEqHeight,
  });

  const handleOptions = useMemo(
    () =>
      bandModels.map((_, i) => ({
        type: 'parametric',
        label: showLabels ? `B${i + 1}` : '',
        ...(!showLabels ? { format_label: false as const } : {}),
        class: `eq-band eq-band-${i}`,
        min_size: isMini ? 4 : 24,
        max_size: isMini ? 10 : 64,
        y_min: yRange.min,
        y_max: yRange.max,
        show_axis: false,
      })),
    [bandModels, isMini, showLabels, yRange.max, yRange.min],
  );

  const ghostOptions = useMemo(
    () =>
      bandModels.map((_, i) => ({
        type: 'parametric',
        label: '',
        format_label: false as const,
        show_handle: false,
        class: `eq-ghost eq-band-${i}`,
        y_min: yRange.min,
        y_max: yRange.max,
        show_axis: false,
      })),
    [bandModels, yRange.max, yRange.min],
  );

  const alwaysOn$ = useMemo(() => DynamicValue.fromConstant(true), []);

  const handleBindings = useMemo(
    () =>
      bandModels.map((band) => {
        const fromModel = interactive ? {} : { readonly: true };
        const active$ = interactive ? band.active$ : alwaysOn$;
        return [
          { name: 'gain', backendValue: band.gain$, ...fromModel },
          { name: 'freq', backendValue: band.frequency$, ...fromModel },
          { name: 'q', backendValue: band.q$, ...fromModel },
          { name: 'active', backendValue: active$, ...fromModel },
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
    [bandModels, interactive, alwaysOn$],
  );

  const ghostBindings = useMemo(
    () =>
      bandModels.map((band) => {
        const active$ = interactive ? band.active$ : alwaysOn$;
        return [
          { name: 'gain', backendValue: band.effectiveGain$, readonly: true },
          { name: 'freq', backendValue: band.frequency$, readonly: true },
          { name: 'q', backendValue: band.q$, readonly: true },
          { name: 'active', backendValue: active$, readonly: true },
          {
            name: 'type',
            backendValue: band.auxType$,
            readonly: true,
          },
        ];
      }),
    [bandModels, interactive, alwaysOn$],
  );

  const handleEvents = useMemo(
    () =>
      bandModels.map((band) =>
        interactive && onSelectBand
          ? {
              handlegrabbed: () => onSelectBand(band.id),
            }
          : null,
      ),
    [bandModels, onSelectBand, interactive],
  );

  const handles = useWidgetsWithBindingsAndEvents(
    AuxEqBand,
    handleOptions,
    handleBindings,
    handleEvents,
  );

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
        class: `eq-individual eq-band-${index}`,
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
      bandModels.map((band) => [
        {
          name: 'active',
          backendValue: interactive ? band.active$ : alwaysOn$,
          readonly: true,
        },
      ]),
    [bandModels, interactive, alwaysOn$],
  );

  const graphs = useWidgetsWithBindingsAndEvents(
    AuxEqualizerGraph,
    graphsOptions,
    graphsBindings,
  );

  // Individual graphs + baseline exclusively on ghosts (DSP effective gains).
  // Equalizer.addChild auto-adds every handle EqBand into baseline — that would
  // double-count handle+ghost (and re-runs after our set). Filter + re-sync.
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
      eq.baseline.set('rendering_filter', ghostOnly);
      eq.baseline.set('bands', ghosts.slice());
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
        // Re-assert gradient stroke after AUX may touch the path.
        reassertGradStroke();
      }
    };

    const bringBaselineFront = () => {
      if (eq.isDestructed()) return;
      // Must run after addGraph — new graphs append and would cover the sum curve.
      eq.baseline.toFront();
    };

    syncBaseline();
    graphs.forEach((graph) => eq.addGraph(graph));
    bringBaselineFront();
    // Handles re-added as children re-enter baseline — restore ghosts + z-order.
    // subscribe() skips removeEventListener when the Equalizer is already destroyed
    // (options/__events null) — raw off() would throw on unmount / hash switch.
    const unsubBandAdded = eq.subscribe('bandadded', () => {
      syncBaseline();
      bringBaselineFront();
    });
    return () => {
      unsubBandAdded();
      if (eq.isDestructed()) return;
      graphs.forEach((graph) => eq.removeGraph(graph));
      eq.baseline.set('bands', []);
    };
  }, [eqWidget, graphs, ghosts, isMini, reassertGradStroke]);

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

  // Spectrum analyzer fill (behind EQ curves). Off → no vizcfg / no updates.
  useEffect(() => {
    if (!eqWidget || isMini || !spectrum$) return;
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

    if (!spectrumOn) {
      const g = spectrumGraphRef.current;
      if (g) {
        g.set('dots', null);
      }
      return;
    }

    if (!spectrumGraphRef.current) {
      const g = eq.addGraph({
        dots: null,
        type: 'H2',
        mode: 'bottom',
        class: 'eq-spectrum',
      });
      g.element?.classList.add('eq-spectrum');
      spectrumGraphRef.current = g;
      // Keep under band curves / baseline.
      eq.baseline?.toFront?.();
    }

    const el = eq.element ?? eq.svg;
    let ro: ResizeObserver | null = null;
    if (el) {
      const sendBins = () => {
        const width = Math.round(el.getBoundingClientRect().width);
        const next = Math.max(32, Math.min(256, width));
        postToHost({ t: 'vizcfg', id: SPECTRUM_VIZ_ID, bins: next });
      };
      sendBins();
      let raf = 0;
      ro = new ResizeObserver(() => {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(sendBins);
      });
      ro.observe(el);
    }

    let raf = 0;
    const paint = (raw: number[]) => {
      const g = spectrumGraphRef.current;
      if (!g || eq.isDestructed?.()) return;
      const payload = parseSpectrumPayload(raw);
      if (!payload) {
        g.set('dots', null);
        return;
      }
      const yr = yRangeRef.current;
      const slope = spectrumSlope(spectrumModeRef.current);
      g.set(
        'dots',
        spectrumSeriesDots(
          payload.avg,
          payload.bins,
          yr.min,
          yr.max,
          slope,
        ),
      );
    };

    const unsub = spectrum$.subscribe((v) => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        paint(Array.isArray(v) ? v : []);
      });
    }, false);
    paint(Array.isArray(spectrum$.value) ? spectrum$.value : []);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      unsub();
      ro?.disconnect();
    };
  }, [eqWidget, isMini, spectrum$, spectrumOn]);

  // Detach spectrum graph on unmount / mini switch.
  useEffect(() => {
    return () => {
      const eq = eqWidget as {
        removeGraph?: (g: unknown) => void;
        isDestructed?: () => boolean;
      } | null;
      const g = spectrumGraphRef.current;
      spectrumGraphRef.current = null;
      if (!eq || !g || eq.isDestructed?.()) return;
      eq.removeGraph?.(g);
    };
  }, [eqWidget]);

  const cls = ['EQChart', size, className ?? ''].filter(Boolean).join(' ');

  return (
    <EqualizerWidget
      widgetRef={setEqWidget}
      bands={handles}
      className={cls}
      show_grid={!isMini}
      show_handles={isMini || interactive}
      range_y={yRange}
      db_grid={dbGrid}
    />
  );
}
