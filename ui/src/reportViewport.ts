import { postToHost } from './bridge';

export type DesignSize = { width: number; height: number };

/** Once: report CSS viewport so the native editor can scale the host window. */
export function reportCssViewportOnce(_design?: DesignSize): void {
  if (!window.calfnxtNative?.post) return;

  let sent = false;
  const report = () => {
    if (sent) return;
    const w = Math.round(window.innerWidth);
    const h = Math.round(window.innerHeight);
    if (w < 1 || h < 1) return;
    sent = true;
    postToHost({ t: 'viewport', w, h });
  };

  // After first layout (and a second frame for WebKit embed settle).
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(report);
  });
}
