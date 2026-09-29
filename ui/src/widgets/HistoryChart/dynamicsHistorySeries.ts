import type { DynamicValue } from '@deutschesoft/awml';
import { historyLinToDb, type HistorySeries } from './HistoryChart';

/**
 * Experiment: Tamer-like full input/output fills instead of Cut tips.
 * Set `false` to restore the previous Cut-tips stack (warn tip fill).
 */
const HISTORY_TAMER_FILLS = true;

/** Shared look — active when {@link HISTORY_TAMER_FILLS} is true. */
const DYN_TAMER = {
  input: 'fill-full fill-gradient stroke-none',
  output: 'fill-background fill-semi stroke-none',
  trigger: 'fill-none stroke-color stroke-thinnest stroke-rich',
  gr: 'stroke-color fill-none',
  thresh: 'stroke-thinner stroke-color stroke-dashed fill-none',
} as const;

/** Shared look — previous Cut-tips stack (revert target). */
const DYN_CUT = {
  output: 'fill-color fill-soft stroke-none',
  cut: 'fill-warn fill-rich stroke-none',
  trigger: 'fill-none stroke-color stroke-thinnest stroke-rich',
  gr: 'stroke-color fill-none',
  thresh: 'stroke-thinner stroke-color stroke-dashed fill-none',
} as const;

const DYN = HISTORY_TAMER_FILLS ? DYN_TAMER : DYN_CUT;

function triggerSeries(channel = 0): HistorySeries {
  return {
    id: 'trigger',
    name: 'Trigger',
    short: 'Trig',
    channel,
    className: DYN.trigger,
    mode: 'line',
    toFront: true,
  };
}

function grSeries(channel: number): HistorySeries {
  return {
    id: 'gr',
    name: 'Gain reduction',
    short: 'GR',
    channel,
    className: DYN.gr,
    mode: 'line',
    toFront: true,
  };
}

function threshSeries(
  channel: number,
  name = 'Threshold',
  short = 'Thresh',
): HistorySeries {
  return {
    id: 'thresh',
    name,
    short,
    channel,
    className: DYN.thresh,
    mode: 'line',
    toFront: true,
  };
}

/**
 * Shared Comp history stack (4ch):
 * Channels: [trigger, grLin, outPeak, threshLin].
 */
export function dynamicsHistorySeries(): HistorySeries[] {
  if (HISTORY_TAMER_FILLS) {
    return [
      {
        id: 'input',
        name: 'Input (pre GR)',
        short: 'In',
        channel: 2,
        scaleGrChannel: 1,
        scaleGrMode: 'expand',
        className: DYN_TAMER.input,
        mode: 'bottom',
      },
      {
        id: 'output',
        name: 'Output (post GR)',
        short: 'Out',
        channel: 2,
        className: DYN_TAMER.output,
        mode: 'bottom',
      },
      triggerSeries(0),
      grSeries(1),
      threshSeries(3),
    ];
  }

  return [
    {
      id: 'output',
      name: 'Output (post GR)',
      short: 'Out',
      channel: 2,
      className: DYN_CUT.output,
      mode: 'bottom',
    },
    {
      id: 'cut',
      name: 'Cut (GR only)',
      short: 'Cut',
      channel: 2,
      diffGrChannel: 1,
      diffGrMode: 'expand',
      className: DYN_CUT.cut,
      mode: 'fill',
    },
    triggerSeries(0),
    grSeries(1),
    threshSeries(3),
  ];
}

/**
 * Deesser history (5ch):
 * Channels: [trigger, grLin, postPeak, threshLin, prePeak].
 */
export function deesserHistorySeries(): HistorySeries[] {
  if (HISTORY_TAMER_FILLS) {
    return [
      {
        id: 'input',
        name: 'Input (pre GR)',
        short: 'In',
        channel: 4,
        className: DYN_TAMER.input,
        mode: 'bottom',
      },
      {
        id: 'output',
        name: 'Output (post GR)',
        short: 'Out',
        channel: 2,
        className: DYN_TAMER.output,
        mode: 'bottom',
      },
      triggerSeries(0),
      grSeries(1),
      threshSeries(3),
    ];
  }

  return [
    {
      id: 'output',
      name: 'Output (post GR)',
      short: 'Out',
      channel: 2,
      className: DYN_CUT.output,
      mode: 'bottom',
    },
    {
      id: 'cut',
      name: 'Cut (pre − post)',
      short: 'Cut',
      channel: 4,
      diffChannel: 2,
      className: DYN_CUT.cut,
      mode: 'fill',
    },
    triggerSeries(0),
    grSeries(1),
    threshSeries(3),
  ];
}

/**
 * Mbcomp per-band strip (3ch, 2 s window):
 * Channels: [bandPostGr, grLin, threshLin].
 */
