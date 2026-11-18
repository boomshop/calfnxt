/**
 * Top-view geometry for Phones. Keep in sync with
 * dsp/phones/source/phones_engine.cpp (gaps, speaker placement, decay).
 */

export type PhonesGeometry = {
  angle: number;
  distance: number;
  live: number;
  spkX: number;
  spkZ: number;
  halfWidth: number;
  frontZ: number;
  backZ: number;
  width: number;
  length: number;
  rt60: number;
};

export const ANGLE_MIN = 20;
export const ANGLE_MAX = 45;
export const DISTANCE_MIN = 0.5;
export const DISTANCE_MAX = 4;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function phonesGeometry(angleDeg: number, distanceM: number, live: number): PhonesGeometry {
  const angle = clamp(angleDeg, ANGLE_MIN, ANGLE_MAX);
  const distance = clamp(distanceM, DISTANCE_MIN, DISTANCE_MAX);
  const lv = clamp(live, 0, 1);
  const th = (angle * Math.PI) / 180;
  const spkX = distance * Math.sin(th);
  const spkZ = distance * Math.cos(th);
  const sideGap = 0.25 + 0.85 * lv;
  const frontGap = 0.3 + 0.5 * lv;
  const backGap = 0.4 + 1.1 * lv;
  const halfWidth = spkX + sideGap;
  const frontZ = spkZ + frontGap;
  const backZ = -backGap;
  return {
    angle,
    distance,
    live: lv,
    spkX,
    spkZ,
    halfWidth,
    frontZ,
    backZ,
    width: halfWidth * 2,
    length: frontZ - backZ,
    rt60: 0.25 + 0.2 * lv,
  };
}

/**
 * Scatter nudges the Live rectangle outward, unevenly.
 * Keep in sync with phones_engine.cpp (left/right/front/back).
 */
export function scatterWalls(g: PhonesGeometry, scatter: number) {
  const s = clamp(scatter, 0, 1);
  const frontGap = g.frontZ - g.spkZ;
  const backGap = -g.backZ;
  return {
    left: -g.halfWidth * (1 + 0.08 * s),
    right: g.halfWidth * (1 + 0.05 * s),
    front: g.frontZ + s * 0.06 * frontGap,
    back: g.backZ - s * 0.12 * backGap,
  };
}

/** One drawn wall reflection. `weight` is 1 for the loudest line in the plan. */
export type PlanReflection = {
  key: string;
  points: { x: number; z: number }[];
  weight: number;
};

const K_EAR = 0.0875;
const K_SOUND = 343;
const K_EAR_Y = 1.15;
const K_SPK_Y = 1.2;

/** Even n translates, odd n mirrors. Same rule as phones_engine.cpp imageAxis. */
function imageAxis(s: number, size: number, n: number): number {
  if ((n & 1) === 0) return n * size + s;
  return n * size + (size - s);
}

function foldRoom(u: number, size: number): number {
  const period = size * 2;
  let m = u % period;
  if (m < 0) m += period;
  return m > size ? period - m : m;
}

