import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { DynamicValue } from '@deutschesoft/awml';
import {
  makeTapCoeffs,
  sampleTransferCurve,
  shapeStatic,
} from '../../dsp/tapDistortion';
import { useChartGradient } from '../../hooks/useChartGradient';
import './WaveshapeChart.scss';

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
function sliceCurve(curve: Pt[], x0: number, x1: number, coeffs: ReturnType<typeof makeTapCoeffs>): Pt[] {
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
 * Transfer curve + live send visualization:
 * soft heatmap density along the curve, active zone (−A…+A) on top.
 */
export function WaveshapeChart(props: WaveshapeChartProps) {
  const { className, drive$, blend$, asymmetry$, viz$ } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const blurId = `waveshape-heat-blur-${useId().replace(/:/g, '')}`;
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const [curveEl, setCurveEl] = useState<SVGPathElement | null>(null);
  const [zoneEl, setZoneEl] = useState<SVGPathElement | null>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const [drive, setDrive] = useState(() => drive$.value);
  const [blend, setBlend] = useState(() => blend$.value);
  const [asymmetry, setAsymmetry] = useState(() => asymmetry$?.value ?? 0);
  const [viz, setViz] = useState<number[]>(() => viz$?.value ?? [0]);

  useEffect(() => {
    const u1 = drive$.subscribe((v) => setDrive(v));
    const u2 = blend$.subscribe((v) => setBlend(v));
    const uA = asymmetry$?.subscribe((v) => setAsymmetry(v));
    const u3 = viz$?.subscribe((v) => {
      if (Array.isArray(v) && v.length >= 1) setViz(v);
    });
    return () => {
      u1();
      u2();
      uA?.();
      u3?.();
    };
  }, [drive$, blend$, asymmetry$, viz$]);

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

  const coeffs = useMemo(
    () => makeTapCoeffs(blend, drive, asymmetry),
    [blend, drive, asymmetry],
  );
  const curve = useMemo(
    () => sampleTransferCurve(blend, drive, 161, asymmetry),
    [blend, drive, asymmetry],
  );

  const zone = Math.max(0, Math.min(1, viz[0] ?? 0));
  const bins = useMemo(() => viz.slice(1), [viz]);

  useEffect(() => {
    if (zone < 0.02) setZoneEl(null);
  }, [zone]);
  const { w, h } = size;
  const pad = 8;
  const toX = (x: number) => pad + ((x + 1) / 2) * (w - 2 * pad);
  const toY = (y: number) => pad + ((1 - y) / 2) * (h - 2 * pad);

  const basePath = pathThrough(curve, toX, toY);
  const zonePath =
    zone > 0.02
      ? pathThrough(sliceCurve(curve, -zone, zone, coeffs), toX, toY)
      : '';

  const nBins = Math.max(1, bins.length);
  const heatSegs = useMemo(() => {
    // Neighbor blend so adjacent bin widths don't jump into "bubbles".
    const smooth = bins.map((d, i) => {
      const a = bins[i - 1] ?? d;
      const b = bins[i + 1] ?? d;
      return 0.25 * (a ?? 0) + 0.5 * (d ?? 0) + 0.25 * (b ?? 0);
    });
    const segs: { d: string; dens: number }[] = [];
    for (let i = 0; i < nBins; ++i) {
      const dens = smooth[i] ?? 0;
      if (dens < 0.03) continue;
      // Slight x-overlap so soft caps blend between bins.
      const padX = 0.35 / nBins;
      const x0 = -1 + (2 * i) / nBins - padX;
      const x1 = -1 + (2 * (i + 1)) / nBins + padX;
      const d = pathThrough(
        sliceCurve(curve, Math.max(-1, x0), Math.min(1, x1), coeffs),
        toX,
        toY,
      );
      if (d) segs.push({ d, dens });
    }
    return segs;
  }, [bins, nBins, curve, coeffs, w, h]);

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
        x1={toX(0)}
        y1={pad}
        x2={toX(0)}
        y2={h - pad}
      />
      <line
        className="axis"
        x1={pad}
        y1={toY(0)}
        x2={w - pad}
        y2={toY(0)}
      />
      <path className="unity" d={`M${toX(-1)},${toY(-1)} L${toX(1)},${toY(1)}`} />

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

      <path ref={setCurveEl} className="curve" d={basePath} />
      {zonePath ? (
        <path ref={setZoneEl} className="zone" d={zonePath} />
      ) : null}
    </svg>
  );
}
