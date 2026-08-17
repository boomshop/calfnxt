/** Port of Calf / calfNXT `SimpleLfo.getValueFromPhase` for UI charts. */

export type SimpleLfoMode = 0 | 1 | 2 | 3 | 4;

export function pulseWidthFromEnum(pw: number): number {
  switch (Math.round(pw)) {
    case 0:
      return 0.125;
    case 1:
      return 0.25;
    case 2:
      return 0.5;
    case 4:
      return 2;
    default:
      return 1;
  }
}

export function lfoValueFromPhase(
  phase: number,
  mode: number,
  offset: number,
  amount: number,
  pulseWidth: number,
): number {
  const pw = Math.min(1.99, Math.max(0.01, pulseWidth));
  let phs = Math.min(100, phase / pw + offset);
  if (phs > 1) phs = phs % 1;
  let val = 0;
  switch (Math.round(mode)) {
    default:
    case 0: // sine
      val = Math.sin(phs * 2 * Math.PI);
      break;
    case 1: // triangle
      if (phs > 0.75) val = (phs - 0.75) * 4 - 1;
      else if (phs > 0.5) val = (phs - 0.5) * 4 * -1;
      else if (phs > 0.25) val = 1 - (phs - 0.25) * 4;
      else val = phs * 4;
      break;
    case 2: // square
      val = phs < 0.5 ? -1 : 1;
      break;
    case 3: // saw up
      val = phs * 2 - 1;
      break;
    case 4: // saw down
      val = 1 - phs * 2;
      break;
  }
  return val * amount;
}

export function sampleLfoWave(
  mode: number,
  offset: number,
  amount: number,
  pulseWidth: number,
  points = 128,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const n = Math.max(2, points);
  for (let i = 0; i < n; ++i) {
    const x = i / (n - 1);
    out.push({
      x,
      y: lfoValueFromPhase(x, mode, offset, amount, pulseWidth),
    });
  }
  return out;
}