export function mbcompHistorySeries(): HistorySeries[] {
  if (HISTORY_TAMER_FILLS) {
    return [
      {
        id: 'input',
        name: 'Band input (pre GR)',
        short: 'In',
        channel: 0,
        scaleGrChannel: 1,
        scaleGrMode: 'expand',
        className: DYN_TAMER.input,
        mode: 'bottom',
      },
      {
        id: 'output',
        name: 'Band output (post GR)',
        short: 'Out',
        channel: 0,
        className: DYN_TAMER.output,
        mode: 'bottom',
      },
      grSeries(1),
      threshSeries(2),
    ];
  }

  return [
    {
      id: 'output',
      name: 'Band output (post GR)',
      short: 'Out',
      channel: 0,
      className: DYN_CUT.output,
      mode: 'bottom',
    },
    {
      id: 'cut',
      name: 'Cut (GR only)',
      short: 'Cut',
      channel: 0,
      diffGrChannel: 1,
      diffGrMode: 'expand',
      className: DYN_CUT.cut,
      mode: 'fill',
    },
    grSeries(1),
    threshSeries(2),
  ];
}

/**
 * Limiter history (3ch, 4 s window):
 * Channels: [outPeak, grLin, limitLin].
 */
export function limiterHistorySeries(): HistorySeries[] {
  if (HISTORY_TAMER_FILLS) {
    return [
      {
        id: 'input',
        name: 'Input (pre GR)',
        short: 'In',
        channel: 0,
        scaleGrChannel: 1,
        scaleGrMode: 'expand',
        className: DYN_TAMER.input,
        mode: 'bottom',
      },
      {
        id: 'output',
        name: 'Output (post GR)',
        short: 'Out',
        channel: 0,
        className: DYN_TAMER.output,
        mode: 'bottom',
      },
      grSeries(1),
      threshSeries(2, 'Limit', 'Limit'),
    ];
  }

  return [
    {
      id: 'output',
      name: 'Output (post GR)',
      short: 'Out',
      channel: 0,
      className: DYN_CUT.output,
      mode: 'bottom',
    },
    {
      id: 'cut',
      name: 'Cut (GR only)',
      short: 'Cut',
      channel: 0,
      diffGrChannel: 1,
      diffGrMode: 'expand',
      className: DYN_CUT.cut,
      mode: 'fill',
    },
    grSeries(1),
    threshSeries(2, 'Limit', 'Limit'),
  ];
}

/** Mblimiter per-band strip — same layout/styles as Limiter (2 s window). */
export function mblimiterHistorySeries(): HistorySeries[] {
  return limiterHistorySeries();
}

/**
 * Expander history (8ch):
 * [trigger, grLin, outPeak, threshLin, inv1Amt, inv2Amt, inv1Peak, inv2Peak].
 *
 * Detector: In/Out + Trig/GR toggles + Inv hold toggles.
 * Inv panel: same Trig/GR toggles + that Inv’s post fill + hold stroke + Inv thresh.
 */
export function expanderHistorySeries(opts: {
  inv1Visible$: DynamicValue<boolean>;
  inv2Visible$: DynamicValue<boolean>;
  /** Detector panel — In/Out. */
  detectorListed$: DynamicValue<boolean>;
  /** Detector + Inv1 armed — Inv1 hold legend toggle. */
  inv1DetectorListed$: DynamicValue<boolean>;
  /** Detector + Inv2 armed — Inv2 hold legend toggle. */
  inv2DetectorListed$: DynamicValue<boolean>;
  inv1PanelListed$: DynamicValue<boolean>;
  inv2PanelListed$: DynamicValue<boolean>;
  /**
   * When set to a finite dB, thresh series is a flat Inv threshold line.
   * `null` → detector thresh from the envelope blob.
   */
  threshFlatDb$: DynamicValue<number | null>;
}): HistorySeries[] {
  const base = dynamicsHistorySeries().map((s) => {
    if (s.id === 'input') {
      return {
        ...s,
        className: 'fill-gradient fill-soft stroke-none',
        listed$: opts.detectorListed$,
      };
    }
    if (s.id === 'output') {
      return {
        ...s,
        className: 'fill-gradient fill-full stroke-none',
        listed$: opts.detectorListed$,
      };
    }
    if (s.id === 'gr') {
      return {
        ...s,
        className: 'stroke-color stroke-mostly stroke-thinner fill-none',
      };
    }
    if (s.id === 'thresh') {
      return {
        ...s,
        flatDb$: opts.threshFlatDb$,
      };
    }
    return s;
  });
  return [
    // Inv post fills sit under Trig/GR/Thresh/Hold.
    {
      id: 'inv1Post',
      name: 'Inhibit 1 (post filter)',
      short: 'I1',
      channel: 6,
      className: 'fill-gradient fill-mostly stroke-none',
      mode: 'bottom',
      listed$: opts.inv1PanelListed$,
    },
    {
      id: 'inv2Post',
      name: 'Inhibit 2 (post filter)',
      short: 'I2',
      channel: 7,
      className: 'fill-gradient fill-mostly stroke-none',
      mode: 'bottom',
      listed$: opts.inv2PanelListed$,
    },
    ...base,
    {
      id: 'inv1HoldInv',
      name: 'Inhibit 1 hold',
      short: 'H1',
      channel: 4,
      className: 'fill-none stroke-accent stroke-solid stroke-full',
      mode: 'line',
      toFront: true,
      listed$: opts.inv1PanelListed$,
    },
    {
      id: 'inv1',
      name: 'Inhibit 1 hold',
      short: 'Inv1',
      channel: 4,
      className: 'fill-none stroke-accent stroke-rich stroke-dashed',
      mode: 'line',
      toFront: true,
      listed$: opts.inv1DetectorListed$,
      visible$: opts.inv1Visible$,
      toggle: true,
    },
    {
      id: 'inv2HoldInv',
      name: 'Inhibit 2 hold',
      short: 'H2',
      channel: 5,
      className: 'fill-none stroke-warn stroke-solid stroke-full',
      mode: 'line',
      toFront: true,
      listed$: opts.inv2PanelListed$,
    },
    {
      id: 'inv2',
      name: 'Inhibit 2 hold',
      short: 'Inv2',
      channel: 5,
      className: 'fill-none stroke-warn stroke-rich stroke-dashed',
      mode: 'line',
      toFront: true,
      listed$: opts.inv2DetectorListed$,
      visible$: opts.inv2Visible$,
      toggle: true,
    },
  ];
}

