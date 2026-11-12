import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/phonesModel';
import { bindBoolParamToHost, bindParamToHost, postBegin, postEnd } from '../utils/bind_param';

export type IPhonesHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  mono$: DynamicValue<boolean>;
  amount$: DynamicValue<number>;
  angle$: DynamicValue<number>;
  distance$: DynamicValue<number>;
  room$: DynamicValue<number>;
  live$: DynamicValue<number>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function phonesParamDefault(name: keyof typeof paramIds, fallback = 0): number {
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

export function createBoundPhonesHost(): IPhonesHost {
  return {
    meta: pluginMeta,
    bypass$: bindBool('bypass'),
    mono$: bindBool('mono'),
    amount$: bindNum('amount', 1),
    angle$: bindNum('angle', 30),
    distance$: bindNum('distance', 1.2),
    room$: bindNum('room', 0.5),
    live$: bindNum('live', 0),
    beginEdit: (id) => postBegin(id),
    endEdit: (id) => postEnd(id),
  };
}
