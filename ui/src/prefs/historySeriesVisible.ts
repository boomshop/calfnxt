/**
 * Persist HistoryChart series visibility toggles (per plugin + series id).
 * DVs are cached so remounts / re-attach share one subscription per key.
 */
import { DynamicValue } from '@deutschesoft/awml';
import type { HistorySeries } from '../widgets/HistoryChart/HistoryChart';

const KEY_PREFIX = 'calfnxt.historyVisible.';

const cache = new Map<string, DynamicValue<boolean>>();

function storageKey(pluginId: string, seriesId: string): string {
  return `${KEY_PREFIX}${pluginId}.${seriesId}`;
}

function readBool(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return raw === '1' || raw === 'true';
  } catch {
    return fallback;
  }
}

function writeBool(key: string, on: boolean): void {
  try {
    localStorage.setItem(key, on ? '1' : '0');
  } catch {
    // ignore quota / private mode
  }
}

/**
 * Boolean DV for a history series toggle. Reads/writes
 * `calfnxt.historyVisible.<pluginId>.<seriesId>`.
 * Cached — safe to call every render.
 */
export function persistedHistoryVisible$(
  pluginId: string,
  seriesId: string,
  defaultVisible: boolean,
): DynamicValue<boolean> {
  const key = storageKey(pluginId, seriesId);
  const hit = cache.get(key);
  if (hit) return hit;
  const dv = DynamicValue.fromConstant(readBool(key, defaultVisible));
  dv.subscribe((on) => writeBool(key, !!on));
  cache.set(key, dv);
  return dv;
}

/**
 * Attach legend toggles + localStorage persistence to matching series ids.
 * Other series are left unchanged. Cached DVs — safe every render.
 */
export function attachPersistedHistoryToggles(
  series: HistorySeries[],
  pluginId: string,
  defaults: Readonly<Record<string, boolean>>,
): HistorySeries[] {
  return series.map((s) => {
    if (!Object.prototype.hasOwnProperty.call(defaults, s.id)) return s;
    return {
      ...s,
      visible$: persistedHistoryVisible$(pluginId, s.id, defaults[s.id]!),
      toggle: true,
    };
  });
}

/** Comp / Deesser — Trig off, GR on by default. */
export const DYNAMICS_TRIG_GR_TOGGLES = {
  trigger: false,
  gr: true,
} as const;

/** Expander — Trig and GR off by default (In/Out fills + thresh stay). */
export const EXPANDER_HISTORY_TOGGLES = {
  trigger: false,
  gr: false,
} as const;

/** Limiter — GR on by default (no trigger channel). */
export const LIMITER_HISTORY_TOGGLES = {
  gr: true,
} as const;

/** Analyzer loudness history — all on by default. */
export const ANALYZER_LOUD_TOGGLES = {
  rms: true,
  tp: true,
  mom: true,
  st: true,
} as const;
