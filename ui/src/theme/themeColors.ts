import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { DynamicValue } from '@deutschesoft/awml';
import { themeAccent$, themeMode$ } from '../prefs/theme';
import {
  buildPaletteScale,
  injectPaletteVars,
  parseThemeGradient,
  paletteStepColor,
  sampleGradient,
  twoStopGradient,
  type GradientStop,
  type PaletteScale,
} from './themeGradient';

/**
 * Resolved theme paints for AUX / SVG (need concrete color strings, not CSS vars).
 * Re-reads from `:root` whenever day/night or accent pair changes.
 *
 * Also samples `--theme-gradient` into `--palette-0…100` (sRGB) for opt-in
 * `.palette-*` classes and {@link paletteAt} / {@link paletteStep}.
 */

export type ThemeColors = {
  /** Primary text / FG (`--color`). */
  color: string;
  /** Page / panel surface (`--background`) — AUX meter empty-mask. */
  background: string;
  accent: string;
  warn: string;
  /** Hot / clip tip (peak end of level meters). */
  hot: string;
  contrastWarn: string;
  contrastAccent: string;
  /** Parsed `--theme-gradient` stops (hex). */
  gradientStops: GradientStop[];
  /** Discrete palette from the theme gradient (`0,5,…,100`). */
  palette: PaletteScale;
};

const FALLBACK_STOPS = twoStopGradient('#0066ff', '#ff0066');
const FALLBACK_PALETTE = buildPaletteScale(FALLBACK_STOPS);

const FALLBACK: ThemeColors = {
  color: '#ffffff',
  background: '#000000',
  accent: '#0066ff',
  warn: '#ff0066',
  hot: '#ff6600',
  contrastWarn: '#ffffff',
  contrastAccent: '#ffffff',
  gradientStops: FALLBACK_STOPS,
  palette: FALLBACK_PALETTE,
};

function cssByte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
}

let colorProbe: HTMLSpanElement | null = null;

/**
 * Custom properties keep the authored form (`hsl(...)`). Canvas pixels need
 * a concrete sRGB hex, so resolve through the browser once per read.
 */
function concreteColor(specified: string, fallback: string): string {
  const v = specified.trim();
  if (!v) return fallback;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const s = v.slice(1);
    return `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`.toLowerCase();
  }
  if (typeof document === 'undefined') return fallback;
  if (!colorProbe) {
    colorProbe = document.createElement('span');
    colorProbe.hidden = true;
    document.documentElement.appendChild(colorProbe);
  }
  colorProbe.style.color = fallback;
  colorProbe.style.color = v;
  const computed = getComputedStyle(colorProbe).color;
  const m = computed.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (!m) return fallback;
  return `#${cssByte(Number(m[1]))}${cssByte(Number(m[2]))}${cssByte(Number(m[3]))}`;
}

