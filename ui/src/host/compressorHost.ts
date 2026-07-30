import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/compressorModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizEnvelope,
  bindVizGr,
  bindVizPoint,
  postBegin,
  postEnd,
} from '../bind_param';

export const COMPRESSOR_MODE_ENTRIES = [
  { label: 'Peak', value: 0 },
  { label: 'RMS', value: 1 },
  { label: 'Opto', value: 2 },
];

export const COMPRESSOR_LINK_ENTRIES = [
  { label: 'Max', value: 0 },
  { label: 'Avg', value: 1 },
  { label: 'Mid', value: 2 },
];

export type ICompressorHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  threshold$: DynamicValue<number>;
  ratio$: DynamicValue<number>;
  knee$: DynamicValue<number>;
  attack$: DynamicValue<number>;
  release$: DynamicValue<number>;
  makeup$: DynamicValue<number>;
  mix$: DynamicValue<number>;
  mode$: DynamicValue<number>;
  link$: DynamicValue<number>;
  pdr$: DynamicValue<number>;
  hipass$: DynamicValue<number>;
  lopass$: DynamicValue<number>;
  hpMode$: DynamicValue<number>;
  lpMode$: DynamicValue<number>;
  listen$: DynamicValue<boolean>;
  /** Gain reduction magnitude in dB (0 = none, up to 60). */
  gr$: DynamicValue<number>;
  /** Transfer operating point [inDb, outDb]. */
  point$: DynamicValue<number[]>;
  /** History buffer: audio peak + GR (lin) per slot + phase. */
  historyData$: DynamicValue<Float32Array | null>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

/** DSP descriptor default (plain) for AUX Knob double-click reset. */
export function compressorParamDefault(
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

export function createBoundCompressorHost(): ICompressorHost {
  const gr$ = DynamicValue.fromConstant(0);
  const point$ = DynamicValue.fromConstant<number[]>([-96, -96]);
  const historyData$ = DynamicValue.fromConstant<Float32Array | null>(null);
  bindVizGr(gr$, 'comp');
  bindVizPoint(point$, 'comp');
  bindVizEnvelope(historyData$, 'comp');

  return {
    meta: pluginMeta,
    bypass$: bindBool('bypass'),
    threshold$: bindNum('threshold', -20),
    ratio$: bindNum('ratio', 4),
    knee$: bindNum('knee', 6),
    attack$: bindNum('attack', 20),
    release$: bindNum('release', 200),
    makeup$: bindNum('makeup', 0),
    mix$: bindNum('mix', 1),
    mode$: bindNum('mode', 0),
    link$: bindNum('link', 0),
    pdr$: bindNum('pdr', 0),
    hipass$: bindNum('hipass', 120),
    lopass$: bindNum('lopass', 5000),
    hpMode$: bindNum('hp_mode', 0),
    lpMode$: bindNum('lp_mode', 0),
    listen$: bindBool('listen'),
    gr$,
    point$,
    historyData$,
    beginEdit: postBegin,
    endEdit: postEnd,
  };
}
