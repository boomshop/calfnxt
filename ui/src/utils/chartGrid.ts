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

/** Axis / handle time labels (ms → `250`, `−8`, or `1.5s`). */
export function formatTimeLabel(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  const neg = ms < 0;
  const a = Math.abs(ms);
  let body: string;
  if (a >= 1000) {
    const s = a / 1000;
    body = Number.isInteger(s) ? `${s}s` : `${s.toFixed(1)}s`;
  } else {
    body = `${Math.round(a)}`;
  }
  return neg ? `−${body}` : body;
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

/** Adaptive ms step for short hit windows (Aligner ~24…240 ms). */
export function shortTimeGridStepMs(spanMs: number): number {
  const span = Math.max(8, spanMs);
  if (span >= 200) return 50;
  if (span >= 120) return 25;
  if (span >= 64) return 20;
  if (span >= 40) return 10;
  if (span >= 24) return 5;
  return 4;
}

export type BipolarTimeGridOpts = {
  stepMs?: number;
  majorClass?: string;
  zeroClass?: string;
  /** Label every step (default: 0 + every 2nd step). */
  labelEvery?: boolean;
};

/**
 * Vertical time grid for axes that cross zero (e.g. AlignWave −preMs…+postMs).
 * `0` is always the hit / sync mark.
 */
export function buildBipolarTimeGridX(
  minMs: number,
  maxMs: number,
  opts: BipolarTimeGridOpts = {},
): ChartGridLine[] {
  const lo = Math.min(minMs, maxMs);
  const hi = Math.max(minMs, maxMs);
  const span = Math.max(1e-6, hi - lo);
  const step = Math.max(1e-6, opts.stepMs ?? shortTimeGridStepMs(span));
  const majorClass = opts.majorClass ?? 'major';
  const zeroClass = opts.zeroClass ?? 'base';
  const labelEvery = !!opts.labelEvery;
  const lines: ChartGridLine[] = [];
  const start = Math.ceil(lo / step - 1e-9) * step;
  for (let t = start; t <= hi + 1e-6; t += step) {
    const pos = Math.round(t);
    if (pos < lo - 1e-6 || pos > hi + 1e-6) continue;
    const atZero = pos === 0;
    const stepIndex = Math.round(pos / step);
    const major = labelEvery || atZero || stepIndex % 2 === 0;
    const parts: string[] = [];
    if (major && majorClass) parts.push(majorClass);
    if (atZero && zeroClass) parts.push(zeroClass);
    lines.push({
      pos,
      ...(major ? { label: formatTimeLabel(pos) } : {}),
      ...(parts.length ? { class: parts.join(' ') } : {}),
    });
  }
  if (!lines.some((l) => l.pos === 0) && lo <= 0 && hi >= 0) {
    lines.push({
      pos: 0,
      label: '0',
      class: [majorClass, zeroClass].filter(Boolean).join(' '),
    });
    lines.sort((a, b) => a.pos - b.pos);
  }
  return lines;
}
