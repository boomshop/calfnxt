import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DynamicValue } from '@deutschesoft/awml';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import {
  sampleCrushResponse,
  type CrushPt,
} from '../../dsp/bitreduction';
import { useVizPaint } from '../../utils/viz_paint';
import { useChartGradient } from '../../hooks/useChartGradient';
import './CrusherChart.scss';

const EMPTY_VIZ: number[] = [0];

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
 * Calf sine Response + Harmonics-style heat/zone.
 * Params → React curves; live `viz$` → imperative heat/zone (no React on viz ticks).
 */
export function CrusherChart(props: CrusherChartProps) {
  const { className, bits$, morph$, mode$, dc$, aa$, viz$ } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const heatLayerRef = useRef<SVGGElement | null>(null);
  const zonePathRef = useRef<SVGPathElement | null>(null);
  const blurId = `crusher-heat-blur-${useId().replace(/:/g, '')}`;
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const [curveEl, setCurveEl] = useState<SVGPathElement | null>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const bits = useDynamicValueReadonly(bits$, 0);
  const morph = useDynamicValueReadonly(morph$, 0);
  const mode = useDynamicValueReadonly(mode$, 0);
  const dc = useDynamicValueReadonly(dc$, 0);
  const aa = useDynamicValueReadonly(aa$, 0);

  const curves = useMemo(
    () => sampleCrushResponse(bits, morph, mode, dc, aa, 280),
    [bits, morph, mode, dc, aa],
  );
  const curvesRef = useRef(curves);
  curvesRef.current = curves;
  const sizeRef = useRef(size);
  sizeRef.current = size;

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
    if (zonePathRef.current) t.push(zonePathRef.current);
    return t;
  }, [curveEl, size.w, size.h]);

  useChartGradient({
    svg,
    enabled: !!svg,
    targets: gradTargets,
    paint: 'stroke',
  });

  const { w, h } = size;
  const padX = 4;
  const padY = 8;
  const toX = (x: number, ww: number) => padX + x * (ww - padX * 2);
  const toY = (y: number, hh: number) => {
    const mid = hh * 0.5;
    const amp = Math.max(1, mid - padY);
    return mid - y * amp;
  };

  const pathDry = pathThrough(
    curves.dry,
    (x) => toX(x, w),
    (y) => toY(y, h),
  );
  const pathWet = pathThrough(
    curves.wet,
    (x) => toX(x, w),
    (y) => toY(y, h),
  );
  const midY = toY(0, h);

  const paintViz = useCallback((viz: number[]) => {
    const heat = heatLayerRef.current;
    const zoneEl = zonePathRef.current;
    if (!heat) return;
    const { dry, wet } = curvesRef.current;
    const { w: ww, h: hh } = sizeRef.current;
    const mapX = (x: number) => toX(x, ww);
    const mapY = (y: number) => toY(y, hh);

    const zone = Math.max(0, Math.min(1, viz[0] ?? 0));
    const bins = viz.length > 1 ? viz.slice(1) : [];
    const nBins = Math.max(1, bins.length);

    while (heat.firstChild) heat.removeChild(heat.firstChild);
    const ns = 'http://www.w3.org/2000/svg';
    const smooth = bins.map((d, i) => {
      const a = bins[i - 1] ?? d;
      const b = bins[i + 1] ?? d;
      return 0.25 * (a ?? 0) + 0.5 * (d ?? 0) + 0.25 * (b ?? 0);
    });
    for (let i = 0; i < nBins; ++i) {
      const dens = smooth[i] ?? 0;
      if (dens < 0.03) continue;
      const padA = 0.35 / nBins;
      const y0 = -1 + (2 * i) / nBins - padA;
      const y1 = -1 + (2 * (i + 1)) / nBins + padA;
      for (const run of wetSegsByDryAmp(
        dry,
        wet,
        Math.max(-1, y0),
        Math.min(1, y1),
      )) {
        const d = pathThrough(run, mapX, mapY);
        if (!d) continue;
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('class', 'heat');
        path.setAttribute('d', d);
        path.style.strokeWidth = String(1.75 + dens * 18);
        path.style.opacity = String(0.08 + dens * 0.36);
        heat.appendChild(path);
      }
    }

    if (zoneEl) {
      if (zone > 0.02) {
        zoneEl.setAttribute(
          'd',
          multiPath(wetSegsByDryAmp(dry, wet, -zone, zone), mapX, mapY),
        );
        zoneEl.style.display = '';
      } else {
        zoneEl.setAttribute('d', '');
        zoneEl.style.display = 'none';
      }
    }
  }, []);

  useVizPaint(viz$, paintViz, EMPTY_VIZ);

  useEffect(() => {
    const cur = viz$?.value;
    paintViz(Array.isArray(cur) && cur.length ? cur : EMPTY_VIZ);
  }, [curves, w, h, paintViz, viz$]);

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

      <g
        ref={heatLayerRef}
        className="heat-layer"
        filter={`url(#${blurId})`}
      />

      <path className="wave-dry" d={pathDry} />
      <path ref={setCurveEl} className="curve" d={pathWet} />
      <path ref={zonePathRef} className="zone" d="" style={{ display: 'none' }} />
    </svg>
  );
}
