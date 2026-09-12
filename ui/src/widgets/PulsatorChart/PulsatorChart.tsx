import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DynamicValue } from '@deutschesoft/awml';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import {
  lfoValueFromPhase,
  pulseWidthFromEnum,
  sampleLfoWave,
} from '../../dsp/simpleLfo';
import { useVizPaint } from '../../utils/viz_paint';
import './PulsatorChart.scss';

const EMPTY_LFO: number[] = [0, 0, 0, 0];

export interface PulsatorChartProps {
  className?: string;
  mode$: DynamicValue<number>;
  amount$: DynamicValue<number>;
  offsetL$: DynamicValue<number>;
  offsetR$: DynamicValue<number>;
  pulseWidth$: DynamicValue<number>;
  /** Live [phaseL, valL?, phaseR, valR?] — Y is derived from phase + params. */
  lfo$: DynamicValue<number[]>;
}

function pathThrough(
  pts: { x: number; y: number }[],
  toX: (x: number) => number,
  toY: (y: number) => number,
): string {
  if (pts.length === 0) return '';
  return pts
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${toX(p.x).toFixed(2)},${toY(p.y).toFixed(2)}`,
    )
    .join(' ');
}

/**
 * Dual LFO waveform + live phase dots (Calf Pulsator line-graph).
 * Params → React curves; live `lfo$` → imperative dots (no React on viz ticks).
 */
export function PulsatorChart(props: PulsatorChartProps) {
  const {
    className,
    mode$,
    amount$,
    offsetL$,
    offsetR$,
    pulseWidth$,
    lfo$,
  } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const dotLRef = useRef<SVGCircleElement | null>(null);
  const dotRRef = useRef<SVGCircleElement | null>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const mode = useDynamicValueReadonly(mode$, 0);
  const amount = useDynamicValueReadonly(amount$, 0);
  const offsetL = useDynamicValueReadonly(offsetL$, 0);
  const offsetR = useDynamicValueReadonly(offsetR$, 0);
  const pwEnum = useDynamicValueReadonly(pulseWidth$, 0);

  const paramsRef = useRef({ mode, amount, offsetL, offsetR, pw: 0.5, w: 1, h: 1 });
  const pw = pulseWidthFromEnum(pwEnum);
  paramsRef.current = {
    mode,
    amount,
    offsetL,
    offsetR,
    pw,
    w: size.w,
    h: size.h,
  };

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const sync = () => {
      const r = el.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      setSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const curveL = useMemo(
    () => sampleLfoWave(mode, offsetL, amount, pw, 160),
    [mode, offsetL, amount, pw],
  );
  const curveR = useMemo(
    () => sampleLfoWave(mode, offsetR, amount, pw, 160),
    [mode, offsetR, amount, pw],
  );

  const padX = 4;
  const padY = 6;
  const toX = (x: number, w: number) => padX + x * (w - padX * 2);
  const toY = (y: number, h: number) => {
    const mid = h * 0.5;
    const amp = Math.max(1, mid - padY);
    return mid - y * amp;
  };

  const pathL = pathThrough(
    curveL,
    (x) => toX(x, size.w),
    (y) => toY(y, size.h),
  );
  const pathR = pathThrough(
    curveR,
    (x) => toX(x, size.w),
    (y) => toY(y, size.h),
  );
  const midY = toY(0, size.h);

  const paintLfo = useCallback((lfo: number[]) => {
    const p = paramsRef.current;
    const phase = Math.min(1, Math.max(0, lfo[0] ?? lfo[2] ?? 0));
    const cx = toX(phase, p.w);
    const cyL = toY(lfoValueFromPhase(phase, p.mode, p.offsetL, p.amount, p.pw), p.h);
    const cyR = toY(lfoValueFromPhase(phase, p.mode, p.offsetR, p.amount, p.pw), p.h);
    const dL = dotLRef.current;
    const dR = dotRRef.current;
    if (dL) {
      dL.setAttribute('cx', String(cx));
      dL.setAttribute('cy', String(cyL));
    }
    if (dR) {
      dR.setAttribute('cx', String(cx));
      dR.setAttribute('cy', String(cyR));
    }
  }, []);

  useVizPaint(lfo$, paintLfo, EMPTY_LFO);

  useEffect(() => {
    const cur = lfo$.value;
    paintLfo(Array.isArray(cur) ? cur : EMPTY_LFO);
  }, [mode, amount, offsetL, offsetR, pw, size.w, size.h, paintLfo, lfo$]);

  return (
    <svg
      ref={svgRef}
      className={`PulsatorChart aux-chart${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${size.w} ${size.h}`}
      preserveAspectRatio="none"
      aria-hidden>
      <line className="grid" x1={padX} y1={midY} x2={size.w - padX} y2={midY} />
      <path className="wave wave-l" d={pathL} />
      <path className="wave wave-r" d={pathR} />
      <circle ref={dotLRef} className="dot dot-l" cx={0} cy={0} r={4} />
      <circle ref={dotRRef} className="dot dot-r" cx={0} cy={0} r={4} />
    </svg>
  );
}
