import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/ellipticModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizCorr,
  bindVizGonio,
  postBegin,
  postEnd,
} from '../utils/bind_param';

export const ELLIPTIC_SLOPE_ENTRIES = [
  { label: '12 dB', value: 12 },
  { label: '24 dB', value: 24 },
];

export type IEllipticHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  freq$: DynamicValue<number>;
  slope$: DynamicValue<number>;
  amount$: DynamicValue<number>;
  listen$: DynamicValue<boolean>;
  corr$: DynamicValue<number>;
  gonio$: DynamicValue<number[]>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
};

function bindNum(name: keyof typeof paramIds): DynamicValue<number> {
  const dv = DynamicValue.fromConstant(ellipticParamDefault(name));
  bindParamToHost(dv, paramIds[name]);
  return dv;
}

/** DSP descriptor default (plain) for AUX Knob double-click reset. */
export function ellipticParamDefault(
  name: keyof typeof paramIds,
  fallback = 0,
): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

function bindBool(name: keyof typeof paramIds): DynamicValue<boolean> {
  const dv = DynamicValue.fromConstant(false);
  bindBoolParamToHost(dv, paramIds[name]);
  return dv;
}

export function createBoundEllipticHost(): IEllipticHost {
  const corr$ = DynamicValue.fromConstant(0);
  const gonio$ = DynamicValue.fromConstant<number[]>([]);
  bindVizCorr(corr$, 'elliptic');
  bindVizGonio(gonio$, 'elliptic');

  return {
    meta: pluginMeta,
    bypass$: bindBool('bypass'),
    freq$: bindNum('freq'),
    slope$: bindNum('slope'),
    amount$: bindNum('amount'),
    listen$: bindBool('listen'),
    corr$,
    gonio$,
    beginEdit: (id) => postBegin(id),
    endEdit: (id) => postEnd(id),
  };
}
