import type { DynamicValue } from "@deutschesoft/awml";
import { onHostMessage, plainFromMsg, postToHost, type calfNXTMsg } from "./bridge";

type HostApply = (v: number) => void;
type VizLevelsApply = (v: number[]) => void;
type ChannelCountApply = (ch: number) => void;

const hostApplies = new Map<number, HostApply>();
const vizLevelsApplies = new Map<string, VizLevelsApply>();
const vizGainsApplies = new Map<string, VizLevelsApply>();
const vizCorrApplies = new Map<string, HostApply>();
const vizGonioApplies = new Map<string, VizLevelsApply>();
const channelCountApplies = new Set<ChannelCountApply>();
let hostWired = false;

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
}

function dispatchHost(msg: calfNXTMsg): void {
  if (msg.t === "param") {
    const v = plainFromMsg(msg);
    if (v === undefined)
      return;
    hostApplies.get(msg.id)?.(v);
    return;
  }
  if (msg.t === "io" && typeof msg.ch === "number" && Number.isFinite(msg.ch)) {
    const ch = Math.max(1, Math.min(8, Math.round(msg.ch)));
    channelCountApplies.forEach((apply) => apply(ch));
    return;
  }
  if (msg.t === "viz" && msg.kind === "levels" && Array.isArray(msg.v))
    vizLevelsApplies.get(msg.id)?.(msg.v);
  if (msg.t === "viz" && msg.kind === "gains" && Array.isArray(msg.v))
    vizGainsApplies.get(msg.id)?.(msg.v);
  if (msg.t === "viz" && msg.kind === "corr" && Array.isArray(msg.v) && typeof msg.v[0] === "number")
    vizCorrApplies.get(msg.id)?.(msg.v[0]);
  if (msg.t === "viz" && msg.kind === "gonio" && Array.isArray(msg.v))
    vizGonioApplies.get(msg.id)?.(msg.v);
}

function ensureHostWire(): void {
  if (hostWired)
    return;
  hostWired = true;
  onHostMessage(dispatchHost);
  postToHost({ t: "sync" });
}

/** Wire an AWML DynamicValue to the VST3 host (plain values). */
export function bindParamToHost(dv: DynamicValue<number>, id: number): () => void {
  ensureHostWire();

  let fromHost = false;
  let lastSent: number | undefined;

  // replay:false — opening the UI must not reset the host to the model default.
  const unsub = dv.subscribe((v) => {
    if (fromHost)
      return;
    if (lastSent !== undefined && nearlyEqual(lastSent, v))
      return;
    lastSent = v;
    postToHost({ t: "set", id, v });
  }, false);

  hostApplies.set(id, (v) => {
    if (lastSent !== undefined && nearlyEqual(lastSent, v))
      return;
    fromHost = true;
    lastSent = v;
    try {
      dv.set(v);
    } finally {
      fromHost = false;
    }
  });

  return () => {
    unsub();
    hostApplies.delete(id);
  };
}

/** Wire peak-hold level arrays from DSP viz channel (id e.g. "in" / "out"). */
export function bindVizLevels(dv: DynamicValue<number[]>, id: string): () => void {
  ensureHostWire();
  vizLevelsApplies.set(id, (v) => {
    const clean = v.map((x) => {
      if (typeof x !== "number" || !Number.isFinite(x))
        return -96;
      return Math.min(12, Math.max(-96, x));
    });
    dv.set(clean);
  });
  return () => {
    vizLevelsApplies.delete(id);
  };
}

/** Wire per-band applied gains (dB) from DSP viz (id e.g. "eq"). */
export function bindVizGains(dv: DynamicValue<number[]>, id: string): () => void {
  ensureHostWire();
  vizGainsApplies.set(id, (v) => {
    const clean = v.map((x) => {
      if (typeof x !== "number" || !Number.isFinite(x))
        return 0;
      return Math.min(24, Math.max(-24, x));
    });
    dv.set(clean);
  });
  return () => {
    vizGainsApplies.delete(id);
  };
}

/** Wire stereo correlation (−1…1) from DSP viz (id e.g. "stereo"). */
export function bindVizCorr(dv: DynamicValue<number>, id: string): () => void {
  ensureHostWire();
  vizCorrApplies.set(id, (v) => {
    const x = typeof v === "number" && Number.isFinite(v) ? v : 0;
    dv.set(Math.min(1, Math.max(-1, x)));
  });
  return () => {
    vizCorrApplies.delete(id);
  };
}

/** Wire goniometer interleaved L/R samples from DSP viz (id e.g. "stereo"). */
export function bindVizGonio(dv: DynamicValue<number[]>, id: string): () => void {
  ensureHostWire();
  vizGonioApplies.set(id, (v) => {
    const clean = v.map((x) => {
      if (typeof x !== "number" || !Number.isFinite(x))
        return 0;
      return Math.min(2, Math.max(-2, x));
    });
    dv.set(clean);
  });
  return () => {
    vizGonioApplies.delete(id);
  };
}

/** Wire bus channel count from host `{t:"io",ch}`. */
export function bindChannelCount(dv: DynamicValue<number>): () => void {
  ensureHostWire();
  const apply: ChannelCountApply = (ch) => {
    if (dv.value === ch)
      return;
    dv.set(ch);
  };
  channelCountApplies.add(apply);
  return () => {
    channelCountApplies.delete(apply);
  };
}

export function postBegin(id: number): void {
  postToHost({ t: "begin", id });
}

export function postEnd(id: number): void {
  postToHost({ t: "end", id });
}

/** Wire a boolean DynamicValue to a 0/1 host parameter. */
export function bindBoolParamToHost(
  dv: DynamicValue<boolean>,
  id: number,
): () => void {
  ensureHostWire();

  let fromHost = false;
  let lastSent: number | undefined;

  const unsub = dv.subscribe((on) => {
    if (fromHost)
      return;
    const v = on ? 1 : 0;
    if (lastSent !== undefined && nearlyEqual(lastSent, v))
      return;
    lastSent = v;
    postToHost({ t: "set", id, v });
  }, false);

  hostApplies.set(id, (v) => {
    const on = v >= 0.5;
    const norm = on ? 1 : 0;
    if (lastSent !== undefined && nearlyEqual(lastSent, norm) && dv.value === on)
      return;
    fromHost = true;
    lastSent = norm;
    try {
      dv.set(on);
    } finally {
      fromHost = false;
    }
  });

  return () => {
    unsub();
    hostApplies.delete(id);
  };
}