function cssVarRaw(name: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

function cssVar(name: string, fallback: string): string {
  return concreteColor(cssVarRaw(name) || fallback, fallback);
}

function readGradient(
  accent: string,
  warn: string,
): { stops: GradientStop[]; palette: PaletteScale } {
  const fallbackStops = twoStopGradient(accent, warn);
  const raw = cssVarRaw('--theme-gradient');
  const resolveVar = (name: string): string | null => {
    if (name === '--color-accent') return accent;
    if (name === '--color-warn') return warn;
    const v = cssVarRaw(name);
    if (!v) return null;
    return concreteColor(v, accent);
  };
  const parsed = raw
    ? parseThemeGradient(raw, resolveVar, concreteColor, accent)
    : null;
  const stops = parsed ?? fallbackStops;
  return { stops, palette: buildPaletteScale(stops) };
}

export function readThemeColors(): ThemeColors {
  const accent = cssVar('--color-accent', FALLBACK.accent);
  const warn = cssVar('--color-warn', FALLBACK.warn);
  const { stops, palette } = readGradient(accent, warn);
  injectPaletteVars(palette);
  return {
    color: cssVar('--color', FALLBACK.color),
    background: cssVar('--background', FALLBACK.background),
    accent,
    warn,
    hot: cssVar('--color-hot', FALLBACK.hot),
    contrastWarn: cssVar('--contrast-warn', FALLBACK.contrastWarn),
    contrastAccent: cssVar('--contrast-accent', FALLBACK.contrastAccent),
    gradientStops: stops,
    palette,
  };
}

export const themeColors$ =
  DynamicValue.fromConstant<ThemeColors>(readThemeColors());

function refreshThemeColors() {
  // Next frame so classList toggles have applied computed styles.
  requestAnimationFrame(() => {
    themeColors$.set(readThemeColors());
  });
}

themeMode$.subscribe(refreshThemeColors);
themeAccent$.subscribe(refreshThemeColors);

// Vite CSS HMR updates `:root` vars without re-running this module — re-sample
// so charts / `--palette-*` pick up mid-stop edits without a theme toggle.
if (import.meta.hot) {
  import.meta.hot.on('vite:afterUpdate', () => refreshThemeColors());
}

/**
 * Authored `--theme-gradient` stops (fallback accent→warn).
 * Prefer this over hardcoding palette-50 when building chart/meter ramps.
 */
export function themeGradientStops(
  c: ThemeColors = themeColors$.value,
): GradientStop[] {
  return c.gradientStops.length
    ? c.gradientStops
    : [
        { offset: 0, color: c.accent },
        { offset: 1, color: c.warn },
      ];
}

/**
 * Continuous sample of the theme gradient at t∈[0,1].
 * Use for chart strokes / N knobs in a row without a discrete class.
 */
export function paletteAt(
  t: number,
  colors: ThemeColors = themeColors$.value,
): string {
  return sampleGradient(themeGradientStops(colors), t);
}

/**
 * Discrete palette step (0…100, snapped to 5). Same as `var(--palette-N)`.
 */
export function paletteStep(
  step: number,
  colors: ThemeColors = themeColors$.value,
): string {
  return paletteStepColor(colors.palette, step, colors.accent);
}

export type MeterGradientStop = { value: number; color: string };

/**
 * AUX scale options that affect where a gradient stop lands on the bar.
 * Matches `Range` / `makeLogarithmicTransformation` in aux-widgets.
 */
export type MeterScaleOpts = {
  /** `linear` | `decibel` | `log2` (default `linear`). */
  scale?: string;
  /** AUX `log_factor` (default 1). */
  log_factor?: number;
};

/**
 * AUX `coefToDB` (audiomath.js). `trafoReverse` is the scale's built-in
 * flip: `decibel` → true, `log2` → false.
 */
function auxCoefToDB(
  coef: number,
  min: number,
  max: number,
  trafoReverse: boolean,
  factor: number,
): number {
  let c = coef;
  let f = factor;
  let logfac = 1;
  if (f === 0) f = 1;
  else logfac = Math.max(1, 2 ** f - 1);
  if (trafoReverse) c = 1 - c;
  let v = ((2 ** (c * f) - 1) / logfac) * (max - min) + min;
  if (trafoReverse) v = max - v + min;
  return v;
}

/**
 * Value at visual coefficient `coef`∈[0,1] for an AUX meter scale.
 * Theme offset 0.5 → visual mid (e.g. ~−25 dB on −96…0 decibel/3,
 * ~9 dB GR on 0…60 log2/5, ~−15 dB on −60…0 decibel/3).
 */
export function meterValueAtVisualCoef(
  coef: number,
  min: number,
  max: number,
  opts: MeterScaleOpts = {},
): number {
  const t = Math.max(0, Math.min(1, coef));
  const scale = opts.scale ?? 'linear';
  const factor = opts.log_factor ?? 1;
  // Ignore widget `reverse`: colours bind to values (0 GR = accent, max =
  // warn). Reverse only flips AUX fill/mask direction, not the stop map.
  if (scale === 'decibel') return auxCoefToDB(t, min, max, true, factor);
  if (scale === 'log2') return auxCoefToDB(t, min, max, false, factor);
  return min + t * (max - min);
}

/**
 * Map `--theme-gradient` stops onto a meter value range so colours track the
 * *visual* scale (AUX log/decibel), not linear dB.
 */
export function meterStopsFromTheme(
  c: ThemeColors,
  min: number,
  max: number,
  opts: MeterScaleOpts = {},
): MeterGradientStop[] {
  return themeGradientStops(c)
    .map((s) => ({
      value: meterValueAtVisualCoef(s.offset, min, max, opts),
      color: s.color,
    }))
    .sort((a, b) => a.value - b.value);
}

function meterStopsToMap(
  stops: MeterGradientStop[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of stops) out[String(s.value)] = s.color;
  return out;
}

/**
 * Peak level fill: theme over silence→0 dB (scale-aware), then hot clip tip
 * through `max` (default 12).
 */
export function levelMeterGradient(
  c: ThemeColors,
  opts: MeterScaleOpts & { min?: number; max?: number } = {},
): MeterGradientStop[] {
  const min = opts.min ?? -96;
  const max = opts.max ?? 12;
  return [
    ...meterStopsFromTheme(c, min, 0, opts),
    { value: 0.01, color: c.hot },
    { value: max, color: c.hot },
  ];
}

/** MultiMeter object-map gradient form. */
export function levelMeterGradientMap(
  c: ThemeColors,
  opts: MeterScaleOpts & { min?: number; max?: number } = {},
): Record<string, string> {
  return meterStopsToMap(levelMeterGradient(c, opts));
}

/** GR meters (0…N dB amount) — theme stops across the GR span. */
export function grMeterGradient(
  c: ThemeColors,
  max = 60,
  opts: MeterScaleOpts = {},
): MeterGradientStop[] {
  return meterStopsFromTheme(c, 0, max, opts);
}

/** Band level meters (−60…0 style). */
export function bandLevelGradient(
  c: ThemeColors,
  opts: MeterScaleOpts = {},
): MeterGradientStop[] {
  return meterStopsFromTheme(c, -60, 0, opts);
}

/**
 * Pick a level/GR gradient from the meter range + AUX scale.
 * GR: min ≥ 0; band: max ≤ 0; else peak (theme → 0 dB, hot above).
 */
export function meterGradientForRange(
  c: ThemeColors,
  min: number,
  max: number,
  opts: MeterScaleOpts = {},
): MeterGradientStop[] {
  if (min >= 0) return meterStopsFromTheme(c, min, max, opts);
  if (max <= 0) return meterStopsFromTheme(c, min, max, opts);
  return levelMeterGradient(c, { ...opts, min, max });
}

export function useThemeColors(): ThemeColors {
  return useDynamicValueReadonly(themeColors$, FALLBACK);
}

export type { GradientStop, PaletteScale } from './themeGradient';
export {
  PALETTE_STEP,
  paletteSteps,
  sampleGradient,
} from './themeGradient';
