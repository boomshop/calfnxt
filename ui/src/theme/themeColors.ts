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
 * Continuous sample of the theme gradient at t∈[0,1].
 * Use for chart strokes / N knobs in a row without a discrete class.
 */
export function paletteAt(
  t: number,
  colors: ThemeColors = themeColors$.value,
): string {
  return sampleGradient(colors.gradientStops, t);
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

/** Level / MultiMeter fill: silence → 0 dB → clip. */
export function levelMeterGradient(c: ThemeColors) {
  return [
    { value: -96, color: c.accent },
    { value: 0, color: c.warn },
    { value: 0.01, color: c.hot },
    { value: 12, color: c.hot },
  ];
}

/** MultiMeter object-map gradient form. */
export function levelMeterGradientMap(c: ThemeColors) {
  return {
    '-96': c.accent,
    '0': c.warn,
    '0.01': c.hot,
    '12': c.hot,
  };
}

/** GR meters (0…N dB amount). */
export function grMeterGradient(c: ThemeColors, max = 60) {
  return [
    { value: 0, color: c.accent },
    { value: max, color: c.warn },
  ];
}

/** Band level meters (−60…0 style). */
export function bandLevelGradient(c: ThemeColors) {
  return [
    { value: -60, color: c.accent },
    { value: 0, color: c.warn },
  ];
}

/**
 * Pick a level/GR gradient from the meter range.
 * GR meters use min ≥ 0; short ≤0 ranges use band ends; else full peak meter.
 */
export function meterGradientForRange(
  c: ThemeColors,
  min: number,
  max: number,
) {
  if (min >= 0) return grMeterGradient(c, max);
  if (max <= 0) {
    return [
      { value: min, color: c.accent },
      { value: max, color: c.warn },
    ];
  }
  return levelMeterGradient(c);
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
