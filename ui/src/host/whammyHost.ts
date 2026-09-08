import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/whammyModel';
import { bindBoolParamToHost, bindParamToHost, postBegin, postEnd } from '../bind_param';

export const WHAMMY_SNAP_ENTRIES = [
  { label: 'Free', value: 0 },
  { label: 'ST', value: 1 },
  { label: 'WT', value: 2 },
];

export const WHAMMY_QUALITY_ENTRIES = [
  { label: 'Fast', value: 0 },
  { label: 'Normal', value: 1 },
  { label: 'Smooth', value: 2 },
  { label: 'Studio', value: 3 },
];

export type IWhammyHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  mono$: DynamicValue<boolean>;
  pitch$: DynamicValue<number>;
  snap$: DynamicValue<number>;
  quality$: DynamicValue<number>;
  mix$: DynamicValue<number>;
  glide$: DynamicValue<number>;
  tone$: DynamicValue<number>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function snapWhammyPitch(v: number, snap: number): number {
  const x = Math.max(-24, Math.min(24, v));
  const mode = Math.round(snap);
  if (mode <= 0) return x;
  const step = mode >= 2 ? 2 : 1;
  return Math.max(-24, Math.min(24, Math.round(x / step) * step));
}

export function whammyParamDefault(
  name: keyof typeof paramIds,
  fallback = 0,
): number {
  return paramDefault(name, fallback);
}

function bindNum(
  name: keyof typeof paramIds,
  fallback = 0,
  mapPlain?: (v: number) => number,
): DynamicValue<number> {
  const dv = DynamicValue.fromConstant(paramDefault(name, fallback));
  bindParamToHost(dv, paramIds[name], mapPlain);
  return dv;
}

function bindBool(name: keyof typeof paramIds): DynamicValue<boolean> {
  const dv = DynamicValue.fromConstant(paramDefault(name, 0) >= 0.5);
  bindBoolParamToHost(dv, paramIds[name]);
  return dv;
}

export function createBoundWhammyHost(): IWhammyHost {
  const snap$ = bindNum('snap', 0);
  return {
    meta: pluginMeta,
    bypass$: bindBool('bypass'),
    mono$: bindBool('mono'),
    pitch$: bindNum('pitch', 0, (v) => snapWhammyPitch(v, snap$.value)),
    snap$,
    quality$: bindNum('quality', 2),
    mix$: bindNum('mix', 1),
    glide$: bindNum('glide', 8),
    tone$: bindNum('tone', 0.8),
    beginEdit: (id) => postBegin(id),
    endEdit: (id) => postEnd(id),
  };
}
