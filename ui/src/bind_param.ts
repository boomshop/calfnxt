import type { DynamicValue } from "@deutschesoft/awml";
import { onHostMessage, plainFromMsg, postToHost, type calfNXTMsg } from "./bridge";

type HostApply = (v: number) => void;
type VizLevelsApply = (v: number[]) => void;
type ChannelCountApply = (ch: number) => void;

const hostApplies = new Map<number, HostApply>();
const pendingHostParams = new Map<number, number>();
const vizLevelsApplies = new Map<string, VizLevelsApply>();
const vizGainsApplies = new Map<string, VizLevelsApply>();
const vizCorrApplies = new Map<string, HostApply>();
const vizGonioApplies = new Map<string, VizLevelsApply>();
const vizEnvelopeApplies = new Map<string, (v: Float32Array) => void>();
const vizGrApplies = new Map<string, HostApply>();
const vizGrArrayApplies = new Map<string, VizLevelsApply>();
const vizBandIoApplies = new Map<string, VizLevelsApply>();
const vizPointApplies = new Map<string, VizLevelsApply>();
const vizShapeApplies = new Map<string, VizLevelsApply>();
const vizTempoApplies = new Map<string, VizLevelsApply>();
const vizSpectrumApplies = new Map<string, VizLevelsApply>();
const vizHzApplies = new Map<string, HostApply>();
const vizCtrlApplies = new Map<string, VizLevelsApply>();
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
    const apply = hostApplies.get(msg.id);
    if (apply)
      apply(v);
    else
      pendingHostParams.set(msg.id, v);
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
  if (msg.t === "viz" && msg.kind === "envelope" && Array.isArray(msg.v))
    vizEnvelopeApplies.get(msg.id)?.(new Float32Array(msg.v));
  if (msg.t === "viz" && msg.kind === "gr" && Array.isArray(msg.v) && typeof msg.v[0] === "number") {
    vizGrApplies.get(msg.id)?.(msg.v[0]);
    vizGrArrayApplies.get(msg.id)?.(msg.v);
  }
  if (msg.t === "viz" && msg.kind === "bandio" && Array.isArray(msg.v))
    vizBandIoApplies.get(msg.id)?.(msg.v);
  if (msg.t === "viz" && msg.kind === "point" && Array.isArray(msg.v))
    vizPointApplies.get(msg.id)?.(msg.v);
  if (msg.t === "viz" && msg.kind === "shape" && Array.isArray(msg.v))
    vizShapeApplies.get(msg.id)?.(msg.v);
  if (msg.t === "viz" && msg.kind === "tempo" && Array.isArray(msg.v))
    vizTempoApplies.get(msg.id)?.(msg.v);
  if (msg.t === "viz" && msg.kind === "spectrum" && Array.isArray(msg.v))
    vizSpectrumApplies.get(msg.id)?.(msg.v);
  if (msg.t === "viz" && msg.kind === "hz" && Array.isArray(msg.v) && typeof msg.v[0] === "number")
    vizHzApplies.get(msg.id)?.(msg.v[0]);
  if (msg.t === "viz" && msg.kind === "ctrl" && Array.isArray(msg.v))
    vizCtrlApplies.get(msg.id)?.(msg.v);
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

  const apply = (v: number) => {
    if (lastSent !== undefined && nearlyEqual(lastSent, v))
      return;
    fromHost = true;
    lastSent = v;
    try {
      dv.set(v);
    } finally {
      fromHost = false;
    }
  };
  hostApplies.set(id, apply);
  const pending = pendingHostParams.get(id);
  if (pending !== undefined) {
    pendingHostParams.delete(id);
    apply(pending);
  }
  // Register apply before wiring so queued/sync messages are not dropped.
  ensureHostWire();

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