/**
 * Linear abs peak → height above the bipolar zero line (dB).
 * Silence / floor (−60) → 0; 0 dBFS → 60. L uses +h, R uses −h.
 */
function bipolarHeightDb(lin: number): number {
  // historyLinToDb: −60…0 → lift so loud moves away from center.
  return Math.min(60, Math.max(0, historyLinToDb(lin) + 60));
}

/**
 * Pulsator bipolar stereo history (4ch):
 * Channels: [inL, outL, inR, outR] linear abs peaks.
 * Y is signed dB height from center (range −60…+60): L positive, R negative.
 * Soft In under full Out so ducking tips glow.
 * AUX `mode: 'center'` fills toward the chart mid (= 0 dB).
 * (Graph `base` is a 0…1 canvas fraction, not a range-unit value.)
 */
export function pulsatorHistorySeries(): HistorySeries[] {
  const up = (lin: number) => bipolarHeightDb(lin);
  const down = (lin: number) => -bipolarHeightDb(lin);
  const soft = 'fill-gradient fill-soft stroke-none';
  const full = 'fill-gradient fill-full stroke-none';
  return [
    // Paint order: R first (under), then L — center fills meet at 0.
    {
      id: 'rin',
      name: 'Right input',
      short: 'R In',
      channel: 2,
      className: soft,
      mode: 'center',
      transform: down,
    },
    {
      id: 'rout',
      name: 'Right output',
      short: 'R Out',
      channel: 3,
      className: full,
      mode: 'center',
      transform: down,
    },
    {
      id: 'lin',
      name: 'Left input',
      short: 'L In',
      channel: 0,
      className: soft,
      mode: 'center',
      transform: up,
    },
    {
      id: 'lout',
      name: 'Left output',
      short: 'L Out',
      channel: 1,
      className: full,
      mode: 'center',
      transform: up,
    },
  ];
}

/**
 * Crusher bipolar stereo history (4ch):
 * Channels: [inL, outL, inR, outR] linear abs peaks (DSP warps out for soft crush).
 * Same L↑/R↓ layout as Pulsator, but Transients-style outer=max / mask=min so
 * both boost (quant spikes / DC) and cut (bit-collapse) tips glow.
 */
export function crusherHistorySeries(): HistorySeries[] {
  const up = (lin: number) => bipolarHeightDb(lin);
  const down = (lin: number) => -bipolarHeightDb(lin);
  const outer = 'fill-gradient fill-full stroke-none';
  const mask = 'fill-background fill-semi stroke-none';
  const line = 'fill-none stroke-color stroke-thinner stroke-mostly';
  return [
    // Paint order: R outer → R mask → L outer → L mask → thin outs.
    {
      id: 'router',
      name: 'Right envelope',
      short: 'R',
      channel: 2,
      pairChannel: 3,
      pairMode: 'max',
      className: outer,
      mode: 'center',
      transform: down,
    },
    {
      id: 'rmask',
      name: 'Right shared',
      short: 'R∩',
      channel: 2,
      pairChannel: 3,
      pairMode: 'min',
      className: mask,
      mode: 'center',
      transform: down,
    },
    {
      id: 'louter',
      name: 'Left envelope',
      short: 'L',
      channel: 0,
      pairChannel: 1,
      pairMode: 'max',
      className: outer,
      mode: 'center',
      transform: up,
    },
    {
      id: 'lmask',
      name: 'Left shared',
      short: 'L∩',
      channel: 0,
      pairChannel: 1,
      pairMode: 'min',
      className: mask,
      mode: 'center',
      transform: up,
    },
    {
      id: 'rout',
      name: 'Right output',
      short: 'R Out',
      channel: 3,
      className: line,
      mode: 'line',
      transform: down,
      toFront: true,
    },
    {
      id: 'lout',
      name: 'Left output',
      short: 'L Out',
      channel: 1,
      className: line,
      mode: 'line',
      transform: up,
      toFront: true,
    },
  ];
}
