/**
 * Room EQ Wizard "Export filter settings as text" (and the formatted variant).
 * Each enabled filter becomes one equalizer band. Coefficient files are not read.
 */

export type RewBandType =
  | 'parametric'
  | 'lowshelf'
  | 'highshelf'
  | 'lowpass'
  | 'highpass'
  | 'bandpass';

export type RewSlope = 12 | 24 | 36 | 48;

export interface RewBand {
  type: RewBandType;
  freq: number;
  gain: number;
  q: number;
  slope: RewSlope;
}

export interface RewImport {
  ok: boolean;
  bands: RewBand[];
  summary: string;
}

const BAND_LIMIT = 16;
const FREQ_MIN = 20;
const FREQ_MAX = 20000;
const GAIN_MIN = -36;
const GAIN_MAX = 36;
const Q_MIN = 0.1;
const Q_MAX = 30;

const FILTER_LINE = /Filter\s+\d+\s*:\s*(ON|OFF)\b(.*)$/i;

interface ParseStats {
  bands: RewBand[];
  notch: number;
  allpass: number;
  other: number;
  truncated: number;
  clamped: boolean;
}

function parseNum(raw: string): number {
  const t = raw.trim();
  const n = t.includes('.')
    ? Number(t.replace(/,/g, ''))
    : Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : Number.NaN;
}

function numberAfter(text: string, re: RegExp): number | null {
  const m = text.match(re);
  if (!m) return null;
  const n = parseNum(m[1] ?? '');
  return Number.isFinite(n) ? n : null;
}

/** REW bandwidth is octaves. Q matches the RBJ octave-bandwidth relation. */
function qFromBwOct(bw: number): number | null {
  if (!(bw > 0)) return null;
  const s = Math.sinh((Math.LN2 / 2) * bw);
  if (!(s > 0)) return null;
  return 1 / (2 * s);
}

function defaultQ(type: RewBandType): number {
  return type === 'parametric' || type === 'bandpass' ? 1 : 0.707;
}

function slopeFromType(typeText: string): RewSlope {
  const m = typeText.match(/\b(12|24|36|48)\s*dB\b/i);
  if (!m) return 12;
  const n = Number(m[1]);
  if (n === 24 || n === 36 || n === 48) return n;
  return 12;
}

function mapType(
  raw: string,
): RewBandType | 'notch' | 'allpass' | 'skip' | 'unknown' {
  const t = raw
    .toUpperCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t === 'NONE') return 'skip';
  if (/^(PK|PA|PEAK|PARA|PARAMETRIC)\b/.test(t)) return 'parametric';
  if (/^(LS|LOW SHELF|LOWSHELF)\b/.test(t)) return 'lowshelf';
  if (/^(HS|HIGH SHELF|HIGHSHELF)\b/.test(t)) return 'highshelf';
  if (/^(LP|LPQ|LOW PASS|LOWPASS)\b/.test(t)) return 'lowpass';
  if (/^(HP|HPQ|HIGH PASS|HIGHPASS)\b/.test(t)) return 'highpass';
  if (/^(BP|BAND PASS|BANDPASS)\b/.test(t)) return 'bandpass';
  if (/^(NO|NOTCH)\b/.test(t)) return 'notch';
  if (/^(AP|ALLPASS|ALL PASS)\b/.test(t)) return 'allpass';
  return 'unknown';
}

function pushBand(
  stats: ParseStats,
  type: RewBandType,
  freq: number | null,
  gain: number | null,
  q: number | null,
  slope: RewSlope,
): void {
  if (freq === null || !(freq > 0)) {
    stats.other += 1;
    return;
  }
  if (stats.bands.length >= BAND_LIMIT) {
    stats.truncated += 1;
    return;
  }
  const useGain = type === 'lowpass' || type === 'highpass' ? 0 : (gain ?? 0);
  const fc = clamp(freq, FREQ_MIN, FREQ_MAX, stats);
  const g = clamp(useGain, GAIN_MIN, GAIN_MAX, stats);
  const qv = clamp(q ?? defaultQ(type), Q_MIN, Q_MAX, stats);
  stats.bands.push({ type, freq: fc, gain: g, q: qv, slope });
}

function clamp(n: number, min: number, max: number, stats: ParseStats): number {
  if (n < min) {
    stats.clamped = true;
    return min;
  }
  if (n > max) {
    stats.clamped = true;
    return max;
  }
  return n;
}

