import { useEffect, useId, useMemo, useState } from 'react';
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
import './EQChart.scss';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Baseline stroke: cut (bottom) → boost (top). */
const EQ_STROKE_CUT = '#0066ff';
const EQ_STROKE_BOOST = '#ff0066';

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
  /** Full editor chart vs single-band miniature. */
  size?: 'normal' | 'mini';
  /**
   * When false (miniatures), only push model → widget (`readonly` in AWML).
   * Avoids bidirectional bindings on shared DynamicValues.
   */
  interactive?: boolean;
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
    size = 'normal',
    interactive = size !== 'mini',
    selectedBandId = null,
    onSelectBand,
    className,
  } = props;

  const [eqWidget, setEqWidget] = useState<unknown>(null);
  const isMini = size === 'mini';
  const gradId = `eq-response-grad-${useId().replace(/:/g, '')}`;

  // Vertical gain gradient on the sum curve: low/cut = blue, high/boost = red.
  useEffect(() => {
    if (!eqWidget || isMini) return;
    const eq = eqWidget as {
      svg: SVGSVGElement;
      range_y: { options: { basis: number } };
      baseline: { element: SVGElement };
    };
    const svg = eq.svg;
    if (!svg) return;

    let defs = svg.querySelector(':scope > defs.eq-response-defs');
    if (!defs) {
      defs = document.createElementNS(SVG_NS, 'defs');
      defs.classList.add('eq-response-defs');
      svg.insertBefore(defs, svg.firstChild);
    }

    let grad = defs.querySelector(
      `#${CSS.escape(gradId)}`,
    ) as SVGLinearGradientElement | null;
    if (!grad) {
      grad = document.createElementNS(
        SVG_NS,
        'linearGradient',
      ) as SVGLinearGradientElement;
      grad.id = gradId;
      grad.setAttribute('gradientUnits', 'userSpaceOnUse');
      grad.setAttribute('x1', '0');
      grad.setAttribute('x2', '0');
      const stopCut = document.createElementNS(SVG_NS, 'stop');
      stopCut.setAttribute('offset', '20%');
      stopCut.setAttribute('stop-color', EQ_STROKE_CUT);
      const stopBoost = document.createElementNS(SVG_NS, 'stop');
      stopBoost.setAttribute('offset', '800%');
      stopBoost.setAttribute('stop-color', EQ_STROKE_BOOST);
      grad.appendChild(stopCut);
      grad.appendChild(stopBoost);
      defs.appendChild(grad);
    }

    const syncGeom = () => {
      const h = Math.max(
        1,
        eq.range_y?.options?.basis || svg.clientHeight || 1,
      );
      // range_y is reverse: y=0 is +max (top), y=basis is −min (bottom).
      grad!.setAttribute('y1', String(h));
      grad!.setAttribute('y2', '0');
    };
    syncGeom();

    // Full paint value (not bare id) so SCSS can do stroke: var(--eq-gain-stroke).
    const paint = `url(#${gradId})`;
    svg.style.setProperty('--eq-gain-stroke', paint);

    const path = eq.baseline?.element;
    if (path) path.style.stroke = 'var(--eq-gain-stroke)';

    const ro = new ResizeObserver(syncGeom);
    ro.observe(svg);
    return () => {
      ro.disconnect();
      if (path) path.style.removeProperty('stroke');
      svg.style.removeProperty('--eq-gain-stroke');
      grad?.remove();
      if (defs && !defs.childElementCount) defs.remove();
    };
  }, [eqWidget, isMini, gradId]);

  const handleOptions = useMemo(
    () =>
      bandModels.map((_, i) => ({
        type: 'parametric',
        label: isMini ? '' : `B${i + 1}`,
        ...(isMini ? { format_label: false as const } : {}),
        class: `eq-band eq-band-${i}`,
        min_size: isMini ? 4 : 24,
        max_size: isMini ? 10 : 64,
        y_min: EQ_GAIN_MIN,
        y_max: EQ_GAIN_MAX,
        show_axis: false,
      })),
    [bandModels, isMini],
  );

  const ghostOptions = useMemo(
    () =>
      bandModels.map((_, i) => ({
        type: 'parametric',
        label: '',
        format_label: false as const,
        show_handle: false,
        class: `eq-ghost eq-band-${i}`,
        y_min: EQ_GAIN_MIN,
        y_max: EQ_GAIN_MAX,
        show_axis: false,
      })),
    [bandModels],
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
      on: (event: string, cb: (...args: unknown[]) => void) => void;
      off: (event: string, cb: (...args: unknown[]) => void) => void;
      baseline: {
        toFront: () => void;
        set: (key: string, value: unknown) => void;
        get: (key: string) => unknown;
        element: SVGElement;
      };
    };

    const ghostOnly = (band: { get: (k: string) => unknown }) => {
      if (!band.get('active')) return false;
      const cls = band.get('class');
      return typeof cls === 'string' && cls.includes('eq-ghost');
    };

    const syncBaseline = () => {
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
        const path = eq.baseline.element;
        if (path) path.style.stroke = 'var(--eq-gain-stroke)';
      }
    };

    const bringBaselineFront = () => {
      // Must run after addGraph — new graphs append and would cover the sum curve.
      eq.baseline.toFront();
    };

    syncBaseline();
    graphs.forEach((graph) => eq.addGraph(graph));
    bringBaselineFront();
    // Handles re-added as children re-enter baseline — restore ghosts + z-order.
    const onBandAdded = () => {
      syncBaseline();
      bringBaselineFront();
    };
    eq.on('bandadded', onBandAdded);
    return () => {
      eq.off('bandadded', onBandAdded);
      graphs.forEach((graph) => eq.removeGraph(graph));
      eq.baseline.set('bands', []);
    };
  }, [eqWidget, graphs, ghosts, isMini]);

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
    />
  );
}
