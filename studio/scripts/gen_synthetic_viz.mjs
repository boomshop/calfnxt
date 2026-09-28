#!/usr/bin/env node
/**
 * Write studio/fixtures/<id>/viz.json with static meter + chart data.
 * History envelopes use a reproducible pseudo-audio shape (not animated).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.resolve(__dirname, '../fixtures');

function dbToLin(db) {
  if (!(db > -96)) return 0;
  return 10 ** (db / 20);
}

/** Interleaved [ch0, ch1, …] × slots + trailing phase 0. */
function history2ch(slots, audioDbFn, grDbFn) {
  const out = new Array(slots * 2 + 1);
  for (let i = 0; i < slots; ++i) {
    const t = i / (slots - 1);
    out[i * 2] = dbToLin(audioDbFn(t));
    out[i * 2 + 1] = dbToLin(grDbFn(t));
  }
  out[slots * 2] = 0;
  return out;
}

/** DeEsser: [audio, filtered/detector, grLin] × slots + phase. */
function history3ch(slots, audioDbFn, filtDbFn, grDbFn) {
  const out = new Array(slots * 3 + 1);
  for (let i = 0; i < slots; ++i) {
    const t = i / (slots - 1);
    out[i * 3] = dbToLin(audioDbFn(t));
    out[i * 3 + 1] = dbToLin(filtDbFn(t));
    out[i * 3 + 2] = dbToLin(grDbFn(t));
  }
  out[slots * 3] = 0;
  return out;
}

/** Limiter: [outPeak, grLin, limitLin] × slots + phase. */
function historyLimiter3ch(slots, outDbFn, grDbFn, limitLin = dbToLin(-6)) {
  const out = new Array(slots * 3 + 1);
  for (let i = 0; i < slots; ++i) {
    const t = i / (slots - 1);
    const gr = dbToLin(grDbFn(t));
    out[i * 3] = dbToLin(outDbFn(t));
    out[i * 3 + 1] = Math.min(1, Math.max(1e-6, gr));
    out[i * 3 + 2] = limitLin;
  }
  out[slots * 3] = 0;
  return out;
}

/** Compressor: [trigger, grLin, out, threshLin] × slots + phase. */
function historyComp4ch(slots, trigDbFn, grDbFn, outDbFn, threshLin = 0.071) {
  const out = new Array(slots * 4 + 1);
  for (let i = 0; i < slots; ++i) {
    const t = i / (slots - 1);
    const trig = dbToLin(trigDbFn(t));
    out[i * 4] = trig;
    out[i * 4 + 1] = dbToLin(grDbFn(t));
    out[i * 4 + 2] = outDbFn ? dbToLin(outDbFn(t)) : trig * 0.85;
    out[i * 4 + 3] = threshLin;
  }
  out[slots * 4] = 0;
  return out;
}

/** Deesser: [trigger, grLin, post, threshLin, pre] × slots + phase. */
function historyDeess5ch(slots, trigDbFn, grDbFn, outDbFn, threshLin = 0.071) {
  const out = new Array(slots * 5 + 1);
  for (let i = 0; i < slots; ++i) {
    const t = i / (slots - 1);
    const trig = dbToLin(trigDbFn(t));
    const gr = dbToLin(grDbFn(t));
    const post = outDbFn
      ? dbToLin(outDbFn(t))
      : trig * Math.min(1, Math.max(1e-6, gr));
    const pre = gr > 1e-6 && gr < 0.999 ? post / gr : post;
    out[i * 5] = trig;
    out[i * 5 + 1] = gr;
    out[i * 5 + 2] = post;
    out[i * 5 + 3] = threshLin;
    out[i * 5 + 4] = pre;
  }
  out[slots * 5] = 0;
  return out;
}

