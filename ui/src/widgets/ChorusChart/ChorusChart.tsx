import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { DynamicValue } from '@deutschesoft/awml';
import './ChorusChart.scss';

export interface ChorusChartProps {
  className?: string;
  voices$: DynamicValue<number>;
  overlap$: DynamicValue<number>;
  vphase$: DynamicValue<number>;
  /** Live [phaseL, _, phaseR, _] in turns 0…1. */
  lfo$: DynamicValue<number[]>;
}

type Dot = { x: number; y: number; ch: 'l' | 'r' };
type Size = { w: number; h: number };

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function wrap01(v: number): number {
  return v - Math.floor(v);
}

/** Calf Multichorus depth-panel X (0…1) for one voice / channel. */
function depthDotX(phase: number, voice: number, unit: number, scw: number): number {
  const ph = wrap01(phase);
  const x = 0.5 + 0.5 * Math.sin(ph * 2 * Math.PI);
  return (voice * unit + x) / scw;
}

/** Calf Multichorus rate-panel Y (−1…1) for one voice. */
function rateDotY(phase: number, voice: number, unit: number, scw: number): number {
  const ph = wrap01(phase);
  let y = 0.95 * Math.sin(ph * 2 * Math.PI);
  y = (voice * unit + (y + 1) / 2) / scw * 2 - 1;
  return y;
}

/** Cached sine curve for one voice (Calf get_graph on par_rate). */
function voiceSineCurve(
  voice: number,
  unit: number,
  scw: number,
  points: number,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < points; ++i) {
    const x = i / (points - 1);
    const phase = x; // one period across the panel
    let y = 0.95 * Math.sin(phase * 2 * Math.PI);
    y = (voice * unit + (y + 1) / 2) / scw * 2 - 1;
    pts.push({ x, y });
  }
  return pts;
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

/** Observe layout box of a wrapper — never the SVG (viewBox must not drive size). */
function usePanelSize(ref: RefObject<HTMLElement | null>): Size {
  const [size, setSize] = useState<Size>({ w: 1, h: 1 });
  useEffect(() => {
    const el = ref.current;
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
  }, [ref]);
  return size;
}

/**
 * Two stacked Calf Multi Chorus panels:
 * - Depth: tiny L/R dots per voice along the delay span
 * - Rate: per-voice sine curves + live phase dots
 */
export function ChorusChart(props: ChorusChartProps) {
  const { className, voices$, overlap$, vphase$, lfo$ } = props;
  const depthBoxRef = useRef<HTMLDivElement>(null);
  const rateBoxRef = useRef<HTMLDivElement>(null);
  const depthSize = usePanelSize(depthBoxRef);
  const rateSize = usePanelSize(rateBoxRef);
  const [voices, setVoices] = useState(() => voices$.value);
  const [overlap, setOverlap] = useState(() => overlap$.value);
  const [vphase, setVphase] = useState(() => vphase$.value);
  const [lfo, setLfo] = useState<number[]>(() => lfo$.value ?? [0, 0, 0, 0]);

  useEffect(() => {
    const u = [
      voices$.subscribe((v) => setVoices(v)),
      overlap$.subscribe((v) => setOverlap(v)),
      vphase$.subscribe((v) => setVphase(v)),
      lfo$.subscribe((v) => {
        if (Array.isArray(v) && v.length >= 4) setLfo(v);
      }),
    ];
    return () => u.forEach((fn) => fn());
  }, [voices$, overlap$, vphase$, lfo$]);

  const nVoices = Math.max(1, Math.min(8, Math.round(voices)));
  const unit = 1 - Math.min(1, Math.max(0, overlap));
  const scw = 1 + unit * (nVoices - 1);
  const vStep = (Math.min(360, Math.max(0, vphase)) / 360) / Math.max(nVoices - 1, 1);
  const phaseL = clamp01(lfo[0] ?? 0);
  const phaseR = clamp01(lfo[2] ?? 0);

  const curves = useMemo(
    () => Array.from({ length: nVoices }, (_, v) => voiceSineCurve(v, unit, scw, 96)),
    [nVoices, unit, scw],
  );

  const depthDots: Dot[] = [];
  const rateDots: Dot[] = [];
  for (let v = 0; v < nVoices; ++v) {
    const phL = wrap01(phaseL + vStep * v);
    const phR = wrap01(phaseR + vStep * v);
    depthDots.push({
      x: depthDotX(phL, v, unit, scw),
      y: 0.5,
      ch: 'l',
    });
    depthDots.push({
      x: depthDotX(phR, v, unit, scw),
      y: -0.5,
      ch: 'r',
    });
    rateDots.push({
      x: phL,
      y: rateDotY(phL, v, unit, scw),
      ch: 'l',
    });
    rateDots.push({
      x: phR,
      y: rateDotY(phR, v, unit, scw),
      ch: 'r',
    });
  }

  const padX = 6;
  const padY = 6;
  const mapDepthX = (x: number) => padX + clamp01(x) * (depthSize.w - padX * 2);
  const mapDepthY = (y: number) => {
    const mid = depthSize.h * 0.5;
    const amp = Math.max(1, mid - padY);
    return mid - y * amp;
  };
  const mapRateX = (x: number) => padX + clamp01(x) * (rateSize.w - padX * 2);
  const mapRateY = (y: number) => {
    const mid = rateSize.h * 0.5;
    const amp = Math.max(1, mid - padY);
    return mid - y * amp;
  };

  return (
    <div className={`ChorusChart${className ? ` ${className}` : ''}`}>
      <div ref={depthBoxRef} className="ChorusChart-panel depth">
        <svg
          className="aux-chart"
          viewBox={`0 0 ${depthSize.w} ${depthSize.h}`}
          preserveAspectRatio="none"
        >
          <line
            className="grid"
            x1={padX}
            x2={depthSize.w - padX}
            y1={mapDepthY(0)}
            y2={mapDepthY(0)}
          />
          {depthDots.map((d, i) => (
            <circle
              key={`d${i}`}
              className={`dot dot-${d.ch}`}
              cx={mapDepthX(d.x)}
              cy={mapDepthY(d.y)}
              r={3.5}
            />
          ))}
        </svg>
      </div>
      <div ref={rateBoxRef} className="ChorusChart-panel rate">
        <svg
          className="aux-chart"
          viewBox={`0 0 ${rateSize.w} ${rateSize.h}`}
          preserveAspectRatio="none"
        >
          <line
            className="grid"
            x1={padX}
            x2={rateSize.w - padX}
            y1={mapRateY(0)}
            y2={mapRateY(0)}
          />
          {curves.map((pts, v) => (
            <path
              key={`c${v}`}
              className="wave"
              d={pathThrough(pts, mapRateX, mapRateY)}
            />
          ))}
          {rateDots.map((d, i) => (
            <circle
              key={`r${i}`}
              className={`dot dot-${d.ch}`}
              cx={mapRateX(d.x)}
              cy={mapRateY(d.y)}
              r={3.5}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
