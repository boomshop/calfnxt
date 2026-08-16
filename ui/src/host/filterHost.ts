import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/filterModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizHz,
  postBegin,
  postEnd,
} from '../bind_param';
import {
  type EqFilterType,
  type EqPassSlope,
  type IEqualizerBand,
  toAuxEqType,
} from './equalizerHost';
import {
  auxAllpassFlat,
  auxBandPass12,
  auxBandPass24,
  auxBandPass36,
  auxNotch12,
  auxNotch24,
  auxNotch36,
} from '../dsp/eqFilters';

/** Multimode list (plain 0…12). LP/HP top slope is 48 dB (not Calf 36). */
export const FILTER_MODE_ENTRIES = [
  { label: 'Low Pass 12', value: 0 },
  { label: 'Low Pass 24', value: 1 },
  { label: 'Low Pass 48', value: 2 },
  { label: 'High Pass 12', value: 3 },
  { label: 'High Pass 24', value: 4 },
  { label: 'High Pass 48', value: 5 },
  { label: 'Band Pass 6', value: 6 },
  { label: 'Band Pass 12', value: 7 },
  { label: 'Band Pass 18', value: 8 },
  { label: 'Band Reject 6', value: 9 },
  { label: 'Band Reject 12', value: 10 },
  { label: 'Band Reject 18', value: 11 },
  { label: 'Allpass', value: 12 },
];

export const FILTER_DETECTION_ENTRIES = [
  { label: 'Peak', value: 0 },
  { label: 'RMS', value: 1 },
  { label: 'Opto', value: 2 },
];

export type IFilterHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  mode$: DynamicValue<number>;
  resonance$: DynamicValue<number>;
  frequency$: DynamicValue<number>;
  inertia$: DynamicValue<number>;
  envPower$: DynamicValue<boolean>;
  mix$: DynamicValue<number>;
  softClip$: DynamicValue<number>;
  target$: DynamicValue<number>;
  activation$: DynamicValue<number>;
  attack$: DynamicValue<number>;
  release$: DynamicValue<number>;
  detection$: DynamicValue<number>;
  /** Main response + optional Target handle when envelope is on. */
  filterBands: IEqualizerBand[];
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function filterParamDefault(
  name: keyof typeof paramIds,
  fallback = 0,
): number {
  return paramDefault(name, fallback);
}

function bindNum(name: keyof typeof paramIds, fallback = 0): DynamicValue<number> {
  const dv = DynamicValue.fromConstant(paramDefault(name, fallback));
  bindParamToHost(dv, paramIds[name]);
  return dv;
}

function bindBool(name: keyof typeof paramIds): DynamicValue<boolean> {
  const dv = DynamicValue.fromConstant(paramDefault(name, 0) >= 0.5);
  bindBoolParamToHost(dv, paramIds[name]);
  return dv;
}

function formatHandleFreq(title: string, hz: number): string {
  if (!Number.isFinite(hz)) return title;
  const freq =
    hz >= 1000
      ? `${(hz / 1000).toFixed(hz >= 10000 ? 0 : 1)} kHz`
      : `${Math.round(hz)} Hz`;
  return `${title}\n${freq}`;
}

type ChartKind = 'lowpass' | 'highpass' | 'bandpass' | 'notch' | 'allpass';

function modeToChart(mode: number): {
  kind: ChartKind;
  type: EqFilterType;
  slope: EqPassSlope;
  stages: 1 | 2 | 3 | 4;
} {
  const m = Math.round(Math.min(12, Math.max(0, mode)));
  if (m <= 2) {
    const stages = (m === 2 ? 4 : m + 1) as 1 | 2 | 4;
    const slope = (stages * 12) as EqPassSlope;
    return { kind: 'lowpass', type: 'lowpass', slope, stages };
  }
  if (m <= 5) {
    const idx = m - 3;
    const stages = (idx === 2 ? 4 : idx + 1) as 1 | 2 | 4;
    const slope = (stages * 12) as EqPassSlope;
    return { kind: 'highpass', type: 'highpass', slope, stages };
  }
  if (m <= 8) {
    const stages = (m - 5) as 1 | 2 | 3;
    return { kind: 'bandpass', type: 'bandpass', slope: 12, stages };
  }
  if (m <= 11) {
    const stages = (m - 8) as 1 | 2 | 3;
    return { kind: 'notch', type: 'parametric', slope: 12, stages };
  }
  return { kind: 'allpass', type: 'parametric', slope: 12, stages: 1 };
}

