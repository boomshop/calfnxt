import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DynamicValue } from '@deutschesoft/awml';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import {
  makeTapCoeffs,
  sampleTransferCurve,
  shapeStatic,
} from '../../dsp/tapDistortion';
import { useVizPaint } from '../../utils/viz_paint';
import { useChartGradient } from '../../hooks/useChartGradient';
import './WaveshapeChart.scss';

const EMPTY_VIZ: number[] = [0];

export interface WaveshapeChartProps {
  className?: string;
  drive$: DynamicValue<number>;
  blend$: DynamicValue<number>;
  /** Optional DC bias into the shaper (−1…+1); default 0. */
  asymmetry$?: DynamicValue<number>;
  /**
   * DSP viz: `[zoneAmp, …densityBins]` in 0…1.
   * zone = soft |send| envelope; bins = heatmap along input x ∈ [−1, 1].
   */
  viz$?: DynamicValue<number[]>;
}

type Pt = { x: number; y: number };

function pathThrough(
  pts: Pt[],
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

/** Curve points with x in [x0, x1], plus interpolated endpoints. */
function sliceCurve(
  curve: Pt[],
  x0: number,
  x1: number,
  coeffs: ReturnType<typeof makeTapCoeffs>,
): Pt[] {
  const lo = Math.min(x0, x1);
  const hi = Math.max(x0, x1);
  if (hi - lo < 1e-6) return [];

  const out: Pt[] = [{ x: lo, y: shapeStatic(lo, coeffs) }];
  for (const p of curve) {
    if (p.x > lo && p.x < hi) out.push(p);
  }
  out.push({ x: hi, y: shapeStatic(hi, coeffs) });
  return out;
}

/**
 * Transfer curve + live send visualization.
 * Params → React curve; live `viz$` → imperative heat/zone (no React on viz ticks).
 */
export function WaveshapeChart(props: WaveshapeChartProps) {
  const { className, drive$, blend$, asymmetry$, viz$ } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const heatLayerRef = useRef<SVGGElement | null>(null);
  const zonePathRef = useRef<SVGPathElement | null>(null);
  const blurId = `waveshape-heat-blur-${useId().replace(/:/g, '')}`;
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const [curveEl, setCurveEl] = useState<SVGPathElement | null>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const drive = useDynamicValueReadonly(drive$, 0);
  const blend = useDynamicValueReadonly(blend$, 0);
  const asymmetry = useDynamicValueReadonly(asymmetry$, 0);

  const coeffs = useMemo(
    () => makeTapCoeffs(blend, drive, asymmetry),
    [blend, drive, asymmetry],
  );
  const curve = useMemo(
    () => sampleTransferCurve(blend, drive, 161, asymmetry),
    [blend, drive, asymmetry],
  );
  const curveRef = useRef(curve);
  const coeffsRef = useRef(coeffs);
  const sizeRef = useRef(size);
  curveRef.current = curve;
  coeffsRef.current = coeffs;
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
  const pad = 8;
  const toX = (x: number, ww: number) => pad + ((x + 1) / 2) * (ww - 2 * pad);
  const toY = (y: number, hh: number) => pad + ((1 - y) / 2) * (hh - 2 * pad);

  const basePath = pathThrough(
    curve,
    (x) => toX(x, w),
    (y) => toY(y, h),
  );

  const paintViz = useCallback((viz: number[]) => {
    const heat = heatLayerRef.current;
    const zoneEl = zonePathRef.current;
    if (!heat) return;
    const c = curveRef.current;
    const cf = coeffsRef.current;
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
      const padX = 0.35 / nBins;
      const x0 = -1 + (2 * i) / nBins - padX;
      const x1 = -1 + (2 * (i + 1)) / nBins + padX;
      const d = pathThrough(
        sliceCurve(c, Math.max(-1, x0), Math.min(1, x1), cf),
        mapX,
        mapY,
      );
      if (!d) continue;
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('class', 'heat');
      path.setAttribute('d', d);
      path.style.strokeWidth = String(1.75 + dens * 18);
      path.style.opacity = String(0.08 + dens * 0.36);
      heat.appendChild(path);
    }

    if (zoneEl) {
      if (zone > 0.02) {
        zoneEl.setAttribute(
          'd',
          pathThrough(sliceCurve(c, -zone, zone, cf), mapX, mapY),
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
  }, [curve, coeffs, w, h, paintViz, viz$]);

  const cls = ['WaveshapeChart', className ?? ''].filter(Boolean).join(' ');

  return (
    <svg
      ref={(el) => {
        svgRef.current = el;
        setSvg(el);
      }}
      className={cls}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
    >
      <defs>
        <filter
          id={blurId}
          x="-40%"
          y="-40%"
          width="180%"
          height="180%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur stdDeviation="2.25" />
        </filter>
      </defs>
      <line
        className="axis"
        x1={toX(0, w)}
        y1={pad}
        x2={toX(0, w)}
        y2={h - pad}
      />
      <line
        className="axis"
        x1={pad}
        y1={toY(0, h)}
        x2={w - pad}
        y2={toY(0, h)}
      />
      <path
        className="unity"
        d={`M${toX(-1, w)},${toY(-1, h)} L${toX(1, w)},${toY(1, h)}`}
      />

      <g
        ref={heatLayerRef}
        className="heat-layer"
        filter={`url(#${blurId})`}
      />

      <path ref={setCurveEl} className="curve" d={basePath} />
      <path ref={zonePathRef} className="zone" d="" style={{ display: 'none' }} />
    </svg>
  );
}
