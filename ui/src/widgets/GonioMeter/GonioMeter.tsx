import { useCallback, useEffect, useRef } from 'react';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import { themeColors$, type ThemeColors } from '../../theme/themeColors';
import './GonioMeter.scss';

const ChartBindings = {};

const ChartOptions = {
  auto_size: true,
  show_grid: false,
  label: false,
  square: true,
  range_x: { min: -1, max: 1, reverse: false },
  range_y: { min: -1, max: 1, reverse: false },
};

const ChartWidget = componentFromWidget(
  AuxChart,
  ChartBindings,
  ChartOptions,
  'GonioMeterPlot',
);

/** Dot radius in SVG px. */
const DOT_R = 1.25;

type AuxRange = { valueToPixel: (v: number) => number };

type AuxGraphInstance = {
  set: (key: string, value: unknown) => void;
  isDestructed?: () => boolean;
  range_x: AuxRange;
  range_y: AuxRange;
  element?: SVGElement;
};

type AuxChartInstance = {
  addGraph: (g: unknown) => AuxGraphInstance;
  removeGraph: (g: AuxGraphInstance) => void;
  isDestructed?: () => boolean;
  svg?: SVGSVGElement;
};

export type GonioMeterDrawMode = 'line' | 'dots';

const GONIO_TRAIL_OPACITIES = [1, 0.66, 0.33] as const;

let gonioGradSeq = 0;

/**
 * One horizontal paint server on the chart SVG: S → M → S (warn → accent → warn).
 * Dots stay a single path; the renderer samples the gradient (no per-dot color).
 */
function installMsGradient(svg: SVGSVGElement): () => void {
  const ns = 'http://www.w3.org/2000/svg';
  const gradId = `calfnxt-gonio-ms-${++gonioGradSeq}`;

  let defs = svg.querySelector(':scope > defs');
  if (!defs) {
    defs = document.createElementNS(ns, 'defs');
    svg.insertBefore(defs, svg.firstChild);
  }

  const grad = document.createElementNS(ns, 'linearGradient');
  grad.id = gradId;
  grad.setAttribute('gradientUnits', 'userSpaceOnUse');
  const stops: SVGStopElement[] = [];
  for (const offset of ['0%', '50%', '100%'] as const) {
    const stop = document.createElementNS(ns, 'stop');
    stop.setAttribute('offset', offset);
    grad.appendChild(stop);
    stops.push(stop);
  }
  defs.appendChild(grad);

  const syncStops = (c: ThemeColors) => {
    stops[0]!.setAttribute('stop-color', c.warn);
    stops[1]!.setAttribute('stop-color', c.accent);
    stops[2]!.setAttribute('stop-color', c.warn);
  };
  syncStops(themeColors$.value);

  // Fragment urls from external CSS often miss the SVG; keep the rule in-tree.
  const style = document.createElementNS(ns, 'style');
  style.textContent =
    `.aux-graph.aux-filled{fill:url(#${gradId});stroke:none}` +
    `.aux-graph.aux-outline{fill:none}`;
  svg.insertBefore(style, svg.firstChild);

  const sync = () => {
    const w = Math.max(1, svg.clientWidth || svg.viewBox.baseVal.width || 1);
    grad.setAttribute('x1', '0');
    grad.setAttribute('y1', '0');
    grad.setAttribute('x2', String(w));
    grad.setAttribute('y2', '0');
  };
  sync();
  const ro = new ResizeObserver(sync);
  ro.observe(svg);
  const unsubTheme = themeColors$.subscribe(syncStops);

  return () => {
    unsubTheme();
    ro.disconnect();
    grad.remove();
    style.remove();
    if (defs && !defs.childNodes.length)
      defs.remove();
  };
}

/** Calf phase-graph style 45° L/R → XY (M↑, R↖, L↗). */
function interleavedToXy(samples: number[]): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const n = samples.length - (samples.length % 2);
  for (let i = 0; i < n; i += 2) {
    const l = samples[i]!;
    const r = samples[i + 1]!;
    if (l === 0 && r === 0)
      continue;
    let a: number;
    if (r === 0)
      a = l > 0 ? Math.PI / 2 : (3 * Math.PI) / 2;
    else
      a = Math.atan2(l, r);
    a += Math.PI / 4;
    const R = Math.hypot(l, r);
    pts.push({ x: -R * Math.cos(a), y: R * Math.sin(a) });
  }
  return pts;
}

/**
 * AUX Graph has no native "scatter" mode — only SVG paths.
 * A dots function returns a path of tiny circles in pixel space
 * (Graph calls it with the graph instance so ranges are available).
 */
function makeDotsPath(samples: number[], graph: AuxGraphInstance): string {
  const pts = interleavedToXy(samples);
  if (!pts.length)
    return '';
  const rx = graph.range_x;
  const ry = graph.range_y;
  const r = DOT_R;
  let d = '';
  for (const p of pts) {
    const cx = rx.valueToPixel(p.x);
    const cy = ry.valueToPixel(p.y);
    d += `M ${cx - r} ${cy} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0 `;
  }
  return d;
}

