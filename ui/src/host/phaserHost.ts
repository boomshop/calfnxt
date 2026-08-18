import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/phaserModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizResponse,
  postBegin,
  postEnd,
} from '../bind_param';

export type IPhaserHost = {
  meta: typeof pluginMeta;
  active$: DynamicValue<boolean>;
  baseFreq$: DynamicValue<number>;
  modDepth$: DynamicValue<number>;
  modRate$: DynamicValue<number>;
  feedback$: DynamicValue<number>;
  stages$: DynamicValue<number>;
  stereo$: DynamicValue<number>;
  amount$: DynamicValue<number>;
  dry$: DynamicValue<number>;
  lfo$: DynamicValue<boolean>;
  /** Live [bins, L×N, R×N] dB response. */
  response$: DynamicValue<number[]>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
  pulseReset: () => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function phaserParamDefault(
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

export function createBoundPhaserHost(): IPhaserHost {
  const reset$ = bindNum('reset', 0);
  const response$ = DynamicValue.fromConstant<number[]>([]);
  bindVizResponse(response$, 'mod');

  const pulseReset = () => {
    const id = paramIds.reset;
    postBegin(id);
    reset$.set(1);
    window.setTimeout(() => {
      reset$.set(0);
      postEnd(id);
    }, 40);
  };

  return {
    meta: pluginMeta,
    active$: bindBool('active'),
    baseFreq$: bindNum('base_freq', 1000),
    modDepth$: bindNum('mod_depth', 4000),
    modRate$: bindNum('mod_rate', 0.1),
    feedback$: bindNum('feedback', 0.5),
    stages$: bindNum('stages', 6),
    stereo$: bindNum('stereo', 180),
    amount$: bindNum('amount', -6),
    dry$: bindNum('dry', 0),
    lfo$: bindBool('lfo'),
    response$,
    beginEdit: postBegin,
    endEdit: postEnd,
    pulseReset,
  };
}
