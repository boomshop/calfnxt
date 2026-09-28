/**
 * Shared In/Out spectrum overlay dots for EQChart / MultibandChart.
 * outer = max(in,out), mask = min(in,out), edge = output contour.
 */
import {
  SPECTRUM_DB_MIN,
  binToHz,
  catmullRomDensify,
  parseSpectrumPayload,
  smoothSeriesY,
  spectrumPxPerBin,
  tiltDb,
} from '../widgets/SpectrumChart/SpectrumChart';

export type SpectrumOverlayAxis = {
  fMin: number;
  fMax: number;
  yMin: number;
  yMax: number;
  /** Extra dB tilt (Analyzer-style pink scales). */
  slopeDbPerOct?: number;
};

function mapSpectrumDbToY(db: number, yMin: number, yMax: number): number {
  const t = (db - SPECTRUM_DB_MIN) / (0 - SPECTRUM_DB_MIN);
  return yMin + Math.min(1, Math.max(0, t)) * (yMax - yMin);
}

function buildDots(
  pick: (i: number, a: number, b: number) => number,
  inRaw: number[] | null | undefined,
  outRaw: number[] | null | undefined,
  axis: SpectrumOverlayAxis,
  cssWidthPx: number,
): { x: number; y: number }[] | null {
  const pin = parseSpectrumPayload(inRaw ?? null);
  const pout = parseSpectrumPayload(outRaw ?? null);
  if (!pin && !pout) return null;
  const bins = pin?.bins ?? pout!.bins;
  const a = pin?.avg;
  const b = pout?.avg;
  const slope = axis.slopeDbPerOct ?? 0;
  const ys: number[] = [];
  const hz: number[] = [];
  for (let i = 0; i < bins; ++i) {
    const f = binToHz(i, bins);
    if (f < axis.fMin || f > axis.fMax) continue;
    const da = a?.[i] ?? SPECTRUM_DB_MIN;
    const db = b?.[i] ?? SPECTRUM_DB_MIN;
    const raw = tiltDb(pick(i, da, db), f, slope);
    hz.push(f);
    ys.push(mapSpectrumDbToY(raw, axis.yMin, axis.yMax));
  }
  if (!ys.length) return null;
  const px = spectrumPxPerBin(cssWidthPx, bins);
  const smoothed = smoothSeriesY(ys, hz, px);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < smoothed.length; ++i)
    pts.push({ x: hz[i]!, y: smoothed[i]! });
  return catmullRomDensify(pts, Math.max(1, pts.length * px), 'log');
}

export function spectrumOverlayDiffDots(
  inRaw: number[] | null | undefined,
  outRaw: number[] | null | undefined,
  mode: 'max' | 'min',
  axis: SpectrumOverlayAxis,
  cssWidthPx: number,
): { x: number; y: number }[] | null {
  return buildDots(
    (_i, a, b) => (mode === 'max' ? Math.max(a, b) : Math.min(a, b)),
    inRaw,
    outRaw,
    axis,
    cssWidthPx,
  );
}

/** Output contour — glowing tips above = cut, below = boost. */
export function spectrumOverlayContourDots(
  outRaw: number[] | null | undefined,
  axis: SpectrumOverlayAxis,
  cssWidthPx: number,
): { x: number; y: number }[] | null {
  return buildDots((_i, _a, b) => b, null, outRaw, axis, cssWidthPx);
}