/** Expander: [trigger, grLin, out, threshLin, inv1Amt, inv2Amt, inv1Peak, inv2Peak]. */
function historyExp8ch(
  slots,
  trigDbFn,
  grDbFn,
  outDbFn,
  threshLin = 0.025,
  inv1Fn = () => 0,
  inv2Fn = () => 0,
  inv1PeakDbFn = null,
  inv2PeakDbFn = null,
) {
  const out = new Array(slots * 8 + 1);
  for (let i = 0; i < slots; ++i) {
    const t = i / (slots - 1);
    const trig = dbToLin(trigDbFn(t));
    const gr = dbToLin(grDbFn(t));
    const amt1 = Math.min(1, Math.max(0, inv1Fn(t)));
    const amt2 = Math.min(1, Math.max(0, inv2Fn(t)));
    out[i * 8] = trig;
    out[i * 8 + 1] = gr;
    out[i * 8 + 2] = outDbFn
      ? dbToLin(outDbFn(t))
      : trig * Math.min(1, Math.max(1e-6, gr));
    out[i * 8 + 3] = threshLin;
    out[i * 8 + 4] = amt1;
    out[i * 8 + 5] = amt2;
    out[i * 8 + 6] = inv1PeakDbFn
      ? dbToLin(inv1PeakDbFn(t))
      : trig * (0.4 + 0.6 * amt1);
    out[i * 8 + 7] = inv2PeakDbFn
      ? dbToLin(inv2PeakDbFn(t))
      : trig * (0.3 + 0.5 * amt2);
  }
  out[slots * 8] = 0;
  return out;
}

/**
 * Mbcomp: per band [full, band, grLin, threshLin] × slots + shared phase.
 * Prefer seeding from fixtures/compressor/viz.json when present.
 */
function mbcompHistory(slots, numBands = 4) {
  const bandScales = [0.92, 0.7, 0.45, 0.28, 0.18, 0.12];
  const grIntensity = [1.0, 0.82, 0.55, 0.35, 0.25, 0.18];
  const threshDb = [-18, -20, -22, -24, -20, -18];
  const compPath = path.join(fixtures, 'compressor/viz.json');
  if (fs.existsSync(compPath)) {
    const comp = JSON.parse(fs.readFileSync(compPath, 'utf8'));
    const env = Array.isArray(comp.envelope) ? comp.envelope : null;
    if (env && env.length >= 4) {
      const body = env.length - 1;
      const rem = body % 4 === 0 ? 4 : body % 5 === 0 ? 5 : body % 3 === 0 ? 3 : 2;
      const slotsAll = Math.floor(body / rem);
      const use = Math.min(slots, slotsAll);
      const start = slotsAll - use;
      const out = [];
      for (let b = 0; b < numBands; ++b) {
        const bs = bandScales[b] ?? 0.2;
        const gi = grIntensity[b] ?? 0.2;
        const thr = dbToLin(threshDb[b] ?? -20);
        for (let i = 0; i < use; ++i) {
          const si = start + i;
          const trig = Number(env[si * rem]) || 0;
          const filt =
            rem === 5
              ? Number(env[si * rem + 1]) || 0
              : rem >= 3 && rem !== 4
                ? Number(env[si * rem + 1]) || 0
                : trig * bs;
          // GR: ch1 for 4ch, ch2 for 3ch/5ch, ch1 for legacy 2ch.
          const grIdx = rem === 2 || rem === 4 ? 1 : 2;
          const gr = Math.min(
            1,
            Math.max(0, Number(env[si * rem + grIdx]) || 0),
          );
          const audio = rem === 5 ? Number(env[si * rem]) || trig : trig;
          const thrFromComp =
            rem === 4 ? Number(env[si * rem + 3]) || thr : thr;
          out.push(
            audio,
            rem === 5
              ? filt * (0.85 + 0.15 * bs)
              : rem === 4
                ? trig * (0.85 + 0.15 * bs)
                : rem >= 3
                  ? filt * (0.85 + 0.15 * bs)
                  : audio * bs,
            Math.min(1, Math.max(1e-6, 1 - (1 - gr) * gi)),
            thrFromComp,
          );
        }
      }
      out.push(Number(env[env.length - 1]) || 0);
      return out;
    }
  }
  // Fallback: compressor-shaped synthetic, packed per band.
  const base = history3ch(
    slots,
    (t) => -6 - 14 * Math.abs(Math.sin(t * Math.PI * 7)) - 8 * t,
    (t) => -10 - 12 * Math.abs(Math.sin(t * Math.PI * 7)) - 6 * t,
    (t) => {
      const peak = Math.max(0, Math.sin(t * Math.PI * 7));
      return -peak * 12 - 2;
    },
  );
  const out = [];
  for (let b = 0; b < numBands; ++b) {
    const bs = bandScales[b] ?? 0.2;
    const gi = grIntensity[b] ?? 0.2;
    const thr = dbToLin(threshDb[b] ?? -20);
    for (let i = 0; i < slots; ++i) {
      const audio = base[i * 3];
      const filt = base[i * 3 + 1];
      const gr = Math.min(1, Math.max(0, base[i * 3 + 2]));
      out.push(
        audio,
        filt * bs,
        Math.min(1, Math.max(1e-6, 1 - (1 - gr) * gi)),
        thr,
      );
    }
  }
  out.push(0);
  return out;
}

