export type calfNXTMsg =
  | { t: "begin"; id: number }
  | { t: "end"; id: number }
  | { t: "set"; id: number; v: number }
  | { t: "param"; id: number; v?: number; q?: number; d?: number }
  | { t: "sync" }
  /** UI→host: measured CSS viewport (window.innerWidth/Height), once at startup. */
  | { t: "viewport"; w: number; h: number }
  /** UI→host: diagnostic only (logged by WebEditor, not a param). */
  | { t: "_diag"; msg?: string; w?: number; h?: number }
  /** Host→UI: active audio channel count (from bus arrangement). */
  | { t: "io"; ch: number }
  /** DSP→UI telemetry (meters now; spectrum arrays later). */
  | { t: "viz"; id: string; kind: "levels" | "spectrum" | "gains" | "corr" | "gonio" | "envelope" | "gr" | "bandio" | "point" | "tempo" | "shape"; v: number[] }
  /** UI→host viz config (e.g. FFT bin count from pixel width). */
  | { t: "vizcfg"; id: string; bins?: number };

/** Plain float from a host→UI param message (`v`, or legacy q/d). */
export function plainFromMsg(msg: { v?: number; q?: number; d?: number }): number | undefined {
  if (typeof msg.v === "number" && Number.isFinite(msg.v))
    return msg.v;
  if (msg.q !== undefined && msg.d !== undefined && msg.d !== 0) {
    const v = msg.q / msg.d;
    return Number.isFinite(v) ? v : undefined;
  }
  return undefined;
}

declare global {
  interface Window {
    calfnxtNative?: { post: (msg: calfNXTMsg | string) => void };
    __calfnxtOnHost?: (msg: calfNXTMsg) => void;
    __calfnxtHostQ?: calfNXTMsg[];
  }
}

export function postToHost(msg: calfNXTMsg): void {
  window.calfnxtNative?.post(msg);
}

/** Install host→UI handler and flush messages queued before React mounted. */
export function onHostMessage(handler: (msg: calfNXTMsg) => void): void {
  window.__calfnxtOnHost = handler;
  const q = window.__calfnxtHostQ;
  if (q && q.length) {
    window.__calfnxtHostQ = [];
    for (const msg of q)
      handler(msg);
  }
}