function consider(
  stats: ParseStats,
  on: boolean,
  typeText: string,
  freq: number | null,
  gain: number | null,
  q: number | null,
): void {
  if (!on) return;
  const kind = mapType(typeText);
  if (kind === 'skip') return;
  if (kind === 'notch') {
    stats.notch += 1;
    return;
  }
  if (kind === 'allpass') {
    stats.allpass += 1;
    return;
  }
  if (kind === 'unknown') {
    stats.other += 1;
    return;
  }
  pushBand(stats, kind, freq, gain, q, slopeFromType(typeText));
}

function qFromTail(tail: string): number | null {
  const q = numberAfter(tail, /\bQ\s*([+-]?\d+(?:[.,]\d+)?)/i);
  if (q !== null) return q;
  const bw60 = numberAfter(tail, /BW\/60\s*([+-]?\d+(?:[.,]\d+)?)/i);
  if (bw60 !== null) return qFromBwOct(bw60 / 60);
  const bwOct = numberAfter(tail, /BW\/oct\s*([+-]?\d+(?:[.,]\d+)?)/i);
  if (bwOct !== null) return qFromBwOct(bwOct);
  const bw = numberAfter(tail, /\bBW\s*([+-]?\d+(?:[.,]\d+)?)/i);
  if (bw !== null) return qFromBwOct(bw);
  return null;
}

function parseFilterLines(text: string, stats: ParseStats): boolean {
  let found = false;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(FILTER_LINE);
    if (!m) continue;
    found = true;
    const on = (m[1] ?? '').toUpperCase() === 'ON';
    const rest = m[2] ?? '';
    const fcAt = rest.search(/\bFc\b/i);
    const typeText = (fcAt >= 0 ? rest.slice(0, fcAt) : rest).trim();
    const tail = fcAt >= 0 ? rest.slice(fcAt) : '';
    consider(
      stats,
      on,
      typeText,
      numberAfter(tail, /\bFc\s*([+-]?\d+(?:[.,]\d+)?)/i),
      numberAfter(tail, /\bGain\s*([+-]?\d+(?:[.,]\d+)?)/i),
      qFromTail(tail),
    );
  }
  return found;
}

/** Split on a delimiter, keeping commas inside quoted fields. */
function splitQuoted(line: string, delim: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let quote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i] ?? '';
    if (quote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else quote = false;
      } else cur += c;
      continue;
    }
    if (c === '"') {
      quote = true;
      continue;
    }
    if (c === delim) {
      cells.push(cur.trim());
      cur = '';
      continue;
    }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

function splitDelimited(line: string): { delim: string; cells: string[] } | null {
  const delim = line.includes('\t')
    ? '\t'
    : line.includes(';')
      ? ';'
      : line.includes(',')
        ? ','
        : '';
  if (!delim) return null;
  return { delim, cells: splitQuoted(line, delim) };
}

function headerCol(
  cells: string[],
  kind: 'type' | 'freq' | 'gain' | 'q' | 'bw' | 'on',
): number {
  return cells.findIndex((c) => {
    const s = c.trim().toLowerCase();
    if (kind === 'type') return /^type\b/.test(s);
    if (kind === 'freq') return /^(fc|freq|frequency)\b/.test(s);
    if (kind === 'gain') return /^gain\b/.test(s);
    if (kind === 'q') return /^q\b/.test(s);
    if (kind === 'bw') return /^(bw|bandwidth)\b/.test(s);
    return /^(on|enabled|enable)\b/.test(s);
  });
}

function enabledCell(raw: string | undefined): boolean {
  if (raw === undefined) return true;
  const s = raw.trim().toLowerCase();
  if (!s) return true;
  if (s === 'off' || s === 'false' || s === 'no' || s === '0') return false;
  return true;
}

