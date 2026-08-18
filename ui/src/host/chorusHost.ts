import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/chorusModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizLfo,
  postBegin,
  postEnd,
} from '../bind_param';

export type IChorusHost = {
  meta: typeof pluginMeta;
  active$: DynamicValue<boolean>;
  minDelay$: DynamicValue<number>;
  modDepth$: DynamicValue<number>;
  modRate$: DynamicValue<number>;
  stereo$: DynamicValue<number>;
  voices$: DynamicValue<number>;
  vphase$: DynamicValue<number>;
  overlap$: DynamicValue<number>;
  amount$: DynamicValue<number>;
  dry$: DynamicValue<number>;
  lfo$: DynamicValue<boolean>;
  hipass$: DynamicValue<number>;
  lopass$: DynamicValue<number>;
  hpMode$: DynamicValue<number>;
  lpMode$: DynamicValue<number>;
  listen$: DynamicValue<boolean>;
  /** Live [phaseL, 0, phaseR, 0]. */
  chorusLfo$: DynamicValue<number[]>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
  pulseReset: () => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function chorusParamDefault(
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

export function createBoundChorusHost(): IChorusHost {
  const reset$ = bindNum('reset', 0);
  const chorusLfo$ = DynamicValue.fromConstant<number[]>([0, 0, 0, 0]);
  bindVizLfo(chorusLfo$, 'chorus');

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
    minDelay$: bindNum('min_delay', 5),
    modDepth$: bindNum('mod_depth', 6),
    modRate$: bindNum('mod_rate', 0.1),
    stereo$: bindNum('stereo', 180),
    voices$: bindNum('voices', 4),
    vphase$: bindNum('vphase', 64),
    overlap$: bindNum('overlap', 0.75),
    amount$: bindNum('amount', -6),
    dry$: bindNum('dry', 0),
    lfo$: bindBool('lfo'),
    hipass$: bindNum('hipass', 100),
    lopass$: bindNum('lopass', 5000),
    hpMode$: bindNum('hp_mode', 0),
    lpMode$: bindNum('lp_mode', 0),
    listen$: bindBool('listen'),
    chorusLfo$,
    beginEdit: postBegin,
    endEdit: postEnd,
    pulseReset,
  };
}
