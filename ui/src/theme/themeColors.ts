import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { DynamicValue } from '@deutschesoft/awml';
import { themeAccent$, themeMode$ } from '../prefs/theme';

/**
 * Resolved theme paints for AUX / SVG (need concrete color strings, not CSS vars).
 * Re-reads from `:root` whenever day/night or accent pair changes.
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
};

const FALLBACK: ThemeColors = {
  color: '#ffffff',
  background: '#000000',
  accent: '#0066ff',
  warn: '#ff0066',
  hot: '#ff6600',
  contrastWarn: '#ffffff',
  contrastAccent: '#ffffff',
};

function cssByte(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
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

function cssVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return concreteColor(v || fallback, fallback);
}

export function readThemeColors(): ThemeColors {
  return {
    color: cssVar('--color', FALLBACK.color),
    background: cssVar('--background', FALLBACK.background),
    accent: cssVar('--color-accent', FALLBACK.accent),
    warn: cssVar('--color-warn', FALLBACK.warn),
    hot: cssVar('--color-hot', FALLBACK.hot),
    contrastWarn: cssVar('--contrast-warn', FALLBACK.contrastWarn),
    contrastAccent: cssVar('--contrast-accent', FALLBACK.contrastAccent),
  };
}

export const themeColors$ = DynamicValue.fromConstant<ThemeColors>(
  readThemeColors(),
);

function refreshThemeColors() {
  // Next frame so classList toggles have applied computed styles.
  requestAnimationFrame(() => {
    themeColors$.set(readThemeColors());
  });
}

themeMode$.subscribe(refreshThemeColors);
themeAccent$.subscribe(refreshThemeColors);

/** Level / MultiMeter fill: silence → 0 dB → clip. */
export function levelMeterGradient(c: ThemeColors) {
  return [
    { value: -96, color: c.accent },
    { value: 0, color: c.warn },
    { value: 12, color: c.hot },
  ];
}

/** MultiMeter object-map gradient form. */
export function levelMeterGradientMap(c: ThemeColors) {
  return {
    '-96': c.accent,
    '0': c.warn,
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
