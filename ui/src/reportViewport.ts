import { postToHost } from './bridge';

/** Once: report CSS viewport so the native editor can scale the host window. */
export function reportCssViewportOnce(): void {
  let sent = false;
  let attempts = 0;

  const report = () => {
    if (sent) return;
    attempts += 1;
    const w = Math.round(window.innerWidth);
    const h = Math.round(window.innerHeight);
    const post = window.calfnxtNative?.post;

    if (!post) {
      if (attempts < 180) window.requestAnimationFrame(report);
      return;
    }

    // XEmbed/WebKit can briefly report 0×0; keep retrying instead of giving up.
    if (w < 1 || h < 1) {
      if (attempts === 1 || attempts === 30 || attempts === 90) {
        post({ t: '_diag', message: `viewport pending ${w}x${h} (attempt ${attempts})` } as never);
      }
      if (attempts < 180) window.requestAnimationFrame(report);
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
