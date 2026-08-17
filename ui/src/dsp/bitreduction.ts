/** Port of Calf `dsp::bitreduction::waveshape` for the Shape chart. */

const PI = Math.PI;
const PI_2 = Math.PI / 2;

function addDc(s: number, dc: number): number {
  return s > 0 ? s * dc : s / dc;
}

function removeDc(s: number, dc: number): number {
  return s > 0 ? s / dc : s * dc;
}

/** @param morphGui Mix 0…1 (internally inverted like Calf)
 *  @param dcLin linear DC asymmetry (1 = symmetric)
 *  @param mode 0 linear / 1 logarithmic */
export function bitWaveshape(
  inSample: number,
  bits: number,
  morphGui: number,
  mode: number,
  dcLin: number,
  aa: number,
): number {
  const morph = 1 - morphGui;
  const coeff = Math.pow(2, bits) - 1;
  const sqr = Math.sqrt(coeff / 2);
  const aa1 = (1 - aa) / 2;
  let inn = addDc(inSample, dcLin);

  let y: number;
  let k: number;

  if (mode >= 0.5) {
    y = sqr * Math.log(Math.abs(inn)) + sqr * sqr;
    k = Math.round(y);
    if (!inn) {
      k = 0;
    } else if (k - aa1 <= y && y <= k + aa1) {
      k = (inn / Math.abs(inn)) * Math.exp(k / sqr - sqr);
    } else if (y > k + aa1) {
      const a = Math.exp(k / sqr - sqr);
      const b = Math.exp((k + 1) / sqr - sqr);
      k =
        (inn / Math.abs(inn)) *
        (a +
          (b - a) *
            0.5 *
            (Math.sin(((Math.abs(y - k) - aa1) / aa) * PI - PI_2) + 1));
    } else {
      const a = Math.exp(k / sqr - sqr);
      const b = Math.exp((k - 1) / sqr - sqr);
      k =
        (inn / Math.abs(inn)) *
        (a -
          (a - b) *
            0.5 *
            (Math.sin(((Math.abs(y - k) - aa1) / aa) * PI - PI_2) + 1));
    }
  } else {
    y = inn * coeff;
    k = Math.round(y);
    if (k - aa1 <= y && y <= k + aa1) {
      k /= coeff;
    } else if (y > k + aa1) {
      k =
        k / coeff +
        ((k + 1) / coeff - k / coeff) *
          0.5 *
          (Math.sin((PI * (Math.abs(y - k) - aa1)) / aa - PI_2) + 1);
    } else {
      k =
        k / coeff -
        (k / coeff - (k - 1) / coeff) *
          0.5 *
          (Math.sin((PI * (Math.abs(y - k) - aa1)) / aa - PI_2) + 1);
    }
  }

  k += (inn - k) * morph;
  return removeDc(k, dcLin);
}

export function dbToLin(db: number): number {
  return Math.pow(10, db * 0.05);
}

export type CrushPt = { x: number; y: number };

export type CrushShapeParams = {
  bits: number;
  morph: number;
  mode: number;
  dcDb: number;
  aa: number;
};

function dcLinFromDb(dcDb: number): number {
  return Math.min(4, Math.max(0.25, dbToLin(dcDb)));
}

export function crushAt(x: number, p: CrushShapeParams): number {
  return bitWaveshape(
    x,
    p.bits,
    p.morph,
    p.mode,
    dcLinFromDb(p.dcDb),
    p.aa,
  );
}

/** One sine period: dry probe + crushed wet. X = phase 0…1, Y = amplitude. */
export function sampleCrushResponse(
  bits: number,
  morph: number,
  mode: number,
  dcDb: number,
  aa: number,
  points = 280,
): { dry: CrushPt[]; wet: CrushPt[] } {
  const p: CrushShapeParams = { bits, morph, mode, dcDb, aa };
  const dry: CrushPt[] = [];
  const wet: CrushPt[] = [];
  const n = Math.max(2, points);
  for (let i = 0; i < n; ++i) {
    const x = i / (n - 1);
    const s = Math.sin(x * 2 * PI);
    dry.push({ x, y: s });
    wet.push({ x, y: crushAt(s, p) });
  }
  return { dry, wet };
}