function hypot3(x: number, y: number, z: number): number {
  return Math.hypot(x, y, z);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * 1 through the engine's arrival window, 0 at the 30 ms gate.
 * The gate in the DSP is a hard cut; the plan fades across the last 12 ms.
 */
function timeFade(excessSec: number): number {
  const near = smoothstep(0.0004, 0.002, excessSec);
  const far = 1 - smoothstep(0.018, 0.03, excessSec);
  return near * far;
}

/**
 * Wall bounces in the top view. Floor and ceiling have no separate plan path.
 * Per-image centimetre jitter is left out so the ray meets the wall. Gain
 * matches phones_engine.cpp. `weight` is 1 for the loudest line and falls
 * with level^1.4, so a quiet bounce sits under the loud ones and the field
 * still reads as a carpet.
 */
export function planReflections(g: PhonesGeometry, scatter: number): PlanReflection[] {
  const s = clamp(scatter, 0, 1);
  const walls = scatterWalls(g, s);
  const width = Math.max(0.2, walls.right - walls.left);
  const length = Math.max(0.2, walls.front - walls.back);
  const wall = 0.68 - 0.1 * s;
  const airK = 8 + 6 * s;
  const ears = [-K_EAR, K_EAR];
  const speakers = [-g.spkX, g.spkX];

  type Cand = {
    src: number;
    nx: number;
    nz: number;
    score: number;
    fade: number;
  };
  const cands: Cand[] = [];

  for (let src = 0; src < 2; src++) {
    const spkX = speakers[src];
    const sx = spkX - walls.left;
    const sz = g.spkZ - walls.back;
    const dDirect = ears.map((ear) => hypot3(spkX - ear, K_SPK_Y - K_EAR_Y, g.spkZ));
    for (let nx = -3; nx <= 3; nx++) {
      for (let nz = -3; nz <= 3; nz++) {
        const order = Math.abs(nx) + Math.abs(nz);
        if (order < 1 || order > 3) continue;
        const orderW = order >= 3 ? 0.4 + 0.6 * s : 1;
        const refl = wall ** order * orderW;
        const ix = walls.left + imageAxis(sx, width, nx);
        const iy = K_SPK_Y;
        const iz = walls.back + imageAxis(sz, length, nz);
        let score = 0;
        let fade = 1;
        for (let ear = 0; ear < 2; ear++) {
          const dImage = Math.max(0.05, hypot3(ix - ears[ear], iy - K_EAR_Y, iz));
          const excessSec = (dImage - dDirect[ear]) / K_SOUND;
          fade = Math.min(fade, timeFade(excessSec));
          const air = Math.exp(-excessSec * airK);
          const gain = Math.min(refl * air * (dDirect[ear] / dImage), 0.35);
          score += Math.abs(gain);
        }
        if (fade > 0.01 && score > 0) cands.push({ src, nx, nz, score, fade });
      }
    }
  }

  const peak = cands.reduce((m, c) => Math.max(m, c.score), 0);
  if (!(peak > 0)) return [];
  const kept = cands.filter((c) => (c.fade * c.score) / peak > 0.012);

  const lx = -walls.left;
  const lz = -walls.back;
  const drawn: PlanReflection[] = [];
  for (const c of kept) {
    const spkX = speakers[c.src];
    const sx = spkX - walls.left;
    const sz = g.spkZ - walls.back;
    const ix = imageAxis(sx, width, c.nx);
    const iz = imageAxis(sz, length, c.nz);
    const hits: { t: number; x: number; z: number }[] = [];
    const dx = ix - lx;
    const dz = iz - lz;
    if (Math.abs(dx) > 1e-8) {
      const lo = Math.min(lx, ix);
      const hi = Math.max(lx, ix);
      for (let k = Math.ceil(lo / width - 1e-9); k <= Math.floor(hi / width + 1e-9); k++) {
        const x = k * width;
        const t = (x - lx) / dx;
        if (t > 1e-4 && t < 1 - 1e-4) hits.push({ t, x, z: lz + t * dz });
      }
    }
    if (Math.abs(dz) > 1e-8) {
      const lo = Math.min(lz, iz);
      const hi = Math.max(lz, iz);
      for (let k = Math.ceil(lo / length - 1e-9); k <= Math.floor(hi / length + 1e-9); k++) {
        const z = k * length;
        const t = (z - lz) / dz;
        if (t > 1e-4 && t < 1 - 1e-4) hits.push({ t, x: lx + t * dx, z });
      }
    }
    hits.sort((a, b) => a.t - b.t);
    const bounces: { x: number; z: number }[] = [];
    for (const hit of hits) {
      const prev = bounces[bounces.length - 1];
      const x = walls.left + foldRoom(hit.x, width);
      const z = walls.back + foldRoom(hit.z, length);
      if (prev && Math.hypot(prev.x - x, prev.z - z) < 0.02) continue;
      bounces.push({ x, z });
    }
    if (bounces.length === 0) continue;
    drawn.push({
      key: `${c.src}:${c.nx}:${c.nz}`,
      points: [{ x: spkX, z: g.spkZ }, ...bounces.reverse(), { x: 0, z: 0 }],
      weight: ((c.fade * c.score) / peak) ** 1.4,
    });
  }
  return drawn;
}
