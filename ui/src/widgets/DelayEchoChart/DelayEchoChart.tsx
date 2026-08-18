import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { Chart as AuxChart } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import {
  buildDelayEchoTaps,
  linToDb,
  planDelayEchoView,
  type DelayEchoTap,
  type DelayMixMode,
} from '../../dsp/delayEchoTaps';
import './DelayEchoChart.scss';

const DB_MIN = -48;
const DB_MAX = 12;
const DB_GRID = 12;
/** Fixed echo-bar width in CSS pixels (independent of time zoom). */
const ECHO_BAR_WIDTH_PX = 4;

function buildDbGridY(min: number, max: number, step: number) {
  const lines: { pos: number; label?: string; class?: string }[] = [];
  const start = Math.ceil(min / step) * step;
  for (let db = start; db <= max; db += step) {
    lines.push({
      pos: db,
      label: `${db}`,
      class: db % (step * 2) === 0 ? 'major' : undefined,
    });
  }
  return lines;
}

type GridLine = { pos: number; label?: string; class?: string };

/**
 * Musical X grid: labeled beat lines (quarter @ BPM) + quieter subdiv units
 * (same unit as Delay L/R / Subdivide). Optional ms on beat labels.
 */
function buildMusicalGridX(
  bpm: number,
  subdiv: number,
  maxMs: number,
  opts?: { labelBeats?: boolean },
): GridLine[] {
  const b = Math.max(30, Math.min(300, bpm));
  const s = Math.max(1, Math.min(16, Math.round(subdiv)));
  const beatMs = 60000 / b;
  const unitMs = beatMs / s;
  const labelBeats = opts?.labelBeats !== false;
  const unitCount = Math.ceil(maxMs / unitMs - 1e-9);
  const showUnits = s > 1 && unitCount <= 96;
  const lines: GridLine[] = [];

  for (let i = 0; i <= unitCount; ++i) {
    const t = i * unitMs;
    if (t > maxMs + 1e-6)
      break;
    const isBeat = i % s === 0;
    if (!isBeat && !showUnits)
      continue;
    if (isBeat) {
      const beat = Math.round(i / s);
      const ms = Math.round(t);
      const msLabel =
        ms >= 1000 ? `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s` : `${ms}`;
      lines.push({
        pos: t,
        label: labelBeats
          ? beat === 0
            ? msLabel
            : `${beat} · ${msLabel}`
          : undefined,
        class: 'echo-grid-beat',
      });
    } else {
      lines.push({ pos: t, class: 'echo-grid-unit' });
    }
  }
  return lines;
}

/** DSP Width → cross-mix: chmix = (1 − width) * 0.5 */
function widthToCrossMix(width: number): number {
  return (1 - Math.max(-1, Math.min(1, width))) * 0.5;
}

type AuxRange = { valueToPixel: (v: number) => number };

/** One SVG path for all bars of one channel (fixed pixel width). */
function barsPath(
  taps: DelayEchoTap[],
  pickLin: (tap: DelayEchoTap) => number,
  rangeX: AuxRange,
  rangeY: AuxRange,
  barWidthPx: number = ECHO_BAR_WIDTH_PX,
): string {
  const yFloor = rangeY.valueToPixel(DB_MIN);
  const half = Math.max(0.5, barWidthPx * 0.5);
  const parts: string[] = [];
  for (const tap of taps) {
    const lin = pickLin(tap);
    if (!(lin > 1e-4))
      continue;
    const yTop = rangeY.valueToPixel(Math.max(DB_MIN, linToDb(lin)));
    const xMid = rangeX.valueToPixel(tap.tMs);
    const x0 = xMid - half;
    const x1 = xMid + half;
    if (![x0, x1, yTop, yFloor].every(Number.isFinite))
      continue;
    parts.push(
      `M ${x0} ${yFloor} L ${x0} ${yTop} L ${x1} ${yTop} L ${x1} ${yFloor} Z`,
    );
  }
  return parts.join(' ');
}

type AuxGraph = {
  set: (k: string, v: unknown) => void;
  element?: SVGElement;
};

type AuxChartInstance = {
  isDestructed?: () => boolean;
  set: (k: string, v: unknown) => void;
  addGraph: (opts: unknown) => AuxGraph;
  empty?: () => void;
  range_x: AuxRange;
  range_y: AuxRange;
  element?: HTMLElement;
};

