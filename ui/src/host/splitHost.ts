import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/splitModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  postBegin,
  postEnd,
} from '../bind_param';

export type ISplitHost = {
  meta: typeof pluginMeta;
  volumeL$: DynamicValue<number>;
  volumeR$: DynamicValue<number>;
  muteL$: DynamicValue<boolean>;
  muteR$: DynamicValue<boolean>;
  phaseL$: DynamicValue<boolean>;
  phaseR$: DynamicValue<boolean>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function splitParamDefault(
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

export function createBoundSplitHost(): ISplitHost {
  return {
    meta: pluginMeta,
    volumeL$: bindNum('volume_l'),
    volumeR$: bindNum('volume_r'),
    muteL$: bindBool('mute_l'),
    muteR$: bindBool('mute_r'),
    phaseL$: bindBool('phase_l'),
    phaseR$: bindBool('phase_r'),
    beginEdit: postBegin,
    endEdit: postEnd,
  };
}