function makeLineDots(samples: number[]): { x: number; y: number }[] {
  return interleavedToXy(samples);
}

/** Axis chrome in viewBox coords (y down). Matches 45° map: M↑, R↖, L↗. */
function GonioMeterChrome() {
  return (
    <svg
      className="GonioMeter-chrome"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden
    >
      <line className="axis m" x1="50" y1="12" x2="50" y2="92" />
      <line className="axis s" x1="8" y1="50" x2="92" y2="50" />
      <line className="axis r" x1="12" y1="12" x2="92" y2="92" />
      <line className="axis l" x1="88" y1="12" x2="8" y2="92" />
      <text
        className="label m"
        x="50"
        y="5"
        textAnchor="middle"
        dominantBaseline="hanging"
      >
        M
      </text>
      <text
        className="label s"
        x="95"
        y="50"
        textAnchor="start"
        dominantBaseline="middle"
      >
        S
      </text>
      <text
        className="label r"
        x="6"
        y="5"
        textAnchor="start"
        dominantBaseline="hanging"
      >
        R
      </text>
      <text
        className="label l"
        x="94"
        y="5"
        textAnchor="end"
        dominantBaseline="hanging"
      >
        L
      </text>
    </svg>
  );
}

export interface GonioMeterProps {
  /** Interleaved L/R samples from DSP viz. */
  samples$?: DynamicValue<number[]>;
  /** `dots` = scatter (default); `line` = connected polyline. */
  drawMode?: GonioMeterDrawMode;
  className?: string;
  [key: string]: unknown;
}

export function GonioMeter(props: GonioMeterProps) {
  const { samples$, drawMode = 'dots', className, ...rest } = props;
  const graphRefs = useRef<(AuxGraphInstance | null)[]>([]);
  const chartRef = useRef<AuxChartInstance | null>(null);
  const gradDisposeRef = useRef<(() => void) | null>(null);
  const historyRef = useRef<number[][]>([[], [], []]);
  const modeRef = useRef(drawMode);
  modeRef.current = drawMode;

  const renderHistory = useCallback((history: number[][]) => {
    for (let i = 0; i < graphRefs.current.length; ++i) {
      const graph = graphRefs.current[i];
      if (!graph || graph.isDestructed?.())
        continue;
      const samples = history[i] ?? [];
      if (modeRef.current === 'line') {
        graph.set('mode', 'line');
        graph.set('type', 'L');
        graph.set('dots', makeLineDots(samples));
      } else {
        graph.set('mode', 'fill');
        graph.set('dots', (g: AuxGraphInstance) => makeDotsPath(samples, g));
      }
    }
  }, []);

  const pushDots = useCallback((samples: number[], rotateHistory = true) => {
    const nextHistory = rotateHistory
      ? !samples.length
        ? [[], [], []]
        : [samples, historyRef.current[0] ?? [], historyRef.current[1] ?? []]
      : historyRef.current;
    historyRef.current = nextHistory;
    renderHistory(nextHistory);
  }, [renderHistory]);

  const attach = useCallback(
    (chart: AuxChartInstance) => {
      chartRef.current = chart;
      if (chart.isDestructed?.())
        return;
      if (graphRefs.current.length)
        return;
      if (chart.svg && !gradDisposeRef.current)
        gradDisposeRef.current = installMsGradient(chart.svg);

      const layers: (AuxGraphInstance | null)[] = [null, null, null];
      for (let historyIdx = GONIO_TRAIL_OPACITIES.length - 1; historyIdx >= 0; --historyIdx) {
        const graph = chart.addGraph({
          dots: [],
          type: 'L',
          mode: 'line',
          color: '',
        });
        if (graph.element)
          graph.element.style.opacity = String(GONIO_TRAIL_OPACITIES[historyIdx]);
        layers[historyIdx] = graph;
      }
      graphRefs.current = layers;
      pushDots(historyRef.current[0] ?? [], false);
    },
    [pushDots],
  );

  const detach = useCallback(() => {
    const chart = chartRef.current;
    const graphs = graphRefs.current;
    graphRefs.current = [];
    chartRef.current = null;
    gradDisposeRef.current?.();
    gradDisposeRef.current = null;
    if (chart && !chart.isDestructed?.()) {
      for (const graph of graphs) {
        if (!graph)
          continue;
        try {
          chart.removeGraph(graph);
        } catch {
          /* destroyed */
        }
      }
    }
  }, []);

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

  useEffect(() => () => detach(), [detach]);

  useEffect(() => {
    pushDots(historyRef.current[0] ?? [], false);
  }, [drawMode, pushDots]);

  useEffect(() => {
    if (!samples$)
      return;
    const sync = (v: number[]) => pushDots(v);
    sync(samples$.value);
    return samples$.subscribe(sync);
  }, [samples$, pushDots]);

  const cls = ['GonioMeter', `mode-${drawMode}`, className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      <GonioMeterChrome />
      <ChartWidget className="GonioMeter-plot" widgetRef={widgetRef} {...rest} />
    </div>
  );
}
