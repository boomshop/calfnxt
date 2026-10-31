/**
 * Parse `--theme-gradient` and sample an sRGB palette (CSS linear-gradient default).
 *
 * Contract for `--theme-gradient`:
 * - `linear-gradient(...)` only (no radial / repeating)
 * - No `in oklch` / `in hsl` — browser default sRGB between stops
 * - Stops: color + optional `N%`, comma-separated
 * - Colors: `#rgb`/`#rrggbb`, `rgb()`/`rgba()`, `hsl()`/`hsla()`,
 *   `var(--color-accent)`, `var(--color-warn)`
 * - Optional leading direction (`to right`, `90deg`, …) is ignored for sampling
 * - Missing offsets are spaced evenly across 0…1
 */

export type GradientStop = {
  /** 0…1 along the gradient. */
  offset: number;
  /** Concrete `#rrggbb`. */
  color: string;
};

/** Palette CSS steps: `--palette-0` … `--palette-100`. */
export const PALETTE_STEP = 5;

export function paletteSteps(): number[] {
  const out: number[] = [];
  for (let p = 0; p <= 100; p += PALETTE_STEP) out.push(p);
  return out;
}

const STEPS = paletteSteps();

function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      const t = cur.trim();
      if (t) parts.push(t);
      cur = '';
      continue;
    }
    cur += ch;
  }
  const t = cur.trim();
  if (t) parts.push(t);
  return parts;
}

function isDirectionArg(arg: string): boolean {
  const a = arg.trim().toLowerCase();
  if (/^to(\s+\w+){1,3}$/.test(a)) return true;
  if (/^from\b/.test(a)) return true;
  if (/^-?[\d.]+(deg|rad|turn|grad)$/.test(a)) return true;
  if (/^in\s+\w+/.test(a)) return true;
  return false;
}

const COLOR_PREFIX =
  /^(var\(\s*--[\w-]+\s*\)|#[0-9a-fA-F]{3,8}|rgba?\(|hsla?\()/i;

function parseStopArg(
  arg: string,
  resolveVar: (name: string) => string | null,
  concreteColor: (specified: string, fallback: string) => string,
  fallback: string,
): { color: string; offset: number | null } | null {
  const s = arg.trim();
  if (!COLOR_PREFIX.test(s)) return null;

  let colorRaw: string;
  let rest: string;

  if (s.toLowerCase().startsWith('var(')) {
    const m = s.match(/^var\(\s*(--[\w-]+)\s*\)\s*(.*)$/i);
    if (!m) return null;
    const resolved = resolveVar(m[1]!);
    if (!resolved) return null;
    colorRaw = resolved;
    rest = m[2]!.trim();
  } else if (s.startsWith('#')) {
    const m = s.match(/^(#[0-9a-fA-F]{3,8})\s*(.*)$/);
    if (!m) return null;
    colorRaw = m[1]!;
    rest = m[2]!.trim();
  } else {
    const open = s.indexOf('(');
    if (open < 0) return null;
    let depth = 0;
    let close = -1;
    for (let i = open; i < s.length; i++) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') {
        depth--;
        if (depth === 0) {
          close = i;
          break;
        }
      }
    }
    if (close < 0) return null;
    colorRaw = s.slice(0, close + 1);
    rest = s.slice(close + 1).trim();
  }

  const color = concreteColor(colorRaw, fallback);
  let offset: number | null = null;
  if (rest) {
    const om = rest.match(/^([\d.]+)%\s*$/);
    if (!om) return null;
    offset = Math.max(0, Math.min(100, Number(om[1]))) / 100;
  }
  return { color, offset };
}

/**
 * Parse a `--theme-gradient` value into ordered stops.
 * Returns null if the string is not a usable linear-gradient.
 */
export function parseThemeGradient(
  cssValue: string,
  resolveVar: (name: string) => string | null,
  concreteColor: (specified: string, fallback: string) => string,
  fallbackColor: string,
): GradientStop[] | null {
  const raw = cssValue.trim();
  const m = raw.match(/^linear-gradient\s*\(\s*([\s\S]*)\)\s*$/i);
  if (!m) return null;

  const args = splitTopLevel(m[1]!);
  if (!args.length) return null;

  let i = 0;
  if (args[0] && isDirectionArg(args[0])) i = 1;

  const parsed: { color: string; offset: number | null }[] = [];
  for (; i < args.length; i++) {
    const stop = parseStopArg(
      args[i]!,
      resolveVar,
      concreteColor,
      fallbackColor,
    );
    if (!stop) return null;
    parsed.push(stop);
  }
  if (parsed.length < 2) return null;

  const n = parsed.length;
  const offsets = parsed.map((p, idx) => {
    if (p.offset != null) return p.offset;
    if (idx === 0) return 0;
    if (idx === n - 1) return 1;
    return idx / (n - 1);
  });

  let prev = 0;
  const stops: GradientStop[] = [];
  for (let k = 0; k < n; k++) {
    let off = offsets[k]!;
    if (k === 0) off = 0;
    else if (k === n - 1) off = 1;
    else off = Math.max(prev, Math.min(1, off));
    prev = off;
    stops.push({ offset: off, color: parsed[k]!.color });
  }
  stops[0]!.offset = 0;
  stops[n - 1]!.offset = 1;
  return stops;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.trim().match(/^#([0-9a-fA-F]{6})$/);
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function rgbToHex(r: number, g: number, b: number): string {
  const b8 = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${b8(r)}${b8(g)}${b8(b)}`;
}

/** Sample a multi-stop gradient at t∈[0,1] with sRGB lerp (CSS default). */
export function sampleGradient(stops: GradientStop[], t: number): string {
  if (!stops.length) return '#000000';
  if (stops.length === 1) return stops[0]!.color;
  const x = Math.max(0, Math.min(1, t));
  let i = 0;
  while (i < stops.length - 1 && stops[i + 1]!.offset < x) i++;
  const a = stops[i]!;
  const b = stops[Math.min(i + 1, stops.length - 1)]!;
  const span = b.offset - a.offset;
  const u = span <= 1e-9 ? 0 : (x - a.offset) / span;
  const ca = hexToRgb(a.color);
  const cb = hexToRgb(b.color);
  if (!ca || !cb) return a.color;
  return rgbToHex(
    ca[0] + (cb[0] - ca[0]) * u,
    ca[1] + (cb[1] - ca[1]) * u,
    ca[2] + (cb[2] - ca[2]) * u,
  );
}

export type PaletteScale = { readonly [step: number]: string };

export function buildPaletteScale(stops: GradientStop[]): PaletteScale {
  const scale: Record<number, string> = {};
  for (const p of STEPS) {
    scale[p] = sampleGradient(stops, p / 100);
  }
  return scale;
}

export function twoStopGradient(
  accent: string,
  warn: string,
): GradientStop[] {
  return [
    { offset: 0, color: accent },
    { offset: 1, color: warn },
  ];
}

/** Write `--palette-0` … `--palette-100` on `:root`. */
export function injectPaletteVars(scale: PaletteScale): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const p of STEPS) {
    root.style.setProperty(`--palette-${p}`, scale[p] ?? '#000000');
  }
}

/**
 * Look up a palette step (0…100). Snaps to nearest {@link PALETTE_STEP}.
 * Prefer {@link sampleGradient} / {@link paletteAt} for continuous t.
 */
export function paletteStepColor(
  scale: PaletteScale,
  step: number,
  fallback: string,
): string {
  const snapped =
    Math.round(Math.max(0, Math.min(100, step)) / PALETTE_STEP) * PALETTE_STEP;
  return scale[snapped] ?? fallback;
}
