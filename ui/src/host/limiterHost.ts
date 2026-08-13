import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/limiterModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizEnvelope,
  bindVizGr,
  postBegin,
  postEnd,
} from '../bind_param';

export const LIMITER_CURVE_ENTRIES = [
  { label: 'Lin', value: 0 },
  { label: 'Log', value: 1 },
  { label: 'Cos', value: 2 },
];

export type ILimiterHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  limit$: DynamicValue<number>;
  attack$: DynamicValue<number>;
  release$: DynamicValue<number>;
  asc$: DynamicValue<boolean>;
  ascCoeff$: DynamicValue<number>;
  oversampling$: DynamicValue<number>;
  autoLevel$: DynamicValue<boolean>;
  curve$: DynamicValue<number>;
  knee$: DynamicValue<number>;
  colorEnable$: DynamicValue<boolean>;
  color$: DynamicValue<number>;
  truePeak$: DynamicValue<boolean>;
  margin$: DynamicValue<number>;
  diffListen$: DynamicValue<boolean>;
  holdEnable$: DynamicValue<boolean>;
  releaseHold$: DynamicValue<number>;
  emphasisEnable$: DynamicValue<boolean>;
  emphasis$: DynamicValue<number>;
  gr$: DynamicValue<number>;
  historyData$: DynamicValue<Float32Array | null>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function limiterParamDefault(
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

export function createBoundLimiterHost(): ILimiterHost {
  const gr$ = DynamicValue.fromConstant(0);
  const historyData$ = DynamicValue.fromConstant<Float32Array | null>(null);
  bindVizGr(gr$, 'limiter');
  bindVizEnvelope(historyData$, 'limiter');

  return {
    meta: pluginMeta,
    bypass$: bindBool('bypass'),
    limit$: bindNum('limit', 0),
    attack$: bindNum('attack', 5),
    release$: bindNum('release', 50),
    asc$: bindBool('asc'),
    ascCoeff$: bindNum('asc_coeff', 0.5),
    oversampling$: bindNum('oversampling', 1),
    autoLevel$: bindBool('auto_level'),
    curve$: bindNum('curve', 0),
    knee$: bindNum('knee', 0),
    colorEnable$: bindBool('color_enable'),
    color$: bindNum('color', 0.35),
    truePeak$: bindBool('true_peak'),
    margin$: bindNum('margin', 0.1),
    diffListen$: bindBool('diff_listen'),
    holdEnable$: bindBool('hold_enable'),
    releaseHold$: bindNum('release_hold', 25),
    emphasisEnable$: bindBool('emphasis_enable'),
    emphasis$: bindNum('emphasis', 0.4),
    gr$,
    historyData$,
    beginEdit: postBegin,
    endEdit: postEnd,
  };
}
