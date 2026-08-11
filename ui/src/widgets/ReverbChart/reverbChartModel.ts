/** ER tap preview aligned with calfNXT Reverb DSP (`reverb_er.h` image-source model). */

export type ErReflection = { time: number; level: number };

const SOUND_MS = 343; // m/s
const EAR_SEP = 0.0875; // half interaural distance (m)
const WALL_REFL = 0.82;
const MAX_MULTI = 32;
/** All manhattan order ≤3 images (~62); no extra amplitude cull. */
const MAX_VELVET = 64;

type Vec3 = { x: number; y: number; z: number };

function dist3(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/** Shoebox image coordinate (same parity rule as DSP). */
function imageAxis(s: number, size: number, n: number): number {
  if ((n & 1) === 0) return n * size + s;
  return n * size + (size - s);
}

type Cand = {
  dL: number;
  dR: number;
  dAvg: number;
  score: number;
  order: number;
};

function candScore(order: number, dAvg: number): number {
  return Math.pow(WALL_REFL, order) / Math.max(0.5, dAvg);
}

function buildRoomCandidates(
  roomSize: number,
  distance: number,
): { cands: Cand[]; dDirect: number } {
  const length = roomSize;
  const width = roomSize * 0.75;
  const height = Math.min(12, Math.max(2.5, 2.5 + 0.22 * roomSize));

  const src: Vec3 = { x: length * 0.28, y: width * 0.5, z: 1.35 };
  const nearM = Math.min(1.0, length * 0.12);
  const farM = Math.max(nearM + 0.5, length * 0.62);
  const srcToList = nearM + (farM - nearM) * distance;
  const list: Vec3 = {
    x: Math.min(length - 0.4, Math.max(0.4, src.x + srcToList)),
    y: width * 0.5,
    z: 1.6,
  };

  let fdx = src.x - list.x;
  let fdy = src.y - list.y;
  let flen = Math.sqrt(fdx * fdx + fdy * fdy);
  if (flen < 1e-3) {
    fdx = -1;
    fdy = 0;
    flen = 1;
  }
  fdx /= flen;
  fdy /= flen;

  const earL: Vec3 = {
    x: list.x + EAR_SEP * -fdy,
    y: list.y + EAR_SEP * fdx,
    z: list.z,
  };
  const earR: Vec3 = {
    x: list.x - EAR_SEP * -fdy,
    y: list.y - EAR_SEP * fdx,
    z: list.z,
  };

  const dDirect = dist3(src, list);
  const nMax = 3;
  const cands: Cand[] = [];

  for (let nx = -nMax; nx <= nMax; ++nx) {
    for (let ny = -nMax; ny <= nMax; ++ny) {
      for (let nz = -nMax; nz <= nMax; ++nz) {
        const order = Math.abs(nx) + Math.abs(ny) + Math.abs(nz);
        if (order < 1 || order > 3) continue;

        const img: Vec3 = {
          x: imageAxis(src.x, length, nx),
          y: imageAxis(src.y, width, ny),
          z: imageAxis(src.z, height, nz),
        };
        const dL = dist3(img, earL);
        const dR = dist3(img, earR);
        const dAvg = 0.5 * (dL + dR);
        cands.push({ dL, dR, dAvg, order, score: candScore(order, dAvg) });
      }
    }
  }

  return { cands, dDirect };
}

function selectTaps(cands: Cand[], velvet: boolean): Cand[] {
  let selected: Cand[];
  if (!velvet) {
    const low = cands
      .filter((c) => c.order <= 2)
      .sort((a, b) => b.score - a.score);
    const hi = cands
      .filter((c) => c.order > 2)
      .sort((a, b) => b.score - a.score);
    selected = [...low];
    for (const c of hi) {
      if (selected.length >= MAX_MULTI) break;
      selected.push(c);
    }
  } else {
    selected = [...cands]
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_VELVET);
  }

  return selected.sort((a, b) =>
    a.order !== b.order ? a.order - b.order : a.dAvg - b.dAvg,
  );
}

/** Normalize AUX list plains: 0 = Off, 1 = Multi-Tap, 2 = Velvet. */
export function normalizeErMode(erMode: number): 0 | 1 | 2 {
  const m = Math.round(Number(erMode));
  if (!(m > 0)) return 0;
  if (m >= 2) return 2;
  return 1;
}

/** Latest relative ER arrival in ms (matches DSP windowMs). */
export function erWindowMs(roomSize: number, distance: number): number {
  const { cands, dDirect } = buildRoomCandidates(roomSize, distance);
  const used = selectTaps(cands, true);
  let maxRelMs = 8;
  for (const c of used) {
    const relL = Math.max(1e-4, c.dL - dDirect) / SOUND_MS;
    const relR = Math.max(1e-4, c.dR - dDirect) / SOUND_MS;
    maxRelMs = Math.max(maxRelMs, Math.max(relL, relR) * 1000);
  }
  return Math.min(500, Math.max(8, maxRelMs));
}

/**
 * Build AUX `reflections` array: time in ms, level in dB (relative to erlevel).
 * Loudest tap is 0 dB so Volume (erlevel) alone sets the bar height.
 */
export function buildErReflections(
  roomSize: number,
  distance: number,
  erMode: number,
): ErReflection[] {
  const mode = normalizeErMode(erMode);
  if (mode === 0) return [];

  const velvet = mode === 2;
  const { cands, dDirect } = buildRoomCandidates(roomSize, distance);
  const used = selectTaps(cands, velvet);
  if (used.length === 0) return [];

  let peakAmp = 1e-6;
  const amps = used.map((c) => {
    const refl = Math.pow(WALL_REFL, c.order);
    const amp = refl / Math.max(0.5, c.dAvg);
    peakAmp = Math.max(peakAmp, amp);
    return amp;
  });

  return used.map((c, i) => {
    const relMs =
      (0.5 *
        (Math.max(1e-4, c.dL - dDirect) + Math.max(1e-4, c.dR - dDirect)) /
        SOUND_MS) *
      1000;
    const level = 20 * Math.log10(Math.max(1e-4, amps[i] / peakAmp));
    return { time: Math.max(0.5, relMs), level };
  });
}

/** Suggest chart timeframe (ms) from decay seconds. */
export function reverbTimeframeMs(decaySec: number): number {
  const end = Math.max(400, decaySec * 1000 * 1.25);
  return Math.min(16000, Math.max(2000, end));
}