function auxForChart(kind: ChartKind, stages: 1 | 2 | 3 | 4, slope: EqPassSlope) {
  switch (kind) {
    case 'lowpass':
    case 'highpass':
      return toAuxEqType(kind, slope);
    case 'bandpass':
      if (stages >= 3) return auxBandPass36;
      if (stages === 2) return auxBandPass24;
      return auxBandPass12;
    case 'notch':
      if (stages >= 3) return auxNotch36;
      if (stages === 2) return auxNotch24;
      return auxNotch12;
    case 'allpass':
      return auxAllpassFlat;
  }
}

function stageQ(resonance: number, stages: number): number {
  return Math.pow(Math.max(0.1, resonance), 1 / Math.max(1, stages));
}

function resonanceFromStageQ(q: number, stages: number, kind: ChartKind): number {
  const qq = Math.max(0.05, q);
  if (kind === 'notch')
    return Math.min(32, Math.max(0.707, qq / (stages * 0.1)));
  return Math.min(32, Math.max(0.707, Math.pow(qq, stages)));
}

function chartQFromResonance(resonance: number, stages: number, kind: ChartKind): number {
  if (kind === 'notch')
    return stages * 0.1 * Math.max(0.1, resonance);
  return stageQ(resonance, stages);
}

function makeFilterBands(
  mode$: DynamicValue<number>,
  frequency$: DynamicValue<number>,
  resonance$: DynamicValue<number>,
  target$: DynamicValue<number>,
  envPower$: DynamicValue<boolean>,
  curveFreq$: DynamicValue<number>,
): IEqualizerBand[] {
  const chart = modeToChart(mode$.value);
  // Handle: vertical line. Curve uses auxType$ + curveFreq$ (live cutoff).
  const type$ = DynamicValue.fromConstant<EqFilterType>('bandpass');
  const slope$ = DynamicValue.fromConstant<EqPassSlope>(chart.slope);
  const auxType$ = DynamicValue.fromConstant(
    auxForChart(chart.kind, chart.stages, chart.slope),
  );
  const q$ = DynamicValue.fromConstant(
    chartQFromResonance(resonance$.value, chart.stages, chart.kind),
  );
  const gain$ = DynamicValue.fromConstant(0);
  const effectiveGain$ = DynamicValue.fromConstant(0);

  let syncingQ = false;
  const pushQFromResonance = () => {
    const c = modeToChart(mode$.value);
    const next = chartQFromResonance(resonance$.value, c.stages, c.kind);
    if (Math.abs(q$.value - next) > 1e-6) {
      syncingQ = true;
      q$.set(next);
      syncingQ = false;
    }
  };

  const syncMode = () => {
    const c = modeToChart(mode$.value);
    if (slope$.value !== c.slope) slope$.set(c.slope);
    auxType$.set(auxForChart(c.kind, c.stages, c.slope));
    pushQFromResonance();
  };
  mode$.subscribe(syncMode, false);
  resonance$.subscribe(() => {
    if (syncingQ) return;
    pushQFromResonance();
  }, false);
  q$.subscribe((q) => {
    if (syncingQ) return;
    const c = modeToChart(mode$.value);
    const next = resonanceFromStageQ(q, c.stages, c.kind);
    if (Math.abs(resonance$.value - next) > 1e-4) {
      syncingQ = true;
      resonance$.set(next);
      syncingQ = false;
    }
  }, false);

  const main: IEqualizerBand = {
    index: 0,
    id: 'filter-main',
    gain$,
    effectiveGain$,
    effectiveFrequency$: curveFreq$,
    frequency$,
    q$,
    type$,
    slope$,
    auxType$,
    active$: DynamicValue.fromConstant(true),
    dyn$: DynamicValue.fromConstant(false),
    dynAttack$: DynamicValue.fromConstant(20),
    dynRelease$: DynamicValue.fromConstant(200),
    dynThreshold$: DynamicValue.fromConstant(-36),
    dynRatio$: DynamicValue.fromConstant(2),
    listen$: DynamicValue.fromConstant(false),
    handleLabel: 'Freq',
    formatHandleLabel: (label, hz) => formatHandleFreq(label, hz),
    defaults: {
      gain: 0,
      frequency: frequency$.value,
      q: q$.value,
      dynAttack: 20,
      dynRelease: 200,
      dynThreshold: -36,
      dynRatio: 2,
    },
  };

  const targetType$ = DynamicValue.fromConstant<EqFilterType>('bandpass');
  const targetSlope$ = DynamicValue.fromConstant<EqPassSlope>(12);
  const targetAux$ = DynamicValue.fromConstant(auxAllpassFlat);
  const targetQ$ = DynamicValue.fromConstant(1);
  const targetGain$ = DynamicValue.fromConstant(0);
  const targetActive$ = DynamicValue.fromConstant(envPower$.value);
  envPower$.subscribe((v) => targetActive$.set(v), false);

  const targetBand: IEqualizerBand = {
    index: 1,
    id: 'filter-target',
    gain$: targetGain$,
    effectiveGain$: targetGain$,
    frequency$: target$,
    q$: targetQ$,
    type$: targetType$,
    slope$: targetSlope$,
    auxType$: targetAux$,
    active$: targetActive$,
    dyn$: DynamicValue.fromConstant(false),
    dynAttack$: DynamicValue.fromConstant(20),
    dynRelease$: DynamicValue.fromConstant(200),
    dynThreshold$: DynamicValue.fromConstant(-36),
    dynRatio$: DynamicValue.fromConstant(2),
    listen$: DynamicValue.fromConstant(false),
    handleLabel: 'Target',
    formatHandleLabel: (label, hz) => formatHandleFreq(label, hz),
    defaults: {
      gain: 0,
      frequency: target$.value,
      q: 1,
      dynAttack: 20,
      dynRelease: 200,
      dynThreshold: -36,
      dynRatio: 2,
    },
  };

  return [main, targetBand];
}

