import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ACCENT_CLASSES,
  setThemeAccent,
  setThemeMode,
  showWidgetInfo$,
  type ThemeAccent,
  type ThemeMode,
} from '@calfnxt/ui';
import { App } from './App';
import '../../ui/src/styles.css';
import './studio.css';

// Mark capture mode before React mounts (LevelMeters skip AUX falling).
(window as Window & { __CALFNXT_STUDIO__?: boolean }).__CALFNXT_STUDIO__ = true;

// Screenshots must never show WithInfo tip bubbles (default is on / localStorage).
showWidgetInfo$.set(false);

function isAccent(v: string | null): v is ThemeAccent {
  return (ACCENT_CLASSES as readonly string[]).includes(v ?? '');
}

function themeFromSearch(): { mode: ThemeMode; accent: ThemeAccent } {
  const q = new URLSearchParams(window.location.search);
  const mode: ThemeMode = q.get('mode') === 'day' ? 'day' : 'night';
  const raw = q.get('accent');
  return { mode, accent: isAccent(raw) ? raw : 'calfnxt' };
}

const initialTheme = themeFromSearch();
setThemeMode(initialTheme.mode);
setThemeAccent(initialTheme.accent);

window.__calfnxtStudioSetTheme = (mode, accent) => {
  setThemeMode(mode);
  setThemeAccent(accent);
};

// Expander history: GR/Trig off for studio shots (matches EXPANDER_HISTORY_TOGGLES).
try {
  localStorage.setItem('calfnxt.historyVisible.expander.gr', '0');
  localStorage.setItem('calfnxt.historyVisible.expander.trigger', '0');
} catch {
  /* ignore */
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
