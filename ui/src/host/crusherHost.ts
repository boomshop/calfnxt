import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/crusherModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizShape,
  postBegin,
  postEnd,
} from '../bind_param';

export type ICrusherHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
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
