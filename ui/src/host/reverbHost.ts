import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/reverbModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  postBegin,
  postEnd,
} from '../bind_param';
import {
  REVERB_PRESETS,
  type ReverbPresetId,
  type ReverbPresetValues,
} from '../plugins/ReverbUI/reverbPresets';

export const REVERB_ER_MODE_ENTRIES = [
  { label: 'Off', value: 0 },
  { label: 'Multi-Tap', value: 1 },
  { label: 'Velvet', value: 2 },
];

export const REVERB_QUALITY_ENTRIES = [
  { label: 'Lo', value: 0 },
  { label: 'Mid', value: 1 },
  { label: 'Hi', value: 2 },
];

export const REVERB_PATH_MODE_ENTRIES = [
  { label: 'Parallel', value: 0 },
  { label: 'Serial', value: 1 },
];

export const REVERB_WIDTH_MODE_ENTRIES = [
  { label: 'Dry', value: 0 },
  { label: 'M/S', value: 1 },
  { label: 'Haas', value: 2 },
  { label: 'Decor', value: 3 },
];

export const REVERB_PRESET_ENTRIES = REVERB_PRESETS.map((p) => ({
  label: p.label,
  value: p.id,
}));

export type IReverbHost = {
  meta: typeof pluginMeta;
  active$: DynamicValue<boolean>;
  roomSize$: DynamicValue<number>;
  distance$: DynamicValue<number>;
  decay$: DynamicValue<number>;
  diffusion$: DynamicValue<number>;
  diffuse$: DynamicValue<number>;
  predelay$: DynamicValue<number>;
  hipass$: DynamicValue<number>;
  lopass$: DynamicValue<number>;
  hpMode$: DynamicValue<number>;
  lpMode$: DynamicValue<number>;
  listen$: DynamicValue<boolean>;
  hfDamp$: DynamicValue<number>;
  lfDamp$: DynamicValue<number>;
  air$: DynamicValue<number>;
  erMode$: DynamicValue<number>;
  erLevel$: DynamicValue<number>;
  pathMode$: DynamicValue<number>;
  lateLevel$: DynamicValue<number>;
  modRate$: DynamicValue<number>;
  modDepth$: DynamicValue<number>;
  widthMode$: DynamicValue<number>;
  width$: DynamicValue<number>;
  duck$: DynamicValue<number>;
  gate$: DynamicValue<boolean>;
  gateThreshold$: DynamicValue<number>;
  gateHold$: DynamicValue<number>;
  gateRelease$: DynamicValue<number>;
  freeze$: DynamicValue<boolean>;
  dry$: DynamicValue<number>;
  amount$: DynamicValue<number>;
  quality$: DynamicValue<number>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
  applyPreset: (id: ReverbPresetId) => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function reverbParamDefault(
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

export function createBoundReverbHost(): IReverbHost {
  const active$ = bindBool('active');
  const roomSize$ = bindNum('room_size');
  const distance$ = bindNum('distance');
  const decay$ = bindNum('decay');
  const diffusion$ = bindNum('diffusion');
  const diffuse$ = bindNum('diffuse');
  const predelay$ = bindNum('predelay');
  const hipass$ = bindNum('hipass');
  const lopass$ = bindNum('lopass');
  const hpMode$ = bindNum('hp_mode');
  const lpMode$ = bindNum('lp_mode');
  const listen$ = bindBool('listen');
  const hfDamp$ = bindNum('hf_damp');
  const lfDamp$ = bindNum('lf_damp');
  const air$ = bindNum('air');
  const erMode$ = bindNum('er_mode');
  const erLevel$ = bindNum('er_level');
  const pathMode$ = bindNum('path_mode');
  const lateLevel$ = bindNum('late_level');
  const modRate$ = bindNum('mod_rate');
  const modDepth$ = bindNum('mod_depth');
  const widthMode$ = bindNum('width_mode');
  const width$ = bindNum('width');
  const duck$ = bindNum('duck');
  const gate$ = bindBool('gate');
  const gateThreshold$ = bindNum('gate_threshold');
  const gateHold$ = bindNum('gate_hold');
  const gateRelease$ = bindNum('gate_release');
  const freeze$ = bindBool('freeze');
  const dry$ = bindNum('dry');
  const amount$ = bindNum('amount');
  const quality$ = bindNum('quality');

  const applyValues = (v: ReverbPresetValues) => {
    setPlain('room_size', roomSize$, v.room_size);
    setPlain('distance', distance$, v.distance);
    setPlain('decay', decay$, v.decay);
    setPlain('diffusion', diffusion$, v.diffusion);
    setPlain('diffuse', diffuse$, v.diffuse);
    setPlain('predelay', predelay$, v.predelay);
    setPlain('hipass', hipass$, v.hipass);
    setPlain('lopass', lopass$, v.lopass);
    setPlain('hp_mode', hpMode$, v.hp_mode);
    setPlain('lp_mode', lpMode$, v.lp_mode);
    setBool('listen', listen$, v.listen >= 0.5);
    setPlain('hf_damp', hfDamp$, v.hf_damp);
    setPlain('lf_damp', lfDamp$, v.lf_damp);
    setPlain('air', air$, v.air);
    setPlain('er_mode', erMode$, v.er_mode);
    setPlain('er_level', erLevel$, v.er_level);
    setPlain('path_mode', pathMode$, v.path_mode);
    setPlain('late_level', lateLevel$, v.late_level);
    setPlain('mod_rate', modRate$, v.mod_rate);
    setPlain('mod_depth', modDepth$, v.mod_depth);
    setPlain('width_mode', widthMode$, v.width_mode);
    setPlain('width', width$, v.width);
    setPlain('duck', duck$, v.duck);
    setBool('gate', gate$, v.gate >= 0.5);
    setPlain('gate_threshold', gateThreshold$, v.gate_threshold);
    setPlain('gate_hold', gateHold$, v.gate_hold);
    setPlain('gate_release', gateRelease$, v.gate_release);
    setBool('freeze', freeze$, v.freeze >= 0.5);
    setPlain('dry', dry$, v.dry);
    setPlain('amount', amount$, v.amount);
  };

  return {
    meta: pluginMeta,
    active$,
    roomSize$,
    distance$,
    decay$,
    diffusion$,
    diffuse$,
    predelay$,
    hipass$,
    lopass$,
    hpMode$,
    lpMode$,
    listen$,
    hfDamp$,
    lfDamp$,
    air$,
    erMode$,
    erLevel$,
    pathMode$,
    lateLevel$,
    modRate$,
    modDepth$,
    widthMode$,
    width$,
    duck$,
    gate$,
    gateThreshold$,
    gateHold$,
    gateRelease$,
    freeze$,
    dry$,
    amount$,
    quality$,
    beginEdit: postBegin,
    endEdit: postEnd,
    applyPreset: (id) => {
      const preset = REVERB_PRESETS.find((p) => p.id === id);
      if (preset) applyValues(preset.values);
    },
  };
}
