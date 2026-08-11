import { DynamicValue } from '@deutschesoft/awml';

/** Shared across all plugins (same WebKit origin / calfnxt://bundle). */
export const SHOW_WIDGET_INFO_KEY = 'calfnxt.showWidgetInfo';

const ROOT_CLASS = 'calfnxt-widget-info-off';

function readStored(): boolean {
  try {
    const raw = localStorage.getItem(SHOW_WIDGET_INFO_KEY);
    if (raw === null) return true;
    return raw === '1' || raw === 'true';
  } catch {
    return true;
  }
}

function writeStored(on: boolean): void {
  try {
    localStorage.setItem(SHOW_WIDGET_INFO_KEY, on ? '1' : '0');
  } catch {
    // ignore quota / private mode
  }
}

function applyRootClass(on: boolean): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle(ROOT_CLASS, !on);
}

/** Header Toggle + CSS gate for WithInfo tips; persisted in localStorage. */
export const showWidgetInfo$ = DynamicValue.fromConstant(readStored());

applyRootClass(showWidgetInfo$.value);
showWidgetInfo$.subscribe((on) => {
  writeStored(on);
  applyRootClass(on);
});
