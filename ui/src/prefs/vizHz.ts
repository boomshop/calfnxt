/**
 * Suite-wide editor viz flush rate (meters / spectrum / charts).
 * Persisted like theme; pushed to the host via `{t:"vizhz",hz}`.
 */
import { DynamicValue } from '@deutschesoft/awml';
import { postToHost } from '../utils/bridge';

export const VIZ_HZ_KEY = 'calfnxt.vizHz';

/** Allowed UI rates (Hz). Default 30 matches WebEditor shipping. */
export const VIZ_HZ_OPTIONS = [10, 15, 20, 25, 30] as const;
export type VizHz = (typeof VIZ_HZ_OPTIONS)[number];

function isVizHz(v: number): v is VizHz {
  return (VIZ_HZ_OPTIONS as readonly number[]).includes(v);
}

function readVizHz(): VizHz {
  try {
    const raw = localStorage.getItem(VIZ_HZ_KEY);
    const n = raw != null ? Number(raw) : NaN;
    if (Number.isFinite(n) && isVizHz(Math.round(n)))
      return Math.round(n) as VizHz;
  } catch {
    // ignore
  }
  return 30;
}

function writeVizHz(hz: VizHz): void {
  try {
    localStorage.setItem(VIZ_HZ_KEY, String(hz));
  } catch {
    // ignore
  }
}

export const vizHz$ = DynamicValue.fromConstant<number>(readVizHz());

vizHz$.subscribe((hz) => {
  if (typeof hz !== 'number' || !Number.isFinite(hz)) return;
  const clamped = Math.max(5, Math.min(60, Math.round(hz)));
  if (isVizHz(clamped)) writeVizHz(clamped);
  postToHost({ t: 'vizhz', hz: clamped });
}, false);

/** Call once at SPA boot so the host picks up the saved rate. */
export function syncVizHzToHost(): void {
  const hz = vizHz$.value;
  if (typeof hz === 'number' && Number.isFinite(hz))
    postToHost({ t: 'vizhz', hz: Math.max(5, Math.min(60, Math.round(hz))) });
}

export function setVizHz(hz: number): void {
  const clamped = Math.round(hz);
  if (isVizHz(clamped)) vizHz$.set(clamped);
}