export function createBoundFilterHost(): IFilterHost {
  const mode$ = bindNum('mode', 0);
  const frequency$ = bindNum('frequency', 1000);
  const resonance$ = bindNum('resonance', 0.707);
  const target$ = bindNum('target', 4000);
  const envPower$ = bindBool('env_power');
  const curveFreq$ = DynamicValue.fromConstant(frequency$.value);
  bindVizHz(curveFreq$, 'filt');
  frequency$.subscribe((hz) => {
    if (!envPower$.value) curveFreq$.set(hz);
  }, false);
  envPower$.subscribe((on) => {
    if (!on) curveFreq$.set(frequency$.value);
  }, false);

  return {
    meta: pluginMeta,
    bypass$: bindBool('bypass'),
    mode$,
    resonance$,
    frequency$,
    inertia$: bindNum('inertia', 20),
    envPower$,
    mix$: bindNum('mix', 1),
    softClip$: bindNum('soft_clip', 0),
    target$,
    activation$: bindNum('activation', 0),
    attack$: bindNum('attack', 20),
    release$: bindNum('release', 200),
    detection$: bindNum('detection', 2),
    filterBands: makeFilterBands(
      mode$,
      frequency$,
      resonance$,
      target$,
      envPower$,
      curveFreq$,
    ),
    beginEdit: postBegin,
    endEdit: postEnd,
  };
}
