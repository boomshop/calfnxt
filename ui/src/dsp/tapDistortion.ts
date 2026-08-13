/**
 * Calf / Tom Szilagyi tap_distortion static waveshape (no OS / slew).
 * Used for UI transfer curve + harmonic bars.
 */

export type TapCoeffs = {
  kpa: number;
  kpb: number;
  kna: number;
  knb: number;
  ap: number;
  an: number;
  pwrq: number;
};

function D(x: number): number {
  x = Math.abs(x);
  return x > 1e-8 ? Math.sqrt(x) : 0;
}

export function makeTapCoeffs(blend: number, drive: number): TapCoeffs {
  const rdrive = 12 / Math.max(0.1, drive);
  const rbdr = (rdrive / (10.5 - blend)) * (780 / 33);
  const kpa = D(2 * (rdrive * rdrive) - 1) + 1;
  const kpb = (2 - kpa) / 2;
  const ap = (rdrive * rdrive - kpa + 1) / 2;
  const kc = kpa / D(2 * D(2 * (rdrive * rdrive) - 1) - 2 * rdrive * rdrive);
  const sq = kc * kc + 1;
  const knb = (-1 * rbdr) / D(sq);
  const kna = (2 * kc * rbdr) / D(sq);
  const an = (rbdr * rbdr) / sq;
  const imr = 2 * knb + D(2 * kna + 4 * an - 1);
  const pwrq = 2 / (imr + 1);
  return { kpa, kpb, kna, knb, ap, an, pwrq };
}

export function shapeStatic(x: number, c: TapCoeffs): number {
  if (x >= 0)
    return (D(c.ap + x * (c.kpa - x)) + c.kpb) * c.pwrq;
  return (D(c.an - x * (c.kna + x)) + c.knb) * c.pwrq * -1;
}

/** Sample the transfer curve for SVG plotting. */
export function sampleTransferCurve(
  blend: number,
  drive: number,
  points = 129,
): { x: number; y: number }[] {
  const c = makeTapCoeffs(blend, drive);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < points; ++i) {
    const x = -1 + (2 * i) / (points - 1);
    out.push({ x, y: shapeStatic(x, c) });
  }
  return out;
}

/**
 * Harmonic magnitudes of a unit sine through the static shape (DFT bins 1…N).
 * Returns relative levels H2…HN normalized to H1 (0…~few).
 */
export function harmonicLevels(
  blend: number,
  drive: number,
  count = 4,
): number[] {
  const c = makeTapCoeffs(blend, drive);
  const N = 256;
  const re = new Array(count + 1).fill(0);
  const im = new Array(count + 1).fill(0);
  for (let n = 0; n < N; ++n) {
    const t = (2 * Math.PI * n) / N;
    const y = shapeStatic(Math.sin(t), c);
    for (let k = 1; k <= count; ++k) {
      re[k] += y * Math.cos((k * 2 * Math.PI * n) / N);
      im[k] += y * Math.sin((k * 2 * Math.PI * n) / N);
    }
  }
  const mag = (k: number) => Math.hypot(re[k], im[k]) / (N / 2);
  const fund = Math.max(1e-9, mag(1));
  const levels: number[] = [];
  for (let k = 2; k <= count; ++k)
    levels.push(mag(k) / fund);
  return levels;
}
