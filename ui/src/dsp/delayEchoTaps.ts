/**
 * Predictive delay echo taps aligned with calfNXT Delay DSP (`delay_dsp.cpp`).
 *
 * Levels are linear wet amplitudes for a unit impulse into L+R after the delay
 * lines are primed (age > delay) — the normal running state.
 *
 * Intentionally omitted (same as classic Calf “amount” picture, not a scope):
 * - Feedback HP/LP colouring
 * - SmoothGain glide while parameters move
 *
 * Width (chmix) is applied in DelayEchoChart when drawing L/R bar heights.
 */

export type DelayMixMode = 0 | 1 | 2 | 3; // Stereo / PingPong / L-then-R / R-then-L

export type DelayEchoTap = {
  /** Time of tap in ms from impulse. */
  tMs: number;
  /** Linear wet amplitude on L (0…∞). */
  levelL: number;
  /** Linear wet amplitude on R. */
  levelR: number;
};

export type DelayEchoParams = {
  bpm: number;
  subdiv: number;
  timeL: number;
  timeR: number;
  feedback: number;
  /** Wet amount in dB (host plain). */
  amountDb: number;
  mixMode: DelayMixMode;
  /** How many feedback generations to plot (non-stereo modes). */
  generations?: number;
};

/** Chart y-floor — taps quieter than this are invisible / stop the trail. */
export const DELAY_ECHO_FLOOR_DB = -48;

const MAX_GENERATIONS = 128;

/**
 * Hybrid chart window: follow audible trail, then clamp to readable hit/beat bounds.
 * Hit = beat / subdiv. Trail pad keeps a little air after the last bar.
 */
export const DELAY_ECHO_HITS_MIN = 16;
export const DELAY_ECHO_HITS_MAX = 64;
export const DELAY_ECHO_BEATS_MIN = 4;
export const DELAY_ECHO_BEATS_MAX = 24;
const DELAY_ECHO_TRAIL_PAD = 1.15;

function dbToLin(db: number): number {
  return Math.pow(10, db * 0.05);
}

export function delayUnitMs(bpm: number, subdiv: number): number {
  const b = Math.max(30, Math.min(300, bpm));
  const s = Math.max(1, Math.min(16, Math.round(subdiv)));
  return 60000 / (b * s);
}

export function delayBeatMs(bpm: number): number {
  return 60000 / Math.max(30, Math.min(300, bpm));
}

/** Generations until `amount * fb^(n-1)` drops below floor (inclusive). */
function gensUntilFloor(amount: number, fb: number, floor: number): number {
  if (!(amount >= floor))
    return 0;
  if (fb < 1e-6)
    return 1;
  if (fb >= 0.9995)
    return MAX_GENERATIONS;
  const n = Math.floor(Math.log(floor / amount) / Math.log(fb) + 1e-12) + 1;
  return Math.max(1, Math.min(MAX_GENERATIONS, n));
}

function clampGens(n: number): number {
  return Math.max(2, Math.min(MAX_GENERATIONS, n));
}

/** Clamp trail ms into [hits∩beats] bounds; snap up to whole subdiv hits. */
function clampSpanToReadable(
  trailMs: number,
  bpm: number,
  subdiv: number,
): number {
  const beatMs = delayBeatMs(bpm);
  const unit = delayUnitMs(bpm, subdiv);
  const lo = Math.max(
    DELAY_ECHO_HITS_MIN * unit,
    DELAY_ECHO_BEATS_MIN * beatMs,
  );
  const hi = Math.min(
    DELAY_ECHO_HITS_MAX * unit,
    DELAY_ECHO_BEATS_MAX * beatMs,
  );
  const boundsLo = Math.min(lo, hi);
  const boundsHi = Math.max(lo, hi);
  let span = Math.min(boundsHi, Math.max(boundsLo, trailMs));
  // Snap to whole hits so the musical grid lands on edges.
  span = Math.ceil(span / Math.max(1e-6, unit) - 1e-9) * unit;
  if (span < boundsLo)
    span = Math.ceil(boundsLo / unit - 1e-9) * unit;
  if (span > boundsHi + 1e-6)
    span = Math.floor(boundsHi / unit + 1e-9) * unit;
  return Math.max(unit, span);
}

/**
 * Hybrid window: audible echo trail (feedback / L / R / mode), clamped to
 * readable hit & beat limits, snapped to subdiv hits for the grid.
 */