function parseTable(text: string, stats: ParseStats): boolean {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const split = splitDelimited(lines[i] ?? '');
    if (!split) continue;
    const typeCol = headerCol(split.cells, 'type');
    const freqCol = headerCol(split.cells, 'freq');
    if (typeCol < 0 || freqCol < 0) continue;
    const gainCol = headerCol(split.cells, 'gain');
    const qCol = headerCol(split.cells, 'q');
    const bwCol = headerCol(split.cells, 'bw');
    const onCol = headerCol(split.cells, 'on');
    for (let r = i + 1; r < lines.length; r++) {
      const rowLine = lines[r] ?? '';
      if (!rowLine.trim()) continue;
      if (!rowLine.includes(split.delim)) break;
      const cells = splitQuoted(rowLine, split.delim);
      const typeText = cells[typeCol] ?? '';
      if (!typeText || /^type$/i.test(typeText)) continue;
      const freq = parseNum(cells[freqCol] ?? '');
      const gain = gainCol >= 0 ? parseNum(cells[gainCol] ?? '') : Number.NaN;
      let q: number | null = null;
      if (qCol >= 0) {
        const qn = parseNum(cells[qCol] ?? '');
        if (Number.isFinite(qn)) q = qn;
      }
      if (q === null && bwCol >= 0) {
        const bw = parseNum(cells[bwCol] ?? '');
        if (Number.isFinite(bw)) q = qFromBwOct(bw);
      }
      consider(
        stats,
        enabledCell(onCol >= 0 ? cells[onCol] : undefined),
        typeText,
        Number.isFinite(freq) ? freq : null,
        Number.isFinite(gain) ? gain : null,
        q,
      );
    }
    return true;
  }
  return false;
}

function summaryFor(stats: ParseStats, found: boolean): RewImport {
  if (!found) {
    return {
      ok: false,
      bands: [],
      summary:
        'No REW filters in that file. In REW use Export filter settings as text.',
    };
  }
  if (stats.bands.length === 0) {
    const why: string[] = [];
    if (stats.notch) why.push('notch');
    if (stats.allpass) why.push('allpass');
    if (why.length)
      return {
        ok: false,
        bands: [],
        summary: `Nothing to load. ${why.join(' and ')} filters are not on this EQ.`,
      };
    return {
      ok: false,
      bands: [],
      summary: 'No enabled filters in that file.',
    };
  }
  const parts = [
    `Loaded ${stats.bands.length} band${stats.bands.length === 1 ? '' : 's'}.`,
  ];
  if (stats.notch) parts.push('Notch filters were left out.');
  if (stats.allpass) parts.push('Allpass filters were left out.');
  if (stats.other) parts.push('Some rows were left out.');
  if (stats.truncated)
    parts.push(`${stats.truncated} did not fit in the 16 bands.`);
  if (stats.clamped) parts.push('Some values were limited to this EQ.');
  return { ok: true, bands: stats.bands, summary: parts.join(' ') };
}

/** Parse a REW filter-settings text file. */
export function importRewText(text: string): RewImport {
  const stats: ParseStats = {
    bands: [],
    notch: 0,
    allpass: 0,
    other: 0,
    truncated: 0,
    clamped: false,
  };
  if (parseFilterLines(text, stats)) return summaryFor(stats, true);
  if (parseTable(text, stats)) return summaryFor(stats, true);
  return summaryFor(stats, false);
}

function looksLikeUtf16(bytes: Uint8Array): boolean {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return true;
  const n = Math.min(bytes.length, 512);
  let oddNul = 0;
  for (let i = 1; i < n; i += 2) if (bytes[i] === 0) oddNul += 1;
  return oddNul > n * 0.2;
}

/** Decode a chosen file. Binary REW .req files are refused. */
export function importRewFile(bytes: Uint8Array): RewImport {
  let view = bytes;
  if (
    view.length >= 3 &&
    view[0] === 0xef &&
    view[1] === 0xbb &&
    view[2] === 0xbf
  )
    view = view.subarray(3);
  let end = view.length;
  while (end > 0 && view[end - 1] === 0) end -= 1;
  view = view.subarray(0, end);
  const n = Math.min(view.length, 512);
  let nul = 0;
  for (let i = 0; i < n; i++) if (view[i] === 0) nul += 1;
  if (nul > 0 && !looksLikeUtf16(view)) {
    return {
      ok: false,
      bands: [],
      summary:
        'That file is not text. In REW use Export filter settings as text.',
    };
  }
  const text = new TextDecoder(looksLikeUtf16(view) ? 'utf-16le' : 'utf-8').decode(
    view,
  );
  return importRewText(text);
}

export function importRewBase64(b64: string): RewImport {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return importRewFile(bytes);
}
