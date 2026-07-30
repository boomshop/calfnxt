import { postToHost } from './bridge';

export type DesignSize = { width: number; height: number };

/**
 * Once: report CSS viewport so the native editor can scale the host window.
 *
 * Under fractional GTK/WebKit scaling, `innerWidth` is often design/scale while the
 * embedder stays at design px — enlarging the host then leaves the XEmbed plug
 * clipped. Fit the design layout into the CSS viewport via transform instead.
 */
export function reportCssViewportOnce(design?: DesignSize): void {
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

    if (design && design.width > 0 && design.height > 0) {
      const z = Math.min(w / design.width, h / design.height);
      if (z > 0.05 && z < 0.995) {
        const root = document.documentElement;
        root.style.width = `${design.width}px`;
        root.style.height = `${design.height}px`;
        root.style.transformOrigin = 'top left';
        root.style.transform = `scale(${z})`;
        root.style.overflow = 'hidden';
        post({
          t: '_diag',
          message: `viewport fit design ${design.width}x${design.height} → zoom ${z.toFixed(3)} (css ${w}x${h})`,
        } as never);
      }
    }

    sent = true;
    postToHost({ t: 'viewport', w, h });
  };

  // After first layout (and a second frame for WebKit embed settle).
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(report);
  });
}