/** Mblimiter: per band [out, grLin, limitLin] × slots + shared phase. */
function mblimiterHistory(slots, numBands = 4) {
  const bandScales = [0.92, 0.7, 0.45, 0.28, 0.18, 0.12];
  const grIntensity = [1.0, 0.82, 0.55, 0.35, 0.25, 0.18];
  const limitLin = dbToLin(-6);
  const out = [];
  for (let b = 0; b < numBands; ++b) {
    const bs = bandScales[b] ?? 0.2;
    const gi = grIntensity[b] ?? 0.2;
    for (let i = 0; i < slots; ++i) {
      const t = i / Math.max(1, slots - 1);
      const peak = Math.max(0, Math.sin(t * Math.PI * 6) - 0.2);
      const gr = Math.min(
        1,
        Math.max(1e-6, dbToLin(-peak * 12 * gi - 1)),
      );
      const bandOut = dbToLin(-8 - 10 * Math.abs(Math.sin(t * Math.PI * 6)) - 4 * t) * bs * gr;
      out.push(bandOut, gr, limitLin);
    }
  }
  out.push(0);
  return out;
}

function gonio(n = 256) {
  const v = [];
  for (let i = 0; i < n; ++i) {
    const a = (i / n) * Math.PI * 2 * 3;
    const r = 0.35 + 0.25 * Math.sin(i * 0.2);
    v.push(Math.cos(a) * r, Math.sin(a) * r * 0.85);
  }
  return v;
}

/**
 * Spectrum viz payload: [bins, hold, avg×N, max×N, L×N, R×N].
 * Shape ≈ pink (−3 dB/oct) + kick/bass/vocal/air so Stereo + −3 tilt looks balanced.
 */
function spectrumPayload(bins = 128) {
  const fMin = 20;
  const fMax = 20000;
  const avg = [];
  const max = [];
  const L = [];
  const R = [];
  for (let i = 0; i < bins; ++i) {
    const t = (i + 0.5) / bins;
    const f = fMin * (fMax / fMin) ** t;
    const pink = -18 - 3 * Math.log2(Math.max(1e-6, f / 1000));
    const kick = 7 * Math.exp(-(Math.log(f / 55) ** 2) / 0.28);
    const bass = 3.2 * Math.exp(-(Math.log(f / 110) ** 2) / 0.45);
    const lowMid = 1.4 * Math.exp(-(Math.log(f / 350) ** 2) / 0.7);
    const vocal = 2.4 * Math.exp(-(Math.log(f / 2800) ** 2) / 0.75);
    const air = 1.6 * Math.exp(-(Math.log(f / 11000) ** 2) / 0.55);
    const grain = 0.9 * Math.sin(i * 1.73) * Math.cos(i * 0.37);
    const base = Math.max(-88, Math.min(-2, pink + kick + bass + lowMid + vocal + air + grain));
    // Mild L/R imbalance: L warmer lows, R a bit more top/side.
    const lBias =
      1.6 * Math.exp(-(Math.log(f / 180) ** 2) / 1.1)
      - 0.7 * Math.exp(-(Math.log(f / 9000) ** 2) / 0.8);
    const rBias =
      -1.1 * Math.exp(-(Math.log(f / 140) ** 2) / 1.0)
      + 1.4 * Math.exp(-(Math.log(f / 6500) ** 2) / 0.85);
    const l = Math.max(-90, Math.min(0, base + lBias + 0.35 * Math.sin(i * 2.05)));
    const r = Math.max(-90, Math.min(0, base + rBias + 0.35 * Math.cos(i * 1.91)));
    const mid = 0.5 * (l + r);
    avg.push(mid);
    max.push(Math.min(0, Math.max(l, r) + 2.2 + 0.4 * Math.abs(Math.sin(i * 0.61))));
    L.push(l);
    R.push(r);
  }
  return [bins, 0, ...avg, ...max, ...L, ...R];
}

