import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/crusherModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizShape,
  postBegin,
  postEnd,
} from '../utils/bind_param';

export type ICrusherHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  /** 0 Stereo / 1 Left / 2 Right / 3 Mid / 4 Side. */
  channel$: DynamicValue<number>;
  bits$: DynamicValue<number>;
  morph$: DynamicValue<number>;
  mode$: DynamicValue<boolean>;
  dc$: DynamicValue<number>;
  aa$: DynamicValue<number>;
  /** Live [zone, …densityBins] for the Shape chart. */
  shapePoint$: DynamicValue<number[]>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
};

/** Stereo / L / R / Mid / Side (matches `Dsp::ChannelMode`). */
export const CRUSHER_CHANNEL_ENTRIES = [
  { label: 'Stereo', value: 0 },
  { label: 'Left', value: 1 },
  { label: 'Right', value: 2 },
  { label: 'Mid', value: 3 },
  { label: 'Side', value: 4 },
];

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function crusherParamDefault(
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

export function createBoundCrusherHost(): ICrusherHost {
  const shapePoint$ = DynamicValue.fromConstant<number[]>([0]);
  bindVizShape(shapePoint$, 'crusher');

  return {
    meta: pluginMeta,
    bypass$: bindBool('bypass'),
    channel$: bindNum('channel', 0),
    bits$: bindNum('bits', 4),
    morph$: bindNum('morph', 0.5),
    mode$: bindBool('mode'),
    dc$: bindNum('dc', 0),
    aa$: bindNum('anti_aliasing', 0.5),
    shapePoint$,
    beginEdit: postBegin,
    endEdit: postEnd,
  };
}
