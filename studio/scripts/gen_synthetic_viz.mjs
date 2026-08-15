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

/** Compressor / DeEsser: [audio, filtered/detector, grLin] × slots + phase. */
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

/** Transients: 5 channels (in, out, env, att, rel) + phase. */
function envelope5(slots) {
  const out = new Array(slots * 5 + 1);
  for (let i = 0; i < slots; ++i) {
    const t = i / (slots - 1);
    const hit = Math.exp(-18 * Math.max(0, t - 0.12) ** 2) * 0.7
      + Math.exp(-40 * Math.max(0, t - 0.45) ** 2) * 0.45
      + 0.08;
    const env = hit * (0.85 + 0.15 * Math.sin(t * 40));
    out[i * 5] = hit;
    out[i * 5 + 1] = hit * 0.92;
    out[i * 5 + 2] = env;
    out[i * 5 + 3] = env * 0.6;
    out[i * 5 + 4] = env * 0.35;
  }
  out[slots * 5] = 0;
  return out;
}

/**
 * Mbcomp: per band [full, band, grLin] × slots + shared phase.
 * Prefer seeding from fixtures/compressor/viz.json when present.
 */
function mbcompHistory(slots, numBands = 4) {
  const bandScales = [0.92, 0.7, 0.45, 0.28, 0.18, 0.12];
  const grIntensity = [1.0, 0.82, 0.55, 0.35, 0.25, 0.18];
  const compPath = path.join(fixtures, 'compressor/viz.json');
  if (fs.existsSync(compPath)) {
    const comp = JSON.parse(fs.readFileSync(compPath, 'utf8'));
    const env = Array.isArray(comp.envelope) ? comp.envelope : null;
    if (env && env.length >= 4) {
      const rem = (env.length - 1) % 3 === 0 ? 3 : 2;
      const slotsAll = Math.floor((env.length - 1) / rem);
      const use = Math.min(slots, slotsAll);
      const start = slotsAll - use;
      const out = [];
      for (let b = 0; b < numBands; ++b) {
        const bs = bandScales[b] ?? 0.2;
        const gi = grIntensity[b] ?? 0.2;
        for (let i = 0; i < use; ++i) {
          const si = start + i;
          const audio = Number(env[si * rem]) || 0;
          const filt =
            rem === 3
              ? Number(env[si * rem + 1]) || 0
              : audio * bs;
          const gr = Math.min(
            1,
            Math.max(0, Number(env[si * rem + (rem - 1)]) || 0),
          );
          out.push(
            audio,
            rem === 3 ? filt * (0.85 + 0.15 * bs) : audio * bs,
            Math.min(1, Math.max(1e-6, 1 - (1 - gr) * gi)),
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
    for (let i = 0; i < slots; ++i) {
      const audio = base[i * 3];
      const filt = base[i * 3 + 1];
      const gr = Math.min(1, Math.max(0, base[i * 3 + 2]));
      out.push(
        audio,
        filt * bs,
        Math.min(1, Math.max(1e-6, 1 - (1 - gr) * gi)),
      );
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

const packs = {
  compressor: {
    levelsIn: [-8.5, -9.2],
    levelsOut: [-10.1, -10.8],
    gr: 6.5,
    point: [-18, -22],
    envelope: history3ch(
      slots,
      (t) => -6 - 14 * Math.abs(Math.sin(t * Math.PI * 7)) - 8 * t,
      (t) => -10 - 12 * Math.abs(Math.sin(t * Math.PI * 7 + 0.4)) - 6 * t,
      (t) => {
        const peak = Math.max(0, Math.sin(t * Math.PI * 7));
        return -peak * 12 - 2;
      },
    ),
  },
  expander: {
    levelsIn: [-10, -10.4],
    levelsOut: [-14, -14.6],
    gr: 8.0,
    point: [-40, -52],
    envelope: history3ch(
      slots,
      (t) => -8 - 18 * Math.abs(Math.sin(t * Math.PI * 5)) - 4 * t,
      (t) => -12 - 16 * Math.abs(Math.sin(t * Math.PI * 5 + 0.3)) - 3 * t,
      (t) => {
        const quiet = Math.max(0, 0.55 - Math.abs(Math.sin(t * Math.PI * 5)));
        return -quiet * 28 - 1;
      },
    ),
  },
  deesser: {
    levelsIn: [-12, -12.5],
    levelsOut: [-13, -13.4],
    gr: 4.2,
    envelope: history3ch(
      slots,
      (t) => -10 - 10 * Math.abs(Math.sin(t * Math.PI * 11)),
      (t) => -14 - 12 * Math.abs(Math.sin(t * Math.PI * 11)) - 4 * Math.max(0, Math.sin(t * Math.PI * 22)),
      (t) => -Math.max(0, Math.sin(t * Math.PI * 11) - 0.3) * 10,
    ),
  },
  transients: {
    levelsIn: [-7, -7.5],
    levelsOut: [-6.5, -7],
    envelope: envelope5(180),
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
  mbcomp: {
    bandio: [-9.5, -7.2, -12.8, -11.0, -17.4, -15.8, -23.0, -21.5],
    // Per-band GR ≤0 dB (host converts to positive meter amounts).
    gains: [-5.5, -4.0, -2.8, -1.8, 0, 0],
    levelsIn: [-8.2, -8.8],
    levelsOut: [-9.5, -10.1],
    point: [-14.5, -17.2],
    // History seeded from compressor fixture when available (3 ch × bands).
    envelope: mbcompHistory(160, 4),
  },
  // Same packed history layout as mbcomp; gr = overall deepest (UI amount).
  mblimiter: {
    bandio: [-8.5, -10.2, -11.5, -13.0, -16.0, -17.5, -21.0, -22.2],
    gains: [-4.5, -3.2, -2.0, -1.2, 0, 0],
    levelsIn: [-7.5, -8.0],
    levelsOut: [-1.5, -1.8],
    gr: 5.8,
    envelope: mbcompHistory(160, 4),
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
