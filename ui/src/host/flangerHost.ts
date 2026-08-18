import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/flangerModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizComb,
  postBegin,
  postEnd,
} from '../bind_param';

export type IFlangerHost = {
  meta: typeof pluginMeta;
  active$: DynamicValue<boolean>;
  minDelay$: DynamicValue<number>;
  modDepth$: DynamicValue<number>;
  modRate$: DynamicValue<number>;
  feedback$: DynamicValue<number>;
  stereo$: DynamicValue<number>;
  amount$: DynamicValue<number>;
  dry$: DynamicValue<number>;
  lfo$: DynamicValue<boolean>;
  /** Live comb teeth [nL, nR, (f,dB)…]. */
  response$: DynamicValue<number[]>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
  pulseReset: () => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function flangerParamDefault(
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

export function createBoundFlangerHost(): IFlangerHost {
  const reset$ = bindNum('reset', 0);
  const response$ = DynamicValue.fromConstant<number[]>([]);
  bindVizComb(response$, 'mod');

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
    minDelay$: bindNum('min_delay', 0.5),
    modDepth$: bindNum('mod_depth', 2),
    modRate$: bindNum('mod_rate', 0.1),
    feedback$: bindNum('feedback', 0.8),
    stereo$: bindNum('stereo', 90),
    amount$: bindNum('amount', -6),
    dry$: bindNum('dry', 0),
    lfo$: bindBool('lfo'),
    response$,
    beginEdit: postBegin,
    endEdit: postEnd,
    pulseReset,
  };
}
