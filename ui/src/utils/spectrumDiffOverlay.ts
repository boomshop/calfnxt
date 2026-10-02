/**
 * Shared In/Out spectrum overlay dots for EQChart / MultibandChart.
 * outer = max(in,out), mask = min(in,out), edge = output contour.
 *
 * Overlay only needs the avg traces — do not parse/copy max/L/R/rms, and do
 * not Catmull-Rom densify (that turned a 192-bin overlay into ~1/px SVG).
 */
import {
  SPECTRUM_DB_MIN,
  binToHz,
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

/** One pass over In/Out avg traces → the three overlay polylines. */
export function spectrumOverlayLayers(
  inRaw: number[] | null | undefined,
  outRaw: number[] | null | undefined,
  axis: SpectrumOverlayAxis,
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
  const outer: SpectrumOverlayDots = [];
  const mask: SpectrumOverlayDots = [];
  const edge: SpectrumOverlayDots = [];
  for (let i = 0; i < bins; ++i) {
    const f = binToHz(i, bins);
    if (f < axis.fMin || f > axis.fMax) continue;
    const da = binsIn ? avgAt(inRaw, i) : SPECTRUM_DB_MIN;
    const db = binsOut ? avgAt(outRaw, i) : SPECTRUM_DB_MIN;
    outer.push({
      x: f,
      y: mapSpectrumDbToY(tiltDb(Math.max(da, db), f, slope), axis.yMin, axis.yMax),
    });
    mask.push({
      x: f,
      y: mapSpectrumDbToY(tiltDb(Math.min(da, db), f, slope), axis.yMin, axis.yMax),
    });
    edge.push({
      x: f,
      y: mapSpectrumDbToY(tiltDb(db, f, slope), axis.yMin, axis.yMax),
    });
  }
  if (!outer.length) return { outer: null, mask: null, edge: null };
  return { outer, mask, edge };
}

export function spectrumOverlayDiffDots(
  inRaw: number[] | null | undefined,
  outRaw: number[] | null | undefined,
  mode: 'max' | 'min',
  axis: SpectrumOverlayAxis,
  _cssWidthPx?: number,
): SpectrumOverlayDots | null {
  const layers = spectrumOverlayLayers(inRaw, outRaw, axis);
  return mode === 'max' ? layers.outer : layers.mask;
}

/** Output contour — glowing tips above = cut, below = boost. */
export function spectrumOverlayContourDots(
  outRaw: number[] | null | undefined,
  axis: SpectrumOverlayAxis,
  _cssWidthPx?: number,
): SpectrumOverlayDots | null {
  return spectrumOverlayLayers(null, outRaw, axis).edge;
}