export function planDelayEchoView(p: DelayEchoParams): {
  spanMs: number;
  generations: number;
} {
  const unit = delayUnitMs(p.bpm, p.subdiv);
  const tL = Math.max(1, Math.round(p.timeL));
  const tR = Math.max(1, Math.round(p.timeR));
  const delayL = unit * tL;
  const delayR = unit * tR;
  const cycle = delayL + delayR;
  const fb = Math.max(0, Math.min(1, p.feedback));
  const amount = dbToLin(Math.max(-60, Math.min(12, p.amountDb)));
  const floor = dbToLin(DELAY_ECHO_FLOOR_DB);
  const mode = p.mixMode;

  let trailMs: number;
  let gensL = 1;
  let gensR = 1;
  let audible = 1;

  if (mode === 0) {
    const tRef = Math.sqrt(tL * tR);
    const fbL = Math.pow(fb, tL / Math.max(1e-6, tRef));
    const fbR = Math.pow(fb, tR / Math.max(1e-6, tRef));
    gensL = Math.max(1, gensUntilFloor(amount, fbL, floor));
    gensR = Math.max(1, gensUntilFloor(amount, fbR, floor));
    trailMs = Math.max(gensL * delayL, gensR * delayR);
  } else {
    audible = Math.max(1, gensUntilFloor(amount, fb, floor));
    // Sequential / ping-pong: one cycle per generation (PP has ~2 taps/cycle).
    trailMs = audible * Math.max(1, cycle);
  }

  const spanMs = clampSpanToReadable(
    trailMs * DELAY_ECHO_TRAIL_PAD,
    p.bpm,
    p.subdiv,
  );

  if (mode === 0) {
    const fitL = Math.ceil(spanMs / Math.max(1, delayL)) + 1;
    const fitR = Math.ceil(spanMs / Math.max(1, delayR)) + 1;
    return {
      spanMs,
      generations: clampGens(Math.max(Math.min(gensL, fitL), Math.min(gensR, fitR))),
    };
  }

  const step = Math.max(1, cycle);
  const gensForSpan = Math.ceil(spanMs / step) + 1;
  const generations = clampGens(
    Math.min(audible, mode === 1 ? gensForSpan * 2 : gensForSpan),
  );
  return { spanMs, generations };
}

function mergeTaps(taps: DelayEchoTap[]): DelayEchoTap[] {
  taps.sort((a, b) => a.tMs - b.tMs);
  const merged: DelayEchoTap[] = [];
  for (const tap of taps) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.tMs - tap.tMs) < 1e-6) {
      last.levelL += tap.levelL;
      last.levelR += tap.levelR;
    } else {
      merged.push({ ...tap });
    }
  }
  return merged;
}

/**
 * Stereo (MixStereo): independent delay lines.
 * DSP: fbL/fbR = fb^(time / sqrt(timeL*timeR)), amtL=amtR=amount.
 * Emit L and R separately so the shorter delay is not truncated by the longer.
 */
function stereoTaps(
  delayL: number,
  delayR: number,
  amount: number,
  fbL: number,
  fbR: number,
  floor: number,
  maxMs: number,
): DelayEchoTap[] {
  const taps: DelayEchoTap[] = [];
  for (let n = 1; n <= MAX_GENERATIONS; ++n) {
    const aL = amount * Math.pow(fbL, n - 1);
    const tLms = delayL * n;
    if (aL < floor || tLms > maxMs + 1e-6)
      break;
    taps.push({ tMs: tLms, levelL: aL, levelR: 0 });
  }
  for (let n = 1; n <= MAX_GENERATIONS; ++n) {
    const aR = amount * Math.pow(fbR, n - 1);
    const tRms = delayR * n;
    if (aR < floor || tRms > maxMs + 1e-6)
      break;
    taps.push({ tMs: tRms, levelL: 0, levelR: aR });
  }
  return taps;
}

/**
 * Ping-pong: buffers are cross-wired (L reads R’s line @ delayL, R reads L’s @ delayR).
 * A stereo impulse = independent L-input chain + R-input chain, summed.
 * DSP: fbL=fbR=fb, amtL=amtR=amount; each bounce multiplies by fb.
 */
function pingPongChains(
  delayL: number,
  delayR: number,
  amount: number,
  fb: number,
  floor: number,
  maxMs: number,
): DelayEchoTap[] {
  const taps: DelayEchoTap[] = [];
  const pushChain = (firstOnL: boolean) => {
    let lvl = amount;
    let t = 0;
    let onL = firstOnL;
    for (let n = 0; n < MAX_GENERATIONS * 2 && lvl >= floor; ++n) {
      t += onL ? delayL : delayR;
      if (t > maxMs + 1e-6)
        break;
      taps.push({
        tMs: t,
        levelL: onL ? lvl : 0,
        levelR: onL ? 0 : lvl,
      });
      lvl *= fb;
      onL = !onL;
    }
  };
  // R-input → first emerges on L @ delayL; L-input → first on R @ delayR.
  pushChain(true);
  pushChain(false);
  return taps;
}

