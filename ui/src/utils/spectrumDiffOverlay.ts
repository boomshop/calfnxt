/**
 * Shared In/Out spectrum overlay dots for EQChart / MultibandChart.
 * outer = max(in,out), mask = min(in,out), edge = output contour.
 *
 * Overlay only needs the avg traces — do not parse/copy max/L/R/rms.
 * Y-smooth + capped Catmull-Rom (≤ 2× bins, not 1 pt/CSS-px) so log-bin
 * plateaus do not draw as stairs; the old uncapped densify exploded SVG.
 */
import {
  SPECTRUM_DB_MIN,
  binToHz,
  catmullRomDensify,
  smoothSeriesY,
  spectrumPxPerBin,
  tiltDb,
} from '../widgets/SpectrumChart/SpectrumChart';
import { SPECTRUM_MAX_BINS } from './spectrum_bins';

export type SpectrumOverlayAxis = {
  fMin: number;
  fMax: number;
  yMin: number;
  yMax: number;
  /** Extra dB tilt (Analyzer-style pink scales). */
  slopeDbPerOct?: number;
};

export type SpectrumOverlayDots = { x: number; y: number }[];

function mapSpectrumDbToY(db: number, yMin: number, yMax: number): number {
  const t = (db - SPECTRUM_DB_MIN) / (0 - SPECTRUM_DB_MIN);
  return yMin + Math.min(1, Math.max(0, t)) * (yMax - yMin);
}

function avgAt(raw: number[] | null | undefined, i: number): number {
  if (!raw) return SPECTRUM_DB_MIN;
  const v = raw[2 + i];
  return typeof v === 'number' && Number.isFinite(v) ? v : SPECTRUM_DB_MIN;
}

function payloadBins(raw: number[] | null | undefined): number {
  if (!raw || raw.length < 3) return 0;
  const bins = Math.max(1, Math.min(SPECTRUM_MAX_BINS, Math.round(raw[0] ?? 0)));
  return raw.length >= 2 + bins ? bins : 0;
}

function polishOverlay(
  xs: number[],
  ys: number[],
  bins: number,
  cssWidthPx: number,
): SpectrumOverlayDots {
  const px = spectrumPxPerBin(cssWidthPx, bins);
  const smoothed = smoothSeriesY(ys, xs, px);
  const pts: SpectrumOverlayDots = [];
  for (let i = 0; i < xs.length; ++i) pts.push({ x: xs[i]!, y: smoothed[i]! });
  const cap = Math.min(Math.max(1, cssWidthPx), bins * 2);
  return catmullRomDensify(pts, cap, 'log');
}

/** One pass over In/Out avg traces → the three overlay polylines. */
export function spectrumOverlayLayers(
  inRaw: number[] | null | undefined,
  outRaw: number[] | null | undefined,
  axis: SpectrumOverlayAxis,
  cssWidthPx = 0,
): {
  outer: SpectrumOverlayDots | null;
  mask: SpectrumOverlayDots | null;
  edge: SpectrumOverlayDots | null;
} {
  const binsIn = payloadBins(inRaw);
  const binsOut = payloadBins(outRaw);
  const bins = binsIn || binsOut;
  if (!bins) return { outer: null, mask: null, edge: null };

  const slope = axis.slopeDbPerOct ?? 0;
  const xs: number[] = [];
  const yOuter: number[] = [];
  const yMask: number[] = [];
  const yEdge: number[] = [];
  for (let i = 0; i < bins; ++i) {
    const f = binToHz(i, bins);
    if (f < axis.fMin || f > axis.fMax) continue;
    const da = binsIn ? avgAt(inRaw, i) : SPECTRUM_DB_MIN;
    const db = binsOut ? avgAt(outRaw, i) : SPECTRUM_DB_MIN;
    const ta = tiltDb(Math.max(da, db), f, slope);
    const tb = tiltDb(Math.min(da, db), f, slope);
    const tout = tiltDb(db, f, slope);
    xs.push(f);
    yOuter.push(mapSpectrumDbToY(ta, axis.yMin, axis.yMax));
    yMask.push(mapSpectrumDbToY(tb, axis.yMin, axis.yMax));
    yEdge.push(mapSpectrumDbToY(tout, axis.yMin, axis.yMax));
  }
  if (!xs.length) return { outer: null, mask: null, edge: null };

  const w = cssWidthPx > 0 ? cssWidthPx : 1024;
  return {
    outer: polishOverlay(xs, yOuter, bins, w),
    mask: polishOverlay(xs, yMask, bins, w),
    edge: polishOverlay(xs, yEdge, bins, w),
  };
}

export function spectrumOverlayDiffDots(
  inRaw: number[] | null | undefined,
  outRaw: number[] | null | undefined,
  mode: 'max' | 'min',
  axis: SpectrumOverlayAxis,
  cssWidthPx?: number,
): SpectrumOverlayDots | null {
  const layers = spectrumOverlayLayers(inRaw, outRaw, axis, cssWidthPx ?? 0);
  return mode === 'max' ? layers.outer : layers.mask;
}

/** Output contour — glowing tips above = cut, below = boost. */
export function spectrumOverlayContourDots(
  outRaw: number[] | null | undefined,
  axis: SpectrumOverlayAxis,
  cssWidthPx?: number,
): SpectrumOverlayDots | null {
  return spectrumOverlayLayers(null, outRaw, axis, cssWidthPx ?? 0).edge;
}
