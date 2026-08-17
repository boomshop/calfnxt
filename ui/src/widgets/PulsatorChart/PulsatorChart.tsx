import { useEffect, useMemo, useRef, useState } from 'react';
import type { DynamicValue } from '@deutschesoft/awml';
import { sampleLfoWave, pulseWidthFromEnum } from '../../dsp/simpleLfo';
import './PulsatorChart.scss';

export interface PulsatorChartProps {
  className?: string;
  mode$: DynamicValue<number>;
  amount$: DynamicValue<number>;
  offsetL$: DynamicValue<number>;
  offsetR$: DynamicValue<number>;
  pulseWidth$: DynamicValue<number>;
  /** Live [phaseL, valL, phaseR, valR] from DSP. */
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
 * Y: bipolar −1…+1 (amount-scaled), X: one LFO period.
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
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [mode, setMode] = useState(() => mode$.value);
  const [amount, setAmount] = useState(() => amount$.value);
  const [offsetL, setOffsetL] = useState(() => offsetL$.value);
  const [offsetR, setOffsetR] = useState(() => offsetR$.value);
  const [pwEnum, setPwEnum] = useState(() => pulseWidth$.value);
  const [lfo, setLfo] = useState<number[]>(() => lfo$.value ?? [0, 0, 0, 0]);

  useEffect(() => {
    const u = [
      mode$.subscribe((v) => setMode(v)),
      amount$.subscribe((v) => setAmount(v)),
      offsetL$.subscribe((v) => setOffsetL(v)),
      offsetR$.subscribe((v) => setOffsetR(v)),
      pulseWidth$.subscribe((v) => setPwEnum(v)),
      lfo$.subscribe((v) => {
        if (Array.isArray(v) && v.length >= 4) setLfo(v);
      }),
    ];
    return () => u.forEach((fn) => fn());
  }, [mode$, amount$, offsetL$, offsetR$, pulseWidth$, lfo$]);

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

  const pw = pulseWidthFromEnum(pwEnum);
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
  const toX = (x: number) => padX + x * (size.w - padX * 2);
  const toY = (y: number) => {
    // +1 top, 0 mid, −1 bottom (classic Calf mapping)
    const mid = size.h * 0.5;
    const amp = Math.max(1, mid - padY);
    return mid - y * amp;
  };

  const pathL = pathThrough(curveL, toX, toY);
  const pathR = pathThrough(curveR, toX, toY);
  const midY = toY(0);
  const dotLX = toX(Math.min(1, Math.max(0, lfo[0] ?? 0)));
  const dotLY = toY(lfo[1] ?? 0);
  const dotRX = toX(Math.min(1, Math.max(0, lfo[2] ?? 0)));
  const dotRY = toY(lfo[3] ?? 0);

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
      <circle className="dot dot-l" cx={dotLX} cy={dotLY} r={4} />
      <circle className="dot dot-r" cx={dotRX} cy={dotRY} r={4} />
    </svg>
  );
}
