import { useCallback, useEffect, useMemo, useState } from 'react';
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
import {
  useChartGradient,
} from '../../hooks/useChartGradient';
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
  } = props;

  const [eqWidget, setEqWidget] = useState<unknown>(null);
  const isMini = size === 'mini';

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
