/**
 * Shared AUX Chart grid builders (dB Y / time X).
 *
 * Class names stay chart-specific via opts — History uses `major`, Envelope
 * uses `env-grid-*`, Spectrum marks 0 dB as `base`.
 */

export type ChartGridLine = {
  pos: number;
  label?: string;
  class?: string;
};

export type DbGridOpts = {
  /** Class on major (label) lines. Default `"major"`. */
  majorClass?: string;
  /** Class on minor lines. Default omitted. */
  minorClass?: string;
  /** Extra class on the 0 dB line (Spectrum). */
  zeroClass?: string;
};

export function buildDbGridY(
  min: number,
  max: number,
  step: number,
  labelStep: number,
  opts: DbGridOpts = {},
): ChartGridLine[] {
  const majorClass = opts.majorClass ?? 'major';
  const minorClass = opts.minorClass;
  const zeroClass = opts.zeroClass;
  const lines: ChartGridLine[] = [];
  const start = Math.ceil(min / step) * step;
  for (let db = start; db <= max; db += step) {
    const major = db % labelStep === 0;
    const parts: string[] = [];
    if (major && majorClass) parts.push(majorClass);
    if (!major && minorClass) parts.push(minorClass);
    if (zeroClass && db === 0) parts.push(zeroClass);
    const cls = parts.join(' ').trim();
    lines.push({
      pos: db,
      ...(major ? { label: `${db}` } : {}),
      ...(cls ? { class: cls } : {}),
    });
  }
  return lines;
}

export type TimeGridOpts = {
  stepMs?: number;
  /** Class on labeled majors. Default `"major"`. */
  majorClass?: string;
  /** Class on every line (Envelope labels all ticks). */
  everyClass?: string;
  /** When true, label every tick (Envelope). Default: majors only. */
  labelEvery?: boolean;
};

function formatTimeLabel(ms: number): string {
  if (ms >= 1000) {
    const s = ms / 1000;
    return Number.isInteger(s) ? `${s}s` : `${s}s`;
  }
  return `${Math.round(ms)}`;
}

export function buildTimeGridX(
  displayMs: number,
  opts: TimeGridOpts = {},
): ChartGridLine[] {
  const step = opts.stepMs ?? 1000;
  const majorClass = opts.majorClass ?? 'major';
  const everyClass = opts.everyClass;
  const labelEvery = !!opts.labelEvery;
  const lines: ChartGridLine[] = [];
  for (let t = displayMs; t >= -1e-9; t -= step) {
    const pos = Math.round(t);
    const major =
      labelEvery ||
      pos === 0 ||
      pos === displayMs ||
      pos % (step * 2) === 0;
    const cls = everyClass ?? (major ? majorClass : undefined);
    lines.push({
      pos,
      ...(major || labelEvery ? { label: formatTimeLabel(pos) } : {}),
      ...(cls ? { class: cls } : {}),
    });
  }
  return lines;
}
