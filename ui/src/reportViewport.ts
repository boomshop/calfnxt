import { postToHost } from './bridge';

export type DesignSize = { width: number; height: number };

/** Once: report CSS viewport so the native editor can scale the host window. */
export function reportCssViewportOnce(_design?: DesignSize): void {
  if (!window.calfnxtNative?.post) return;

  let sent = false;
  let attempt = 0;
  const report = () => {
    if (sent) return;
    const w = Math.round(window.innerWidth);
    const h = Math.round(window.innerHeight);
    ++attempt;
    if (w < 1 || h < 1) {
      // Always visible in /tmp/calfnxt-ui.log via host `_diag` handling.
      postToHost({ t: '_diag', msg: `viewport-pending-${attempt}`, w, h });
      if (attempt < 20) {
        window.setTimeout(report, attempt < 5 ? 100 : 250);
      }
      return;
    }
    sent = true;
    postToHost({ t: 'viewport', w, h });
  };

  // After first layout (and a second frame for WebKit embed settle).
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(report);
  });
}
