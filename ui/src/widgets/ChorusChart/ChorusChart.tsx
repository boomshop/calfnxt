import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { DynamicValue } from '@deutschesoft/awml';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { useVizPaint } from '../../utils/viz_paint';
import './ChorusChart.scss';

/** Stable empty LFO — never inline `[0,0,0,0]` in hook deps. */
const EMPTY_LFO: number[] = [0, 0, 0, 0];

export interface ChorusChartProps {
  className?: string;
  voices$: DynamicValue<number>;
  overlap$: DynamicValue<number>;
  vphase$: DynamicValue<number>;
  /** Live [phaseL, _, phaseR, _] in turns 0…1. */
  lfo$: DynamicValue<number[]>;
}

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
    const phase = x;
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
function useBoxSize(ref: RefObject<HTMLElement | null>): Size {
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
 *
 * Params → React; live `lfo$` → imperative circle attrs (no React on viz ticks).
 */
export function ChorusChart(props: ChorusChartProps) {
  const { className, voices$, overlap$, vphase$, lfo$ } = props;
  const depthBoxRef = useRef<HTMLDivElement>(null);
  const rateBoxRef = useRef<HTMLDivElement>(null);
  const depthDotsRef = useRef<(SVGCircleElement | null)[]>([]);
  const rateDotsRef = useRef<(SVGCircleElement | null)[]>([]);
  const layoutRef = useRef({
    nVoices: 1,
    unit: 1,
    scw: 1,
    vStep: 0,
    depthW: 1,
    depthH: 1,
    rateW: 1,
    rateH: 1,
  });
  const depthSize = useBoxSize(depthBoxRef);
  const rateSize = useBoxSize(rateBoxRef);
  const voices = useDynamicValueReadonly(voices$, 1);
  const overlap = useDynamicValueReadonly(overlap$, 0);
  const vphase = useDynamicValueReadonly(vphase$, 0);

  const nVoices = Math.max(1, Math.min(8, Math.round(voices)));
  const unit = 1 - Math.min(1, Math.max(0, overlap));
  const scw = 1 + unit * (nVoices - 1);
  const vStep = (Math.min(360, Math.max(0, vphase)) / 360) / Math.max(nVoices - 1, 1);

  layoutRef.current = {
    nVoices,
    unit,
    scw,
    vStep,
    depthW: depthSize.w,
    depthH: depthSize.h,
    rateW: rateSize.w,
    rateH: rateSize.h,
  };

  const curves = useMemo(
    () => Array.from({ length: nVoices }, (_, v) => voiceSineCurve(v, unit, scw, 96)),
    [nVoices, unit, scw],
  );

  const padX = 6;
  const padY = 6;
  const mapDepthX = (x: number, w: number) => padX + clamp01(x) * (w - padX * 2);
  const mapDepthY = (y: number, h: number) => {
    const mid = h * 0.5;
    const amp = Math.max(1, mid - padY);
    return mid - y * amp;
  };
  const mapRateX = (x: number, w: number) => padX + clamp01(x) * (w - padX * 2);
  const mapRateY = (y: number, h: number) => {
    const mid = h * 0.5;
    const amp = Math.max(1, mid - padY);
    return mid - y * amp;
  };

  const paintLfo = useCallback((lfo: number[]) => {
    const {
      nVoices: n,
      unit: u,
      scw: s,
      vStep: step,
      depthW,
      depthH,
      rateW,
      rateH,
    } = layoutRef.current;
    const phaseL = clamp01(lfo[0] ?? 0);
    const phaseR = clamp01(lfo[2] ?? 0);
    for (let v = 0; v < n; ++v) {
      const phL = wrap01(phaseL + step * v);
      const phR = wrap01(phaseR + step * v);
      const dL = depthDotsRef.current[v * 2];
      const dR = depthDotsRef.current[v * 2 + 1];
      const rL = rateDotsRef.current[v * 2];
      const rR = rateDotsRef.current[v * 2 + 1];
      if (dL) {
        dL.setAttribute('cx', String(mapDepthX(depthDotX(phL, v, u, s), depthW)));
        dL.setAttribute('cy', String(mapDepthY(0.5, depthH)));
      }
      if (dR) {
        dR.setAttribute('cx', String(mapDepthX(depthDotX(phR, v, u, s), depthW)));
        dR.setAttribute('cy', String(mapDepthY(-0.5, depthH)));
      }
      if (rL) {
        rL.setAttribute('cx', String(mapRateX(phL, rateW)));
        rL.setAttribute('cy', String(mapRateY(rateDotY(phL, v, u, s), rateH)));
      }
      if (rR) {
        rR.setAttribute('cx', String(mapRateX(phR, rateW)));
        rR.setAttribute('cy', String(mapRateY(rateDotY(phR, v, u, s), rateH)));
      }
    }
  }, []);

  useVizPaint(lfo$, paintLfo, EMPTY_LFO);

  // After voice-count / size changes, re-place dots from last LFO without React viz.
  useEffect(() => {
    paintLfo(EMPTY_LFO);
    // Replay latest when circles remount — subscribe already replayed once;
    // next viz tick will correct; also pull current if available.
    const cur = lfo$.value;
    if (Array.isArray(cur)) paintLfo(cur);
  }, [nVoices, depthSize.w, depthSize.h, rateSize.w, rateSize.h, paintLfo, lfo$]);

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
            y1={mapDepthY(0, depthSize.h)}
            y2={mapDepthY(0, depthSize.h)}
          />
          {Array.from({ length: nVoices }, (_, v) => (
            <g key={`d${v}`}>
              <circle
                ref={(el) => {
                  depthDotsRef.current[v * 2] = el;
                }}
                className="dot dot-l"
                cx={0}
                cy={0}
                r={3.5}
              />
              <circle
                ref={(el) => {
                  depthDotsRef.current[v * 2 + 1] = el;
                }}
                className="dot dot-r"
                cx={0}
                cy={0}
                r={3.5}
              />
            </g>
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
            y1={mapRateY(0, rateSize.h)}
            y2={mapRateY(0, rateSize.h)}
          />
          {curves.map((pts, v) => (
            <path
              key={`c${v}`}
              className="wave"
              d={pathThrough(
                pts,
                (x) => mapRateX(x, rateSize.w),
                (y) => mapRateY(y, rateSize.h),
              )}
            />
          ))}
          {Array.from({ length: nVoices }, (_, v) => (
            <g key={`r${v}`}>
              <circle
                ref={(el) => {
                  rateDotsRef.current[v * 2] = el;
                }}
                className="dot dot-l"
                cx={0}
                cy={0}
                r={3.5}
              />
              <circle
                ref={(el) => {
                  rateDotsRef.current[v * 2 + 1] = el;
                }}
                className="dot dot-r"
                cx={0}
                cy={0}
                r={3.5}
              />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
