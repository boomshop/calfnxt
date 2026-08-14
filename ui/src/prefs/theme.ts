import { DynamicValue } from '@deutschesoft/awml';

/** Appearance prefs: day/night surfaces + accent pair (calfnxt / lime / fire / sea). */

export const THEME_MODE_KEY = 'calfnxt.themeMode';
export const THEME_ACCENT_KEY = 'calfnxt.themeAccent';

export type ThemeMode = 'day' | 'night';
export type ThemeAccent = 'calfnxt' | 'lime' | 'fire' | 'sea';

const MODE_CLASSES: ThemeMode[] = ['day', 'night'];
export const ACCENT_CLASSES: ThemeAccent[] = ['calfnxt', 'lime', 'fire', 'sea'];

function preferBrowserMode(): ThemeMode {
  try {
    if (typeof matchMedia === 'function') {
      const light = matchMedia('(prefers-color-scheme: light)');
      if (light.media !== 'not all' && light.matches) return 'day';
      const dark = matchMedia('(prefers-color-scheme: dark)');
      if (dark.media !== 'not all' && dark.matches) return 'night';
    }
  } catch {
    // ignore
  }
  return 'night';
}

function readMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_MODE_KEY);
    if (raw === 'day' || raw === 'night') return raw;
  } catch {
    // ignore
  }
  return preferBrowserMode();
}

function isAccent(v: string | null): v is ThemeAccent {
  return (
    v === 'calfnxt' || v === 'lime' || v === 'fire' || v === 'sea'
  );
}

function readAccent(): ThemeAccent {
  try {
    const raw = localStorage.getItem(THEME_ACCENT_KEY);
    if (isAccent(raw)) return raw;
  } catch {
    // ignore
  }
  // Accent has no OS preference — always brand default until the user cycles.
  return 'calfnxt';
}

function writeMode(mode: ThemeMode): void {
  try {
    localStorage.setItem(THEME_MODE_KEY, mode);
  } catch {
    // ignore
  }
}

function writeAccent(accent: ThemeAccent): void {
  try {
    localStorage.setItem(THEME_ACCENT_KEY, accent);
  } catch {
    // ignore
  }
}

function applyRootClasses(mode: ThemeMode, accent: ThemeAccent): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const c of MODE_CLASSES) root.classList.toggle(c, c === mode);
  for (const c of ACCENT_CLASSES) root.classList.toggle(c, c === accent);
}

export const themeMode$ = DynamicValue.fromConstant<ThemeMode>(readMode());
export const themeAccent$ = DynamicValue.fromConstant<ThemeAccent>(readAccent());

applyRootClasses(themeMode$.value, themeAccent$.value);

themeMode$.subscribe((mode) => {
  writeMode(mode);
  applyRootClasses(mode, themeAccent$.value);
});

themeAccent$.subscribe((accent) => {
  writeAccent(accent);
  applyRootClasses(themeMode$.value, accent);
});

export function toggleThemeMode(): void {
  themeMode$.set(themeMode$.value === 'day' ? 'night' : 'day');
}

/** Cycle calfnxt → lime → fire → sea → calfnxt. */
export function toggleThemeAccent(): void {
  const i = ACCENT_CLASSES.indexOf(themeAccent$.value);
  const next = ACCENT_CLASSES[(i + 1) % ACCENT_CLASSES.length]!;
  themeAccent$.set(next);
}

export function nextThemeAccent(current: ThemeAccent): ThemeAccent {
  const i = ACCENT_CLASSES.indexOf(current);
  return ACCENT_CLASSES[(i + 1) % ACCENT_CLASSES.length]!;
}
