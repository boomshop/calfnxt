/**
 * Expander transfer helpers (dB) — keep in sync with common/dsp/expander.h.
 *
 * Soft knee lives entirely *below* the open threshold: hermite from the
 * expansion line into (threshold, threshold) with tangents ratio→1, then
 * unity above. Never boosts. Range is a max-GR floor with a smooth corner.
 */

function dbToLin(db: number): number {
  return Math.pow(10, db / 20);
}

function linToDb(lin: number): number {
  if (!(lin > 1e-12)) return -96;
  return 20 * Math.log10(lin);
}

function hermite(
  x: number,
  x0: number,
  x1: number,
  p0: number,
  p1: number,
  m0: number,
  m1: number,
): number {
  const width = x1 - x0;
  if (Math.abs(width) < 1e-12) return p0;
  const t = (x - x0) / width;
  const mm0 = m0 * width;
  const mm1 = m1 * width;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    (2 * p0 + mm0 - 2 * p1 + mm1) * t3 +
    (-3 * p0 - 2 * mm0 + 3 * p1 - mm1) * t2 +
    mm0 * t +
    p0
  );
}

/** Smooth maximum — rounds the convex floor join. */
function smoothMax(a: number, b: number, soft: number): number {
  if (soft <= 0.01) return Math.max(a, b);
  const d = Math.abs(a - b);
  return 0.5 * (a + b + Math.sqrt(d * d + soft * soft));
}

/** Static transfer: input dB → output dB. */
export function expanderOutDb(
  inDb: number,
  thresholdDb: number,
  ratio: number,
  kneeDb: number,
  rangeDb: number,
): number {
  const r = Math.max(1, ratio);
  const floorDb = Math.min(0, rangeDb);
  const knee = Math.max(0, kneeDb);
  const expand = (x: number) => thresholdDb + (x - thresholdDb) * r;

  let outDb: number;
  if (knee <= 0.01) {
    outDb = inDb < thresholdDb ? expand(inDb) : inDb;
  } else {
    // Full knee width below threshold → arrives at (th, th) with unity slope.
    const lo = thresholdDb - knee;
    if (inDb >= thresholdDb) outDb = inDb;
    else if (inDb <= lo) outDb = expand(inDb);
    else outDb = hermite(inDb, lo, thresholdDb, expand(lo), thresholdDb, r, 1);
  }

  // Downward expander must never boost.
  outDb = Math.min(outDb, inDb);

  // Range floor with rounded corner (soft ≈ half knee).
  const floorOut = inDb + floorDb;
  outDb = smoothMax(outDb, floorOut, knee * 0.5);

  // Hard safety clamp.
  return Math.max(floorOut, Math.min(inDb, outDb));
}

/** Linear gain for a linear input level. */
export function expanderStaticGain(
  linIn: number,
  thresholdDb: number,
  ratio: number,
  kneeDb: number,
  rangeDb: number,
): number {
  if (!(linIn > 0)) return dbToLin(Math.min(0, rangeDb));
  const inDb = linToDb(linIn);
  const outDb = expanderOutDb(inDb, thresholdDb, ratio, kneeDb, rangeDb);
  return Math.min(
    1,
    Math.max(dbToLin(Math.min(0, rangeDb)), dbToLin(outDb - inDb)),
  );
}

export type ExpanderDot = { x: number; y: number };

/** Dense polyline matching DSP `expanderOutDb` (for AUX Graph dots). */
export function expanderResponseDots(
  minDb: number,
  maxDb: number,
  thresholdDb: number,
  ratio: number,
  kneeDb: number,
  rangeDb: number,
  points = 128,
): ExpanderDot[] {
  const out: ExpanderDot[] = [];
  const n = Math.max(8, points);
  for (let i = 0; i < n; ++i) {
    const x = minDb + ((maxDb - minDb) * i) / (n - 1);
    out.push({
      x,
      y: expanderOutDb(x, thresholdDb, ratio, kneeDb, rangeDb),
    });
  }
  return out;
}