const ChartBindings = {};
const ChartOptions = {
  auto_size: true,
  show_grid: true,
  label: false,
  range_x: { min: 0, max: 2000 },
  range_y: { min: DB_MIN, max: DB_MAX },
  grid_x: buildMusicalGridX(120, 4, 2000),
  grid_y: buildDbGridY(DB_MIN, DB_MAX, DB_GRID),
};

const ChartWidget = componentFromWidget(
  AuxChart,
  ChartBindings,
  ChartOptions,
  'DelayEchoChartPane',
);

export interface DelayEchoChartProps {
  className?: string;
  bpm$: DynamicValue<number>;
  subdiv$: DynamicValue<number>;
  timeL$: DynamicValue<number>;
  timeR$: DynamicValue<number>;
  feedback$: DynamicValue<number>;
  /** Wet amount in dB (same plain as host param). */
  amount$: DynamicValue<number>;
  mixMode$: DynamicValue<number>;
  /** Stereo width −1…1 (DSP chmix = (1−width)/2). */
  width$: DynamicValue<number>;
}

type EchoParams = {
  bpm: number;
  subdiv: number;
  timeL: number;
  timeR: number;
  feedback: number;
  amountDb: number;
  mixMode: DelayMixMode;
  width: number;
};

function echoParamsFrom(p: EchoParams) {
  return {
    bpm: p.bpm,
    subdiv: p.subdiv,
    timeL: p.timeL,
    timeR: p.timeR,
    feedback: p.feedback,
    amountDb: p.amountDb,
    mixMode: p.mixMode,
  };
}

/**
 * One pane: create L/R contribution graphs once, then only update dots/axes.
 * (Recreating graphs every knob tick leaked ChildWidgets + set-subscriptions.)
 */
function useEchoPane(
  side: 'L' | 'R',
  paramsRef: MutableRefObject<EchoParams>,
) {
  const chartRef = useRef<AuxChartInstance | null>(null);
  const primaryRef = useRef<AuxGraph | null>(null);
  const ghostRef = useRef<AuxGraph | null>(null);
  const rebuildRef = useRef<() => void>(() => {});
  const resizeRoRef = useRef<ResizeObserver | null>(null);
  const resizeRafRef = useRef(0);
  const lastSpanRef = useRef(-1);
  const lastGridKeyRef = useRef('');
  const labelBeats = side === 'R';

  const rebuild = useCallback(() => {
    const chart = chartRef.current;
    const primary = primaryRef.current;
    const ghost = ghostRef.current;
    if (!chart || chart.isDestructed?.() || !primary || !ghost)
      return;

    const p = paramsRef.current;
    const model = echoParamsFrom(p);
    const { spanMs: span, generations } = planDelayEchoView(model);
    const taps = buildDelayEchoTaps(
      { ...model, generations },
      { maxMs: span },
    );

    if (span !== lastSpanRef.current) {
      lastSpanRef.current = span;
      chart.set('range_x', { min: 0, max: span });
    }

    const gridKey = `${model.bpm}|${model.subdiv}|${span}|${labelBeats ? 1 : 0}`;
    if (gridKey !== lastGridKeyRef.current) {
      lastGridKeyRef.current = gridKey;
      chart.set(
        'grid_x',
        buildMusicalGridX(model.bpm, model.subdiv, span, { labelBeats }),
      );
    }

    const cm = widthToCrossMix(p.width);
    const keep = 1 - cm;
    const contribL =
      side === 'L'
        ? (t: DelayEchoTap) => t.levelL * keep
        : (t: DelayEchoTap) => t.levelL * cm;
    const contribR =
      side === 'L'
        ? (t: DelayEchoTap) => t.levelR * cm
        : (t: DelayEchoTap) => t.levelR * keep;

    // Path strings (not functions): Graph must not re-call into a stale closure.
    const pathL = barsPath(taps, contribL, chart.range_x, chart.range_y);
    const pathR = barsPath(taps, contribR, chart.range_x, chart.range_y);

    if (side === 'L') {
      ghost.set('dots', pathR);
      primary.set('dots', pathL);
    } else {
      ghost.set('dots', pathL);
      primary.set('dots', pathR);
    }
  }, [labelBeats, paramsRef, side]);

  rebuildRef.current = rebuild;

  const ensureGraphs = useCallback(
    (chart: AuxChartInstance) => {
      if (primaryRef.current && ghostRef.current)
        return;
      try {
        chart.empty?.();
      } catch {
        /* ignore */
      }
      const ghostCls = side === 'L' ? 'echo-r' : 'echo-l';
      const primaryCls = side === 'L' ? 'echo-l' : 'echo-r';
      const ghost = chart.addGraph({
        dots: '',
        type: 'L',
        mode: 'fill',
        class: ghostCls,
      });
      const primary = chart.addGraph({
        dots: '',
        type: 'L',
        mode: 'fill',
        class: primaryCls,
      });
      ghost.element?.classList.add(ghostCls);
      primary.element?.classList.add(primaryCls);
      ghostRef.current = ghost;
      primaryRef.current = primary;
      lastSpanRef.current = -1;
      lastGridKeyRef.current = '';
    },
    [side],
  );

  const widgetRef = useCallback(
    (chart: AuxChartInstance | null) => {
      resizeRoRef.current?.disconnect();
      resizeRoRef.current = null;
      if (resizeRafRef.current) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = 0;
      }
      if (!chart) {
        chartRef.current = null;
        primaryRef.current = null;
        ghostRef.current = null;
        lastSpanRef.current = -1;
        lastGridKeyRef.current = '';
        return;
      }
      if (chartRef.current === chart) {
        rebuildRef.current();
        return;
      }
      chartRef.current = chart;
      primaryRef.current = null;
      ghostRef.current = null;
      ensureGraphs(chart);
      rebuildRef.current();
      if (chart.element && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
          if (resizeRafRef.current)
            cancelAnimationFrame(resizeRafRef.current);
          resizeRafRef.current = requestAnimationFrame(() => {
            resizeRafRef.current = 0;
            rebuildRef.current();
          });
        });
        ro.observe(chart.element);
        resizeRoRef.current = ro;
      }
    },
    [ensureGraphs],
  );

  return { widgetRef, rebuild };
}

