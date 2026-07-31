import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/deesserModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizEnvelope,
  bindVizGr,
  postBegin,
  postEnd,
} from '../bind_param';
import {
  type EqPassSlope,
  type IEqualizerBand,
  toAuxEqType,
} from './equalizerHost';

export const DEESSER_MODE_ENTRIES = [
  { label: 'Wide', value: 0 },
  { label: 'Split', value: 1 },
];

export const DEESSER_DETECTION_ENTRIES = [
  { label: 'Peak', value: 0 },
  { label: 'RMS', value: 1 },
  { label: 'Opto', value: 2 },
];

/** Linkwitz-Riley audio split / detection stage count: 12 / 24 / 48 only. */
export const DEESSER_SLOPE_ENTRIES = [
  { label: '12', value: 12 },
  { label: '24', value: 24 },
  { label: '48', value: 48 },
];

export type IDeesserHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  mode$: DynamicValue<number>;
  detection$: DynamicValue<number>;
  slope$: DynamicValue<number>;
  threshold$: DynamicValue<number>;
  ratio$: DynamicValue<number>;
  laxity$: DynamicValue<number>;
  makeup$: DynamicValue<number>;
  splitFreq$: DynamicValue<number>;
  hpQ$: DynamicValue<number>;
  peakFreq$: DynamicValue<number>;
  peakGain$: DynamicValue<number>;
  peakQ$: DynamicValue<number>;
  listen$: DynamicValue<boolean>;
  gr$: DynamicValue<number>;
  historyData$: DynamicValue<Float32Array | null>;
  /** Fake EQ bands for detection chart (HP + peaking). */
  filterBands: IEqualizerBand[];
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function deesserParamDefault(
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

function snapSlope(v: number): EqPassSlope {
  if (v >= 36) return 48;
  if (v >= 18) return 24;
  return 12;
}

function makeFilterBands(
  splitFreq$: DynamicValue<number>,
  hpQ$: DynamicValue<number>,
  peakFreq$: DynamicValue<number>,
  peakGain$: DynamicValue<number>,
  peakQ$: DynamicValue<number>,
  slopePlain$: DynamicValue<number>,
): IEqualizerBand[] {
  const make = (
    index: number,
    id: string,
    type: 'highpass' | 'parametric',
    frequency$: DynamicValue<number>,
    gain$: DynamicValue<number>,
    q$: DynamicValue<number>,
    slope$: DynamicValue<EqPassSlope>,
  ): IEqualizerBand => {
    const type$ = DynamicValue.fromConstant(type);
    const auxType$ = DynamicValue.fromConstant(
      toAuxEqType(type, slope$.value),
    );
    const syncAux = () => auxType$.set(toAuxEqType(type, slope$.value));
    type$.subscribe(syncAux, false);
    slope$.subscribe(syncAux, false);
    const effectiveGain$ = DynamicValue.fromConstant(gain$.value);
    gain$.subscribe((v) => effectiveGain$.set(v), false);
    return {
      index,
      id,
      gain$,
      effectiveGain$,
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
      defaults: {
        gain: gain$.value,
        frequency: frequency$.value,
        q: q$.value,
        dynAttack: 20,
        dynRelease: 200,
        dynThreshold: -36,
        dynRatio: 2,
      },
    };
  };

  const slope$ = DynamicValue.fromConstant<EqPassSlope>(
    snapSlope(slopePlain$.value),
  );
  slopePlain$.subscribe((v) => {
    const s = snapSlope(v);
    if (slope$.value !== s) slope$.set(s);
  }, false);

  const hpGain$ = DynamicValue.fromConstant(0);
  return [
    make(0, 'deess-hp', 'highpass', splitFreq$, hpGain$, hpQ$, slope$),
    make(1, 'deess-peak', 'parametric', peakFreq$, peakGain$, peakQ$, slope$),
  ];
}

export function createBoundDeesserHost(): IDeesserHost {
  const gr$ = DynamicValue.fromConstant(0);
  const historyData$ = DynamicValue.fromConstant<Float32Array | null>(null);
  bindVizGr(gr$, 'deess');
  bindVizEnvelope(historyData$, 'deess');

  const splitFreq$ = bindNum('split_freq', 6000);
  const hpQ$ = bindNum('hp_q', 0.707);
  const peakFreq$ = bindNum('peak_freq', 4500);
  const peakGain$ = bindNum('peak_gain', 12);
  const peakQ$ = bindNum('peak_q', 1);
  const slope$ = bindNum('slope', 24);

  return {
    meta: pluginMeta,
    bypass$: bindBool('bypass'),
    mode$: bindNum('mode', 0),
    detection$: bindNum('detection', 1),
    slope$,
    threshold$: bindNum('threshold', -18),
    ratio$: bindNum('ratio', 3),
    laxity$: bindNum('laxity', 15),
    makeup$: bindNum('makeup', 0),
    splitFreq$,
    hpQ$,
    peakFreq$,
    peakGain$,
    peakQ$,
    listen$: bindBool('listen'),
    gr$,
    historyData$,
    filterBands: makeFilterBands(
      splitFreq$,
      hpQ$,
      peakFreq$,
      peakGain$,
      peakQ$,
      slope$,
    ),
    beginEdit: postBegin,
    endEdit: postEnd,
  };
}