/** Wire unit-interval level arrays from DSP viz (id e.g. "lfo" activity 0…1). */
export function bindVizUnitLevels(
  dv: DynamicValue<number[]>,
  id: string,
): () => void {
  ensureHostWire();
  vizLevelsApplies.set(id, (v) => {
    const clean = v.map((x) => {
      if (typeof x !== "number" || !Number.isFinite(x))
        return 0;
      return Math.min(1, Math.max(0, x));
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

/** Wire envelope display buffer (Float32Array) from DSP viz (id e.g. "env"). */
export function bindVizEnvelope(dv: DynamicValue<Float32Array | null>, id: string): () => void {
  ensureHostWire();
  vizEnvelopeApplies.set(id, (v) => dv.set(v));
  return () => {
    vizEnvelopeApplies.delete(id);
  };
}

/** Wire gain reduction magnitude (0…60 dB) from DSP viz (id e.g. "comp").
 *  DSP sends ≤0 dB; UI meters use positive amount + reverse. */
export function bindVizGr(dv: DynamicValue<number>, id: string): () => void {
  ensureHostWire();
  vizGrApplies.set(id, (v) => {
    const x = typeof v === "number" && Number.isFinite(v) ? v : 0;
    // DSP: ≤0 dB reduction → meter: 0…60 (no reduction … deep GR).
    dv.set(Math.min(60, Math.max(0, -x)));
  });
  return () => {
    vizGrApplies.delete(id);
  };
}

/** Wire per-band gain reduction (multiband). DSP sends ≤0 dB per band;
 *  `apply` receives positive meter amounts 0…60 in band order. */
export function bindVizGrArray(
  apply: (v: number[]) => void,
  id: string,
): () => void {
  ensureHostWire();
  vizGrArrayApplies.set(id, (v) => {
    apply(
      v.map((x) => {
        if (typeof x !== "number" || !Number.isFinite(x))
          return 0;
        return Math.min(60, Math.max(0, -x));
      }),
    );
  });
  return () => {
    vizGrArrayApplies.delete(id);
  };
}

/** Wire per-band in/out levels [in0, out0, in1, out1, …] in dB (id e.g. "mbcomp"). */
export function bindVizBandIo(dv: DynamicValue<number[]>, id: string): () => void {
  ensureHostWire();
  vizBandIoApplies.set(id, (v) => {
    const clean = v.map((x) => {
      if (typeof x !== "number" || !Number.isFinite(x))
        return -96;
      return Math.min(12, Math.max(-96, x));
    });
    dv.set(clean);
  });
  return () => {
    vizBandIoApplies.delete(id);
  };
}

/** Wire host tempo [valid, bpm] from DSP viz (id e.g. "delay"). */
export function bindVizTempo(dv: DynamicValue<number[]>, id: string): () => void {
  ensureHostWire();
  vizTempoApplies.set(id, (v) => {
    const valid = v[0] >= 0.5 ? 1 : 0;
    const bpm = typeof v[1] === "number" && Number.isFinite(v[1]) ? v[1] : 120;
    dv.set([valid, Math.min(300, Math.max(30, bpm))]);
  });
  return () => {
    vizTempoApplies.delete(id);
  };
}

/** Wire dynamics operating point [inDb, outDb] from DSP viz (id e.g. "comp"). */
export function bindVizPoint(dv: DynamicValue<number[]>, id: string): () => void {
  ensureHostWire();
  vizPointApplies.set(id, (v) => {
    const clean = v.map((x) => {
      if (typeof x !== "number" || !Number.isFinite(x))
        return -96;
      return Math.min(24, Math.max(-96, x));
    });
    dv.set(clean);
  });
  return () => {
    vizPointApplies.delete(id);
  };
}

/** Wire waveshaper viz [zone, …densityBins] in 0…1 (id e.g. "harmonics"). */
export function bindVizShape(dv: DynamicValue<number[]>, id: string): () => void {
  ensureHostWire();
  vizShapeApplies.set(id, (v) => {
    const clean = v.map((x) => {
      if (typeof x !== "number" || !Number.isFinite(x))
        return 0;
      return Math.min(1, Math.max(0, x));
    });
    dv.set(clean);
  });
  return () => {
    vizShapeApplies.delete(id);
  };
}

/**
 * Wire spectrum payload (id e.g. "fft"):
 * [bins, hold, avg×N, max×N, L×N, R×N] in dBFS (−120…12).
 */
export function bindVizSpectrum(dv: DynamicValue<number[]>, id: string): () => void {
  ensureHostWire();
  vizSpectrumApplies.set(id, (v) => {
    if (!v.length) {
      dv.set([]);
      return;
    }
    const clean = v.map((x, i) => {
      if (typeof x !== "number" || !Number.isFinite(x))
        return i < 2 ? 0 : -120;
      if (i === 0)
        return Math.min(256, Math.max(1, Math.round(x)));
      if (i === 1)
        return x >= 0.5 ? 1 : 0;
      return Math.min(12, Math.max(-120, x));
    });
    dv.set(clean);
  });
  return () => {
    vizSpectrumApplies.delete(id);
  };
}

/** Wire live frequency in Hz (id e.g. "filt") from DSP viz kind "hz". */
export function bindVizHz(dv: DynamicValue<number>, id: string): () => void {
  ensureHostWire();
  vizHzApplies.set(id, (v) => {
    if (typeof v !== "number" || !Number.isFinite(v))
      return;
    const hz = Math.min(20000, Math.max(10, v));
    if (nearlyEqual(dv.value, hz))
      return;
    dv.set(hz);
  });
  return () => {
    vizHzApplies.delete(id);
  };
}

/**
 * Wire mixed-unit control arrays from DSP viz kind "ctrl"
 * (e.g. ringmod [modFreqHz, modDetuneCents, modAmount, lfo1FreqHz]).
 */
export function bindVizCtrl(dv: DynamicValue<number[]>, id: string): () => void {
  ensureHostWire();
  vizCtrlApplies.set(id, (v) => {
    dv.set(
      v.map((x) => (typeof x === "number" && Number.isFinite(x) ? x : 0)),
    );
  });
  return () => {
    vizCtrlApplies.delete(id);
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

  const apply = (v: number) => {
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
  };
  hostApplies.set(id, apply);
  const pending = pendingHostParams.get(id);
  if (pending !== undefined) {
    pendingHostParams.delete(id);
    apply(pending);
  }
  ensureHostWire();

  return () => {
    unsub();
    hostApplies.delete(id);
  };
}