/** Slightly denser gonio cloud (more mid, some side) for Analyzer shots. */
function gonioCloud(n = 320) {
  // Deterministic “random” so screenshots stay stable across regenerations.
  let seed = 0xc4a1f008;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const v = [];
  for (let i = 0; i < n; ++i) {
    const u = i / n;
    const mid = (rnd() * 2 - 1) * (0.15 + 0.55 * (1 - u * 0.35));
    const side = (rnd() * 2 - 1) * (0.08 + 0.35 * u);
    const L = mid + side;
    const R = mid - side;
    const scale = 0.55;
    v.push(L * scale, R * scale);
  }
  return v;
}

const slots = 240;

/** Transients: original, filtered, output, envelope, attack, release + phase. */
function envelope6(slots) {
  const out = new Array(slots * 6 + 1);
  for (let i = 0; i < slots; ++i) {
    const t = i / (slots - 1);
    const hit =
      Math.exp(-18 * Math.max(0, t - 0.12) ** 2) * 0.7 +
      Math.exp(-40 * Math.max(0, t - 0.45) ** 2) * 0.45 +
      0.08;
    const env = hit * (0.85 + 0.15 * Math.sin(t * 40));
    out[i * 6] = hit;
    out[i * 6 + 1] = hit * 0.72;
    out[i * 6 + 2] = hit * 0.95;
    out[i * 6 + 3] = env;
    out[i * 6 + 4] = env * 0.6;
    out[i * 6 + 5] = env * 0.35;
  }
  out[slots * 6] = 0;
  return out;
}

