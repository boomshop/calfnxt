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
  | { t: "viz"; id: string; kind: "levels" | "spectrum" | "gains" | "corr" | "gonio" | "envelope" | "gr" | "bandio" | "point" | "tempo" | "shape" | "hz" | "ctrl" | "lfo"; v: number[] }
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
    /** Shared viz snapshot bag (`id:kind` → `v`), also filled by web-host inject. */
    __calfnxtVizDump?: Record<string, number[]>;
    /**
     * Latest viz payloads as pretty JSON (console.log + return). Installed as a
     * classic global by calfnxt-web-host so bare `__calfnxtDumpViz()` works in
     * the WebKit inspector (ES-module `window.x=` alone often does not).
     */
    __calfnxtDumpViz?: () => string;
  }
}

function vizDumpBag(): Record<string, number[]> {
  if (!window.__calfnxtVizDump)
    window.__calfnxtVizDump = {};
  return window.__calfnxtVizDump;
}

function installVizDumpApi(): void {
  // Keep / refresh the classic global (web-host injects a stub at document start).
  window.__calfnxtDumpViz = () => {
    const json = JSON.stringify(vizDumpBag(), null, 2);
    try {
      void navigator.clipboard?.writeText(json);
    } catch {
      /* WebKit may deny clipboard without a gesture — still return the string. */
    }
    console.log(json);
    return json;
  };
}

installVizDumpApi();

export function postToHost(msg: calfNXTMsg): void {
  window.calfnxtNative?.post(msg);
}

/** Install host→UI handler and flush messages queued before React mounted. */
export function onHostMessage(handler: (msg: calfNXTMsg) => void): void {
  window.__calfnxtOnHost = (msg) => {
    if (msg?.t === "viz" && typeof msg.id === "string" && Array.isArray(msg.v))
      vizDumpBag()[`${msg.id}:${msg.kind}`] = msg.v.slice();
    handler(msg);
  };
  const q = window.__calfnxtHostQ;
  if (q && q.length) {
    window.__calfnxtHostQ = [];
    for (const msg of q)
      window.__calfnxtOnHost!(msg);
  }
}
