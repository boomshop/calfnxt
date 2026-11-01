/**
 * Shared In/Out spectrum overlay dots for EQChart / MultibandChart.
 * outer = max(in,out), mask = min(in,out), edge = output contour.
 *
 * Overlay only needs the avg traces — do not parse/copy max/L/R/rms.
 * Each slot keeps its measured level. The flank is a share of that slot's
 * pixel width, for a small step and a tall one alike.
 */
import {
  SPECTRUM_DB_MIN,
  spectrumFlankDots,
  tToHz,
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

function slotTAt(raw: ArrayLike<number> | null | undefined, bins: number): Float32Array | null {
  if (!raw || raw.length < 2 + 6 * bins) return null;
  const t = new Float32Array(bins);
  const off = 2 + 5 * bins;
  for (let i = 0; i < bins; ++i) t[i] = raw[off + i] ?? (i + 0.5) / bins;
  return t;
}

function polishOverlay(
  ts: number[],
  ys: number[],
  cssWidthPx: number,
  pxPerY: number,
): SpectrumOverlayDots {
  return spectrumFlankDots(ys, ts, cssWidthPx, tToHz, pxPerY);
}

/** One pass over In/Out avg traces → the three overlay polylines. */
export function spectrumOverlayLayers(
  inRaw: number[] | null | undefined,
  outRaw: number[] | null | undefined,
  axis: SpectrumOverlayAxis,
  cssWidthPx = 0,
  pxPerY = 0,
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
  const slotT = slotTAt(binsIn ? inRaw : outRaw, bins);
  const ts: number[] = [];
  const yOuter: number[] = [];
  const yMask: number[] = [];
  const yEdge: number[] = [];
  for (let i = 0; i < bins; ++i) {
    const frac = slotT ? (slotT[i] ?? (i + 0.5) / bins) : (i + 0.5) / bins;
    const f = tToHz(frac);
    if (f < axis.fMin || f > axis.fMax) continue;
    const da = binsIn ? avgAt(inRaw, i) : SPECTRUM_DB_MIN;
    const db = binsOut ? avgAt(outRaw, i) : SPECTRUM_DB_MIN;
    const ta = tiltDb(Math.max(da, db), f, slope);
    const tb = tiltDb(Math.min(da, db), f, slope);
    const tout = tiltDb(db, f, slope);
    ts.push(frac);
    yOuter.push(mapSpectrumDbToY(ta, axis.yMin, axis.yMax));
    yMask.push(mapSpectrumDbToY(tb, axis.yMin, axis.yMax));
    yEdge.push(mapSpectrumDbToY(tout, axis.yMin, axis.yMax));
  }
  if (!ts.length) return { outer: null, mask: null, edge: null };

  const w = cssWidthPx > 0 ? cssWidthPx : 1024;
  return {
    outer: polishOverlay(ts, yOuter, w, pxPerY),
    mask: polishOverlay(ts, yMask, w, pxPerY),
    edge: polishOverlay(ts, yEdge, w, pxPerY),
  };
}

export function spectrumOverlayDiffDots(
  inRaw: number[] | null | undefined,
  outRaw: number[] | null | undefined,
  mode: 'max' | 'min',
  axis: SpectrumOverlayAxis,
  cssWidthPx?: number,
  pxPerY = 0,
): SpectrumOverlayDots | null {
  const layers = spectrumOverlayLayers(inRaw, outRaw, axis, cssWidthPx ?? 0, pxPerY);
  return mode === 'max' ? layers.outer : layers.mask;
}

/** Output contour — glowing tips above = cut, below = boost. */
export function spectrumOverlayContourDots(
  outRaw: number[] | null | undefined,
  axis: SpectrumOverlayAxis,
  cssWidthPx?: number,
  pxPerY = 0,
): SpectrumOverlayDots | null {
  return spectrumOverlayLayers(null, outRaw, axis, cssWidthPx ?? 0, pxPerY).edge;
}
