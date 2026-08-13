import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/harmonicsModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizShape,
  postBegin,
  postEnd,
} from '../bind_param';
import {
  HARMONICS_PRESETS,
  type HarmonicsPresetId,
  type HarmonicsPresetValues,
} from '../plugins/HarmonicsUI/harmonicsPresets';

export const HARMONICS_PRESET_ENTRIES = HARMONICS_PRESETS.map((p) => ({
  label: p.label,
  value: p.id,
}));

export type IHarmonicsHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  drive$: DynamicValue<number>;
  blend$: DynamicValue<number>;
  dry$: DynamicValue<number>;
  wet$: DynamicValue<number>;
  preHipass$: DynamicValue<number>;
  preLopass$: DynamicValue<number>;
  preHpMode$: DynamicValue<number>;
  preLpMode$: DynamicValue<number>;
  postHipass$: DynamicValue<number>;
  postLopass$: DynamicValue<number>;
  postHpMode$: DynamicValue<number>;
  postLpMode$: DynamicValue<number>;
  preListen$: DynamicValue<boolean>;
  listen$: DynamicValue<boolean>;
  shapePoint$: DynamicValue<number[]>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
  applyPreset: (id: HarmonicsPresetId) => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  return pluginMeta.parameters.find((p) => p.id === name)?.default ?? fallback;
}

export function harmonicsParamDefault(
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

function setPlain(
  name: keyof typeof paramIds,
  dv: DynamicValue<number>,
  value: number,
) {
  const id = paramIds[name];
  postBegin(id);
  dv.set(value);
  postEnd(id);
}

function setBool(
  name: keyof typeof paramIds,
  dv: DynamicValue<boolean>,
  value: boolean,
) {
  const id = paramIds[name];
  postBegin(id);
  dv.set(value);
  postEnd(id);
}

export function createBoundHarmonicsHost(): IHarmonicsHost {
  const bypass$ = bindBool('bypass');
  const drive$ = bindNum('drive', 5);
  const blend$ = bindNum('blend', 10);
  const dry$ = bindNum('dry', -60);
  const wet$ = bindNum('wet', 0);
  const preHipass$ = bindNum('pre_hipass', 20);
  const preLopass$ = bindNum('pre_lopass', 20000);
  const preHpMode$ = bindNum('pre_hp_mode', 0);
  const preLpMode$ = bindNum('pre_lp_mode', 0);
  const postHipass$ = bindNum('post_hipass', 20);
  const postLopass$ = bindNum('post_lopass', 20000);
  const postHpMode$ = bindNum('post_hp_mode', 0);
  const postLpMode$ = bindNum('post_lp_mode', 0);
  const preListen$ = bindBool('pre_listen');
  const listen$ = bindBool('listen');
  const shapePoint$ = DynamicValue.fromConstant<number[]>(
    Array.from({ length: 49 }, () => 0),
  );
  bindVizShape(shapePoint$, 'harmonics');

  // Exclusive listen: enabling one clears the other.
  let syncingListen = false;
  preListen$.subscribe((on) => {
    if (syncingListen || !on)
      return;
    syncingListen = true;
    setBool('listen', listen$, false);
    syncingListen = false;
  });
  listen$.subscribe((on) => {
    if (syncingListen || !on)
      return;
    syncingListen = true;
    setBool('pre_listen', preListen$, false);
    syncingListen = false;
  });

  const applyValues = (v: HarmonicsPresetValues) => {
    setPlain('drive', drive$, v.drive);
    setPlain('blend', blend$, v.blend);
    setPlain('dry', dry$, v.dry);
    setPlain('wet', wet$, v.wet);
    setPlain('pre_hipass', preHipass$, v.pre_hipass);
    setPlain('pre_lopass', preLopass$, v.pre_lopass);
    setPlain('pre_hp_mode', preHpMode$, v.pre_hp_mode);
    setPlain('pre_lp_mode', preLpMode$, v.pre_lp_mode);
    setPlain('post_hipass', postHipass$, v.post_hipass);
    setPlain('post_lopass', postLopass$, v.post_lopass);
    setPlain('post_hp_mode', postHpMode$, v.post_hp_mode);
    setPlain('post_lp_mode', postLpMode$, v.post_lp_mode);
    setBool('pre_listen', preListen$, v.pre_listen >= 0.5);
    setBool('listen', listen$, v.listen >= 0.5);
  };

  return {
    meta: pluginMeta,
    bypass$,
    drive$,
    blend$,
    dry$,
    wet$,
    preHipass$,
    preLopass$,
    preHpMode$,
    preLpMode$,
    postHipass$,
    postLopass$,
    postHpMode$,
    postLpMode$,
    preListen$,
    listen$,
    shapePoint$,
    beginEdit: (id) => postBegin(id),
    endEdit: (id) => postEnd(id),
    applyPreset: (id) => {
      const preset = HARMONICS_PRESETS.find((p) => p.id === id);
      if (preset) applyValues(preset.values);
    },
  };
}
