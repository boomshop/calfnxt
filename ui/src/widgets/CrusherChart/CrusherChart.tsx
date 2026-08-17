import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DynamicValue } from '@deutschesoft/awml';
import {
  sampleCrushResponse,
  type CrushPt,
} from '../../dsp/bitreduction';
import { useChartGradient } from '../../hooks/useChartGradient';
import './CrusherChart.scss';

export interface CrusherChartProps {
  className?: string;
  bits$: DynamicValue<number>;
  morph$: DynamicValue<number>;
  mode$: DynamicValue<number>;
  dc$: DynamicValue<number>;
  aa$: DynamicValue<number>;
  /** DSP viz: `[zoneAmp, …densityBins]` in 0…1 (amplitude histogram). */
  viz$?: DynamicValue<number[]>;
}

function pathThrough(
  pts: CrushPt[],
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
 * Walk dry/wet in lockstep; emit wet segments where dry.y ∈ [y0, y1].
 * Maps the live amplitude histogram onto the sine (Harmonics heat language).
 */
function wetSegsByDryAmp(
  dry: CrushPt[],
  wet: CrushPt[],
  y0: number,
  y1: number,
): CrushPt[][] {
  const lo = Math.min(y0, y1);
  const hi = Math.max(y0, y1);
  const segs: CrushPt[][] = [];
  let cur: CrushPt[] = [];
  const n = Math.min(dry.length, wet.length);
  for (let i = 0; i < n; ++i) {
    const y = dry[i]!.y;
    if (y >= lo && y <= hi) {
      cur.push(wet[i]!);
    } else if (cur.length) {
      segs.push(cur);
      cur = [];
    }
  }
  if (cur.length) segs.push(cur);
  return segs;
}

function multiPath(
  segs: CrushPt[][],
  toX: (x: number) => number,
  toY: (y: number) => number,
): string {
  return segs
    .map((s) => pathThrough(s, toX, toY))
    .filter(Boolean)
    .join(' ');
}

/**
 * Calf sine Response + Harmonics-style heat/zone:
 * probe sine (dry faint, wet crushed), density painted where live amplitude
 * lands on the dry sine, active zone = |dry| ≤ zoneAmp.
 */
export function CrusherChart(props: CrusherChartProps) {
  const { className, bits$, morph$, mode$, dc$, aa$, viz$ } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const blurId = `crusher-heat-blur-${useId().replace(/:/g, '')}`;
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const [curveEl, setCurveEl] = useState<SVGPathElement | null>(null);
  const [zoneEl, setZoneEl] = useState<SVGPathElement | null>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [bits, setBits] = useState(() => bits$.value);
  const [morph, setMorph] = useState(() => morph$.value);
  const [mode, setMode] = useState(() => mode$.value);
  const [dc, setDc] = useState(() => dc$.value);
  const [aa, setAa] = useState(() => aa$.value);
  const [viz, setViz] = useState<number[]>(() => viz$?.value ?? [0]);

  useEffect(() => {
    const u = [
      bits$.subscribe((v) => setBits(v)),
      morph$.subscribe((v) => setMorph(v)),
      mode$.subscribe((v) => setMode(v)),
      dc$.subscribe((v) => setDc(v)),
      aa$.subscribe((v) => setAa(v)),
    ];
    const uViz = viz$?.subscribe((v) => {
      if (Array.isArray(v) && v.length >= 1) setViz(v);
    });
    return () => {
      u.forEach((fn) => fn());
      uViz?.();
    };
  }, [bits$, morph$, mode$, dc$, aa$, viz$]);

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
  }, [svg]);

  const gradTargets = useMemo(() => {
    const t: SVGElement[] = [];
    if (curveEl) t.push(curveEl);
    if (zoneEl) t.push(zoneEl);
    return t;
  }, [curveEl, zoneEl]);

  useChartGradient({
    svg,
    enabled: !!svg,
    targets: gradTargets,
    paint: 'stroke',
  });

  const curves = useMemo(
    () => sampleCrushResponse(bits, morph, mode, dc, aa, 280),
    [bits, morph, mode, dc, aa],
  );

  const zone = Math.max(0, Math.min(1, viz[0] ?? 0));
  const bins = useMemo(() => viz.slice(1), [viz]);

  useEffect(() => {
    if (zone < 0.02) setZoneEl(null);
  }, [zone]);

  const { w, h } = size;
  const padX = 4;
  const padY = 8;
  const toX = (x: number) => padX + x * (w - padX * 2);
  const toY = (y: number) => {
    const mid = h * 0.5;
    const amp = Math.max(1, mid - padY);
    return mid - y * amp;
  };

  const pathDry = pathThrough(curves.dry, toX, toY);
  const pathWet = pathThrough(curves.wet, toX, toY);
  const midY = toY(0);

  const zonePath =
    zone > 0.02
      ? multiPath(
          wetSegsByDryAmp(curves.dry, curves.wet, -zone, zone),
          toX,
          toY,
        )
      : '';

  const nBins = Math.max(1, bins.length);
  const heatSegs = useMemo(() => {
    const smooth = bins.map((d, i) => {
      const a = bins[i - 1] ?? d;
      const b = bins[i + 1] ?? d;
      return 0.25 * (a ?? 0) + 0.5 * (d ?? 0) + 0.25 * (b ?? 0);
    });
    const segs: { d: string; dens: number }[] = [];
    for (let i = 0; i < nBins; ++i) {
      const dens = smooth[i] ?? 0;
      if (dens < 0.03) continue;
      // Same binning as DSP hist: amplitude ∈ [−1, 1].
      const padA = 0.35 / nBins;
      const y0 = -1 + (2 * i) / nBins - padA;
      const y1 = -1 + (2 * (i + 1)) / nBins + padA;
      for (const run of wetSegsByDryAmp(
        curves.dry,
        curves.wet,
        Math.max(-1, y0),
        Math.min(1, y1),
      )) {
        const d = pathThrough(run, toX, toY);
        if (d) segs.push({ d, dens });
      }
    }
    return segs;
  }, [bins, nBins, curves, w, h]);

  return (
    <svg
      ref={(el) => {
        svgRef.current = el;
        setSvg(el);
      }}
      className={`CrusherChart aux-chart${className ? ` ${className}` : ''}`}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      aria-hidden>
      <defs>
        <filter
          id={blurId}
          x="-40%"
          y="-40%"
          width="180%"
          height="180%"
          colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation="2.25" />
        </filter>
      </defs>
      <line className="axis" x1={padX} y1={midY} x2={w - padX} y2={midY} />

      <g className="heat-layer" filter={`url(#${blurId})`}>
        {heatSegs.map((s, i) => (
          <path
            key={i}
            className="heat"
            d={s.d}
            style={{
              strokeWidth: 2 + s.dens * 18,
              opacity: 0.08 + s.dens * 0.36,
            }}
          />
        ))}
      </g>

      <path className="wave-dry" d={pathDry} />
      <path ref={setCurveEl} className="curve" d={pathWet} />
      {zonePath ? (
        <path ref={setZoneEl} className="zone" d={zonePath} />
      ) : null}
    </svg>
  );
}