/**
 * Two stacked AUX Charts: top = left out, bottom = right out.
 * Each pane draws wet-L / wet-R contributions into that out (Width chmix).
 */
export function DelayEchoChart(props: DelayEchoChartProps) {
  const {
    className,
    bpm$,
    subdiv$,
    timeL$,
    timeR$,
    feedback$,
    amount$,
    mixMode$,
    width$,
  } = props;

  const paramsRef = useRef<EchoParams>({
    bpm: bpm$.value,
    subdiv: subdiv$.value,
    timeL: timeL$.value,
    timeR: timeR$.value,
    feedback: feedback$.value,
    amountDb: amount$.value,
    mixMode: Math.round(mixMode$.value) as DelayMixMode,
    width: width$.value,
  });

  const left = useEchoPane('L', paramsRef);
  const right = useEchoPane('R', paramsRef);

  const leftRebuild = left.rebuild;
  const rightRebuild = right.rebuild;

  useEffect(() => {
    const sync = () => {
      paramsRef.current = {
        bpm: bpm$.value,
        subdiv: subdiv$.value,
        timeL: timeL$.value,
        timeR: timeR$.value,
        feedback: feedback$.value,
        amountDb: amount$.value,
        mixMode: Math.max(
          0,
          Math.min(3, Math.round(mixMode$.value)),
        ) as DelayMixMode,
        width: width$.value,
      };
      leftRebuild();
      rightRebuild();
    };
    sync();
    const unsubs = [
      bpm$.subscribe(sync, false),
      subdiv$.subscribe(sync, false),
      timeL$.subscribe(sync, false),
      timeR$.subscribe(sync, false),
      feedback$.subscribe(sync, false),
      amount$.subscribe(sync, false),
      mixMode$.subscribe(sync, false),
      width$.subscribe(sync, false),
    ];
    return () => {
      for (const u of unsubs)
        u();
    };
  }, [
    amount$,
    bpm$,
    feedback$,
    leftRebuild,
    mixMode$,
    rightRebuild,
    subdiv$,
    timeL$,
    timeR$,
    width$,
  ]);

  const cls = ['DelayEchoChart', className ?? ''].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <ChartWidget className="echo-pane echo-pane-l" widgetRef={left.widgetRef} />
      <ChartWidget className="echo-pane echo-pane-r" widgetRef={right.widgetRef} />
    </div>
  );
}
