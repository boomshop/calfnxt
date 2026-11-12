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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function phonesGeometry(angleDeg: number, distanceM: number, live: number): PhonesGeometry {
  const angle = clamp(angleDeg, 20, 45);
  const distance = clamp(distanceM, 0.5, 4);
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

/** Specular point on a side wall (listener at the origin, image-source). */
export function sideBounce(spkX: number, spkZ: number, wallX: number): { x: number; z: number } {
  const ix = 2 * wallX - spkX;
  const t = Math.abs(ix) < 1e-6 ? 0 : wallX / ix;
  return { x: wallX, z: t * spkZ };
}
