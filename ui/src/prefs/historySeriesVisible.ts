/**
 * Persist HistoryChart series visibility toggles (per plugin + series id).
 */
import { DynamicValue } from '@deutschesoft/awml';

const KEY_PREFIX = 'calfnxt.historyVisible.';

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
 */
export function persistedHistoryVisible$(
  pluginId: string,
  seriesId: string,
  defaultVisible: boolean,
): DynamicValue<boolean> {
  const key = storageKey(pluginId, seriesId);
  const dv = DynamicValue.fromConstant(readBool(key, defaultVisible));
  dv.subscribe((on) => writeBool(key, !!on));
  return dv;
}