const packs = {
  compressor: {
    levelsIn: [-8.5, -9.2],
    levelsOut: [-10.1, -10.8],
    gr: 6.5,
    point: [-18, -22],
    envelope: historyComp4ch(
      slots,
      (t) => -10 - 12 * Math.abs(Math.sin(t * Math.PI * 7 + 0.4)) - 6 * t,
      (t) => {
        const peak = Math.max(0, Math.sin(t * Math.PI * 7));
        return -peak * 12 - 2;
      },
      (t) => -8 - 12 * Math.abs(Math.sin(t * Math.PI * 7)) - 6 * t,
    ),
  },
  expander: {
    levelsIn: [-10, -10.4],
    levelsOut: [-14, -14.6],
    gr: 8.0,
    point: [-40, -52],
    // [trigger, grLin, out, threshLin, inv1Amt, inv2Amt, inv1Peak, inv2Peak]
    envelope: historyExp8ch(
      slots,
      (t) => -12 - 16 * Math.abs(Math.sin(t * Math.PI * 5 + 0.3)) - 3 * t,
      (t) => {
        const quiet = Math.max(0, 0.55 - Math.abs(Math.sin(t * Math.PI * 5)));
        return -quiet * 28 - 1;
      },
      (t) => -8 - 18 * Math.abs(Math.sin(t * Math.PI * 5)) - 4 * t,
      0.025,
      (t) => Math.max(0, Math.sin(t * Math.PI * 3) - 0.55),
      (t) => Math.max(0, Math.sin(t * Math.PI * 2 + 1.2) - 0.7),
    ),
  },
  deesser: {
    levelsIn: [-12, -12.5],
    levelsOut: [-13, -13.4],
    gr: 4.2,
    envelope: historyDeess5ch(
      slots,
      (t) =>
        -14 -
        12 * Math.abs(Math.sin(t * Math.PI * 11)) -
        4 * Math.max(0, Math.sin(t * Math.PI * 22)),
      (t) => -Math.max(0, Math.sin(t * Math.PI * 11) - 0.3) * 10,
      (t) => -10 - 10 * Math.abs(Math.sin(t * Math.PI * 11)),
    ),
  },
  transients: {
    levelsIn: [-7, -7.5],
    levelsOut: [-6.5, -7],
    envelope: envelope6(240),
  },
  stereo: {
    levelsIn: [-9, -9.5],
    levelsOut: [-9.2, -9.1],
    corr: 0.42,
    gonio: gonio(320),
  },
  analyzer: {
    levelsIn: [-8.5, -9.2],
    levelsOut: [-8.6, -9.3],
    corr: 0.48,
    gonio: gonioCloud(320),
    spectrum: spectrumPayload(128),
  },
  delay: {
    levelsIn: [-11, -11.5],
    levelsOut: [-14, -14.5],
    tempo: [1, 120],
  },
  equalizer: {
    levelsIn: [-10, -10.5],
    levelsOut: [-10.2, -10.6],
  },
  harmonics: {
    levelsIn: [-9.5, -10.0],
    levelsOut: [-8.2, -8.6],
    // [zone, …48 density bins] — filled by fixtures/harmonics/viz.json for shots.
    shape: [0.72],
  },
  reverb: {
    levelsIn: [-12, -12.5],
    levelsOut: [-18, -18.5],
  },
  limiter: {
    levelsIn: [-8.5, -9.0],
    levelsOut: [-1.2, -1.5],
    gr: 6.5,
    // Limit −6 dB (matches fixtures/limiter/params.json).
    envelope: historyLimiter3ch(
      slots,
      (t) => -8 - 10 * Math.abs(Math.sin(t * Math.PI * 6)) - 4 * t,
      (t) => {
        const peak = Math.max(0, Math.sin(t * Math.PI * 6) - 0.25);
        return -peak * 14 - 1;
      },
      dbToLin(-6),
    ),
  },
  mbcomp: {
    bandio: [-9.5, -7.2, -12.8, -11.0, -17.4, -15.8, -23.0, -21.5],
    // Per-band GR ≤0 dB (host converts to positive meter amounts).
    gains: [-5.5, -4.0, -2.8, -1.8, 0, 0],
    levelsIn: [-8.2, -8.8],
    levelsOut: [-9.5, -10.1],
    point: [-14.5, -17.2],
    // History seeded from compressor fixture when available (4 ch × bands).
    envelope: mbcompHistory(160, 4),
  },
  // Same packed history layout as mbcomp was (3 ch); gr = overall deepest (UI amount).
  mblimiter: {
    bandio: [-8.5, -10.2, -11.5, -13.0, -16.0, -17.5, -21.0, -22.2],
    gains: [-4.5, -3.2, -2.0, -1.2, 0, 0],
    levelsIn: [-7.5, -8.0],
    levelsOut: [-1.5, -1.8],
    gr: 5.8,
    envelope: mblimiterHistory(160, 4),
  },
};

for (const [id, viz] of Object.entries(packs)) {
  const dir = path.join(fixtures, id);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'viz.json');
  // Never clobber live captures or hand-tuned viz — use import_capture.py.
  const capture = path.join(dir, 'capture.json');
  if (fs.existsSync(capture)) {
    console.log('skip', file, '(capture.json present — import_capture.py)');
    continue;
  }
  if (fs.existsSync(file)) {
    console.log('skip', file, '(exists)');
    continue;
  }
  fs.writeFileSync(file, `${JSON.stringify(viz, null, 2)}\n`);
  console.log('wrote', file);
}
