/**
 * Ardour + GTK3 embed tip: host signals when the DAW looks like Ardour and the
 * helper is the XEmbed GtkPlug path. UI may dismiss permanently via localStorage.
 */
import { DynamicValue } from '@deutschesoft/awml';

export const ARDOUR_GUI_TIP_DISMISS_KEY = 'calfnxt.ardourGuiTip.dismissed';

function readDismissed(): boolean {
  try {
    const raw = localStorage.getItem(ARDOUR_GUI_TIP_DISMISS_KEY);
    return raw === '1' || raw === 'true';
  } catch {
    return false;
  }
}

function writeDismissed(on: boolean): void {
  try {
    if (on)
      localStorage.setItem(ARDOUR_GUI_TIP_DISMISS_KEY, '1');
    else
      localStorage.removeItem(ARDOUR_GUI_TIP_DISMISS_KEY);
  } catch {
    // ignore quota / private mode
  }
}

/** Host said Ardour + GTK3 embed (before local dismiss). */
export const ardourGuiTipHost$ = DynamicValue.fromConstant(false);

/** User checked “Don’t show again”. */
export const ardourGuiTipDismissed$ = DynamicValue.fromConstant(readDismissed());

ardourGuiTipDismissed$.subscribe((on) => {
  writeDismissed(!!on);
});

/** Visible in the header when host tip is active and not dismissed. */
export const ardourGuiTipVisible$ = DynamicValue.fromConstant(false);

function recomputeVisible(): void {
  ardourGuiTipVisible$.set(!!ardourGuiTipHost$.value && !ardourGuiTipDismissed$.value);
}

ardourGuiTipHost$.subscribe(recomputeVisible);
ardourGuiTipDismissed$.subscribe(recomputeVisible);
recomputeVisible();

export function setArdourGuiTipFromHost(show: boolean): void {
  ardourGuiTipHost$.set(!!show);
}

export function setArdourGuiTipDismissed(on: boolean): void {
  ardourGuiTipDismissed$.set(!!on);
}
