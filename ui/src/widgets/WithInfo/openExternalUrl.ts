/**
 * Open an https/http URL outside the plug-in page.
 * In calfnxt-web-host the message is handled in-process (system handler).
 * In the Vite dev server there is no host, so the browser opens a new tab.
 * Never navigates the plug-in WebView.
 */

function hostHandler(): { postMessage: (message: string) => void } | undefined {
  const w = window as Window & {
    webkit?: { messageHandlers?: { calfnxt?: { postMessage: (message: string) => void } } };
  };
  return w.webkit?.messageHandlers?.calfnxt;
}

export function openExternalUrl(url: string): void {
  if (!/^https?:\/\/\S+$/i.test(url))
    return;
  const host = hostHandler();
  if (host) {
    host.postMessage(`OPENURL\n${url}`);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