/**
 * L-then-R / R-then-L (delayline2): output tap + fb tap at full cycle.
 * DSP MixLR: amtL=amount, amtR=amount*fb^(deltimeR/deltimeFb), fbL=fbR=fb
 * DSP MixRL: amtR=amount, amtL=amount*fb^(deltimeL/deltimeFb), fbL=fbR=fb
 * Echo period = cycle; levels decay by fb each cycle.
 */
function sequentialTaps(
  delayL: number,
  delayR: number,
  amount: number,
  fb: number,
  floor: number,
  maxMs: number,
  mode: 2 | 3,
): DelayEchoTap[] {
  const cycle = delayL + delayR;
  const taps: DelayEchoTap[] = [];
  if (mode === 2) {
    // MixLR: L @ delayL + n*cycle; R @ cycle + n*cycle
    const amtR0 = amount * Math.pow(fb, delayR / Math.max(1e-6, cycle));
    for (let n = 0; n < MAX_GENERATIONS; ++n) {
      const scale = Math.pow(fb, n);
      const aL = amount * scale;
      const aR = amtR0 * scale;
      const tLms = delayL + n * cycle;
      const tRms = cycle + n * cycle;
      let any = false;
      if (aL >= floor && tLms <= maxMs + 1e-6) {
        taps.push({ tMs: tLms, levelL: aL, levelR: 0 });
        any = true;
      }
      if (aR >= floor && tRms <= maxMs + 1e-6) {
        taps.push({ tMs: tRms, levelL: 0, levelR: aR });
        any = true;
      }
      if (!any || (aL < floor && aR < floor))
        break;
    }
  } else {
    // MixRL: R @ delayR + n*cycle; L @ cycle + n*cycle
    const amtL0 = amount * Math.pow(fb, delayL / Math.max(1e-6, cycle));
    for (let n = 0; n < MAX_GENERATIONS; ++n) {
      const scale = Math.pow(fb, n);
      const aR = amount * scale;
      const aL = amtL0 * scale;
      const tRms = delayR + n * cycle;
      const tLms = cycle + n * cycle;
      let any = false;
      if (aR >= floor && tRms <= maxMs + 1e-6) {
        taps.push({ tMs: tRms, levelL: 0, levelR: aR });
        any = true;
      }
      if (aL >= floor && tLms <= maxMs + 1e-6) {
        taps.push({ tMs: tLms, levelL: aL, levelR: 0 });
        any = true;
      }
      if (!any || (aL < floor && aR < floor))
        break;
    }
  }
  return taps;
}

/**
 * Build echo taps for a unit impulse into L+R (primed delay lines).
 * Pass optional span via `planDelayEchoView` (`maxMs`).
 */
export function buildDelayEchoTaps(
  p: DelayEchoParams,
  opts?: { maxMs?: number },
): DelayEchoTap[] {
  const unit = delayUnitMs(p.bpm, p.subdiv);
  const tL = Math.max(1, Math.round(p.timeL));
  const tR = Math.max(1, Math.round(p.timeR));
  const delayL = unit * tL;
  const delayR = unit * tR;
  const fb = Math.max(0, Math.min(1, p.feedback));
  const amount = dbToLin(Math.max(-60, Math.min(12, p.amountDb)));
  const mode = p.mixMode;
  const floor = dbToLin(DELAY_ECHO_FLOOR_DB);
  const maxMs = opts?.maxMs ?? Number.POSITIVE_INFINITY;

  let taps: DelayEchoTap[];
  if (mode === 0) {
    const tRef = Math.sqrt(tL * tR);
    const fbL = Math.pow(fb, tL / Math.max(1e-6, tRef));
    const fbR = Math.pow(fb, tR / Math.max(1e-6, tRef));
    taps = stereoTaps(delayL, delayR, amount, fbL, fbR, floor, maxMs);
  } else if (mode === 1) {
    taps = pingPongChains(delayL, delayR, amount, fb, floor, maxMs);
  } else {
    taps = sequentialTaps(
      delayL,
      delayR,
      amount,
      fb,
      floor,
      maxMs,
      mode === 2 ? 2 : 3,
    );
  }

  return mergeTaps(taps);
}

export function linToDb(lin: number, minDb = DELAY_ECHO_FLOOR_DB): number {
  if (!(lin > 1e-12))
    return minDb;
  return Math.max(minDb, Math.min(12, 20 * Math.log10(lin)));
}
