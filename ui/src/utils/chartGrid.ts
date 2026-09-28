/** Shared AUX Chart dB-Y / time-X grid builders. */

export type ChartGridLine = {
  pos: number;
  label?: string;
  class?: string;
};

export type DbGridOpts = {
  majorClass?: string;
  minorClass?: string;
  zeroClass?: string;
  /** Label every tick (not only majors). */
  labelEvery?: boolean;
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
  const labelEvery = !!opts.labelEvery;
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
      ...(major || labelEvery ? { label: `${db}` } : {}),
      ...(cls ? { class: cls } : {}),
    });
  }
  return lines;
}

export type TimeGridOpts = {
  stepMs?: number;
  majorClass?: string;
  everyClass?: string;
  labelEvery?: boolean;
  /** History scrolls right→left (default). Impulse grows left→right. */
  ascending?: boolean;
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
  const ascending = !!opts.ascending;
  const lines: ChartGridLine[] = [];
  if (ascending) {
    const span = Math.max(step, displayMs);
    for (let t = 0; t <= span + 1e-6; t += step) {
      const pos = Math.round(t);
      const major =
        labelEvery || pos === 0 || pos % (step * 2) === 0;
      const cls = everyClass ?? (major ? majorClass : undefined);
      lines.push({
        pos,
        ...(major ? { label: formatTimeLabel(pos) } : {}),
        ...(cls ? { class: cls } : {}),
      });
    }
    return lines;
  }
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

/** Adaptive ms step for forward time axes (Impulse). */
export function timeGridStepMs(spanMs: number): number {
  const span = Math.max(100, spanMs);
  if (span >= 8000) return 2000;
  if (span >= 4000) return 1000;
  if (span >= 2000) return 500;
  return 250;
}
