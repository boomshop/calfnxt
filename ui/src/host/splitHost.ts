import type { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/splitModel';
import { postBegin, postEnd } from '../utils/bind_param';
import {
  makeHostParamBinders,
  makeParamDefault,
} from '../utils/hostParamBind';

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

const paramDefault = makeParamDefault(pluginMeta.parameters);

export function splitParamDefault(
  name: keyof typeof paramIds,
  fallback = 0,
): number {
  return paramDefault(name, fallback);
}

const { bindNum, bindBool } = makeHostParamBinders(paramIds, paramDefault);

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
