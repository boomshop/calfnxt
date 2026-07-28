import { useCallback, useEffect, useRef } from 'react';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import './Goniometer.scss';

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
  'GoniometerPlot',
);

/** Dot radius in SVG px. */
const DOT_R = 1.25;

type AuxRange = { valueToPixel: (v: number) => number };

type AuxGraphInstance = {
  set: (key: string, value: unknown) => void;
  isDestructed?: () => boolean;
  range_x: AuxRange;
  range_y: AuxRange;
};

type AuxChartInstance = {
  addGraph: (g: unknown) => AuxGraphInstance;
  removeGraph: (g: AuxGraphInstance) => void;
  isDestructed?: () => boolean;
};

export type GoniometerDrawMode = 'line' | 'dots';

/** Calf phase-graph style 45° L/R → XY (M↑, R↖, L↗). */
function interleavedToXy(samples: number[]): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  const n = samples.length - (samples.length % 2);
  for (let i = 0; i < n; i += 2) {
    const l = samples[i]!;
    const r = samples[i + 1]!;
    if (l === 0 && r === 0) continue;
    let a: number;
    if (r === 0) a = l > 0 ? Math.PI / 2 : (3 * Math.PI) / 2;
    else a = Math.atan2(l, r);
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
  if (!pts.length) return '';
  const rx = graph.range_x;
  const ry = graph.range_y;
  const r = DOT_R;
  // Two arcs per point → filled circle; no connecting lines between points.
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
function GoniometerChrome() {
  return (
    <svg
      className="Goniometer-chrome"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden>
      {/* Mid (vertical) */}
      <line className="axis m" x1="50" y1="12" x2="50" y2="92" />
      {/* Side (horizontal) */}
      <line className="axis s" x1="8" y1="50" x2="92" y2="50" />
      {/* Right channel diagonal (top-left ↔ bottom-right) */}
      <line className="axis r" x1="12" y1="12" x2="92" y2="92" />
      {/* Left channel diagonal (top-right ↔ bottom-left) */}
      <line className="axis l" x1="88" y1="12" x2="8" y2="92" />
      <text
        className="label m"
        x="50"
        y="5"
        textAnchor="middle"
        dominantBaseline="hanging">
        M
      </text>
      <text
        className="label s"
        x="95"
        y="50"
        textAnchor="start"
        dominantBaseline="middle">
        S
      </text>
      <text
        className="label r"
        x="6"
        y="5"
        textAnchor="start"
        dominantBaseline="hanging">
        R
      </text>
      <text
        className="label l"
        x="94"
        y="5"
        textAnchor="end"
        dominantBaseline="hanging">
        L
      </text>
    </svg>
  );
}

export interface GoniometerProps {
  /** Interleaved L/R samples from DSP viz. */
  samples$?: DynamicValue<number[]>;
  /** `dots` = scatter (default); `line` = connected polyline. */
  drawMode?: GoniometerDrawMode;
  className?: string;
  [key: string]: unknown;
}

export function Goniometer(props: GoniometerProps) {
  const { samples$, drawMode = 'dots', className, ...rest } = props;
  const graphRef = useRef<AuxGraphInstance | null>(null);
  const chartRef = useRef<AuxChartInstance | null>(null);
  const samplesRef = useRef<number[]>([]);
  const modeRef = useRef(drawMode);
  modeRef.current = drawMode;

  const pushDots = useCallback((samples: number[]) => {
    samplesRef.current = samples;
    const graph = graphRef.current;
    if (!graph || graph.isDestructed?.()) return;
    if (modeRef.current === 'line') {
      graph.set('mode', 'line');
      graph.set('type', 'L');
      graph.set('dots', makeLineDots(samples));
    } else {
      // Filled circles via path string; mode "fill" closes/fills arcs.
      graph.set('mode', 'fill');
      graph.set('dots', (g: AuxGraphInstance) => makeDotsPath(samples, g));
    }
  }, []);

  const attach = useCallback(
    (chart: AuxChartInstance) => {
      chartRef.current = chart;
      if (chart.isDestructed?.()) return;
      if (graphRef.current) return;
      graphRef.current = chart.addGraph({
        dots: [],
        type: 'L',
        mode: 'line',
        color: '',
      });
      pushDots(samplesRef.current);
    },
    [pushDots],
  );

  const detach = useCallback(() => {
    const chart = chartRef.current;
    const graph = graphRef.current;
    graphRef.current = null;
    chartRef.current = null;
    if (chart && graph && !chart.isDestructed?.()) {
      try {
        chart.removeGraph(graph);
      } catch {
        /* destroyed */
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
    pushDots(samplesRef.current);
  }, [drawMode, pushDots]);

  useEffect(() => {
    if (!samples$) return;
    const sync = (v: number[]) => pushDots(v);
    sync(samples$.value);
    return samples$.subscribe(sync);
  }, [samples$, pushDots]);

  const cls = ['Goniometer', `mode-${drawMode}`, className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cls}>
      <GoniometerChrome />
      <ChartWidget
        className="Goniometer-plot"
        widgetRef={widgetRef}
        {...rest}
      />
    </div>
  );
}
