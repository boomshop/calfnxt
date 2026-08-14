import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/expanderModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizEnvelope,
  bindVizGr,
  bindVizPoint,
  postBegin,
  postEnd,
} from '../bind_param';
import {
  COMPRESSOR_LINK_ENTRIES,
  COMPRESSOR_MODE_ENTRIES,
} from './compressorHost';

export const EXPANDER_MODE_ENTRIES = COMPRESSOR_MODE_ENTRIES;
export const EXPANDER_LINK_ENTRIES = COMPRESSOR_LINK_ENTRIES;

export type IExpanderHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  threshold$: DynamicValue<number>;
  releaseThreshold$: DynamicValue<number>;
  ratio$: DynamicValue<number>;
  knee$: DynamicValue<number>;
  attack$: DynamicValue<number>;
  hold$: DynamicValue<number>;
  release$: DynamicValue<number>;
  range$: DynamicValue<number>;
  mode$: DynamicValue<number>;
  link$: DynamicValue<number>;
  hipass$: DynamicValue<number>;
  lopass$: DynamicValue<number>;
  hpMode$: DynamicValue<number>;
  lpMode$: DynamicValue<number>;
  listen$: DynamicValue<boolean>;
  gr$: DynamicValue<number>;
  point$: DynamicValue<number[]>;
  historyData$: DynamicValue<Float32Array | null>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function expanderParamDefault(
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

export function createBoundExpanderHost(): IExpanderHost {
  const gr$ = DynamicValue.fromConstant(0);
  const point$ = DynamicValue.fromConstant<number[]>([-96, -96]);
  const historyData$ = DynamicValue.fromConstant<Float32Array | null>(null);
  bindVizGr(gr$, 'exp');
  bindVizPoint(point$, 'exp');
  bindVizEnvelope(historyData$, 'exp');

  const threshold$ = bindNum('threshold', -32);
  const releaseThreshold$ = bindNum('release_threshold', -32);

  // Keep release ≤ open in the UI model (DSP also clamps).
  threshold$.subscribe((t) => {
    if (releaseThreshold$.value > t) releaseThreshold$.set(t);
  });

  return {
    meta: pluginMeta,
    bypass$: bindBool('bypass'),
    threshold$,
    releaseThreshold$,
    ratio$: bindNum('ratio', 4),
    knee$: bindNum('knee', 6),
    attack$: bindNum('attack', 5),
    hold$: bindNum('hold', 0),
    release$: bindNum('release', 120),
    range$: bindNum('range', -60),
    mode$: bindNum('mode', 0),
    link$: bindNum('link', 0),
    hipass$: bindNum('hipass', 20),
    lopass$: bindNum('lopass', 20000),
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
