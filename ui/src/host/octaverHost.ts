import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/octaverModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizPitch,
  postBegin,
  postEnd,
} from '../utils/bind_param';

export const OCTAVER_VIZ_ID = 'octaver';

export const OCTAVER_PROFILE_ENTRIES = [
  { label: 'Bass', value: 0 },
  { label: 'Cello', value: 1 },
  { label: 'Voice', value: 2 },
  { label: 'Guitar', value: 3 },
] as const;

export const OCTAVER_DETECT_ENTRIES = [
  { label: 'Mid', value: 0 },
  { label: 'Left', value: 1 },
  { label: 'Right', value: 2 },
  { label: 'Mix', value: 3 },
] as const;

export const OCTAVER_SUB_WAVE_ENTRIES = [
  { icon: 'sine', value: 0 },
  { icon: 'triangle', value: 1 },
  { icon: 'rect', value: 2 },
  { icon: 'saw', value: 3 },
] as const;

export type OctaverProfileDefaults = {
  fmin: number;
  fmax: number;
  unvoiced: number;
  octave: number;
  quality: number;
  dryOn: boolean;
  m1On: boolean;
  m2On: boolean;
  p1On: boolean;
  subOn: boolean;
  dryLevel: number;
  m1Level: number;
  subLevel: number;
};

export const OCTAVER_BASS_DEFAULTS: OctaverProfileDefaults = {
  fmin: 31,
  fmax: 400,
  unvoiced: 0.55,
  octave: 0.9,
  quality: 0.75,
  dryOn: true,
  m1On: false,
  m2On: false,
  p1On: false,
  subOn: true,
  dryLevel: 0,
  m1Level: -5,
  subLevel: -4,
};

export const OCTAVER_CELLO_DEFAULTS: OctaverProfileDefaults = {
  fmin: 55,
  fmax: 700,
  unvoiced: 0.45,
  octave: 0.88,
  quality: 0.8,
  dryOn: true,
  m1On: true,
  m2On: false,
  p1On: false,
  subOn: false,
  dryLevel: 0,
  m1Level: -3,
  subLevel: -8,
};

export const OCTAVER_VOICE_DEFAULTS: OctaverProfileDefaults = {
  fmin: 80,
  fmax: 700,
  unvoiced: 0.58,
  octave: 0.88,
  quality: 0.75,
  dryOn: true,
  m1On: true,
  m2On: false,
  p1On: false,
  subOn: false,
  dryLevel: 0,
  m1Level: -4,
  subLevel: -9,
};

export const OCTAVER_GUITAR_DEFAULTS: OctaverProfileDefaults = {
  fmin: 70,
  fmax: 1200,
  unvoiced: 0.6,
  octave: 0.8,
  quality: 0.7,
  dryOn: true,
  m1On: true,
  m2On: false,
  p1On: false,
  subOn: true,
  dryLevel: 0,
  m1Level: -5,
  subLevel: -6,
};

export const OCTAVER_SOURCE_DEFAULTS: readonly OctaverProfileDefaults[] = [
  OCTAVER_BASS_DEFAULTS,
  OCTAVER_CELLO_DEFAULTS,
  OCTAVER_VOICE_DEFAULTS,
  OCTAVER_GUITAR_DEFAULTS,
];

export function octaverSourceDefaults(profile: number): OctaverProfileDefaults {
  const i = Math.max(0, Math.min(3, Math.round(Number(profile))));
  return OCTAVER_SOURCE_DEFAULTS[i] ?? OCTAVER_BASS_DEFAULTS;
}

export type IOctaverHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  mono$: DynamicValue<boolean>;
  profile$: DynamicValue<number>;
  quality$: DynamicValue<number>;
  octaveProtect$: DynamicValue<number>;
  unvoiced$: DynamicValue<number>;
  detect$: DynamicValue<number>;
  fmin$: DynamicValue<number>;
  fmax$: DynamicValue<number>;
  glide$: DynamicValue<number>;
  gate$: DynamicValue<number>;
  attack$: DynamicValue<number>;
  dryOn$: DynamicValue<boolean>;
  dryLevel$: DynamicValue<number>;
  dryBal$: DynamicValue<number>;
  dryListen$: DynamicValue<boolean>;
  m1On$: DynamicValue<boolean>;
  m1Level$: DynamicValue<number>;
  m1Bal$: DynamicValue<number>;
  m1Formant$: DynamicValue<number>;
  m1Tone$: DynamicValue<number>;
  m1Listen$: DynamicValue<boolean>;
  m2On$: DynamicValue<boolean>;
  m2Level$: DynamicValue<number>;
  m2Bal$: DynamicValue<number>;
  m2Formant$: DynamicValue<number>;
  m2Tone$: DynamicValue<number>;
  m2Listen$: DynamicValue<boolean>;
  p1On$: DynamicValue<boolean>;
  p1Level$: DynamicValue<number>;
  p1Bal$: DynamicValue<number>;
  p1Formant$: DynamicValue<number>;
  p1Tone$: DynamicValue<number>;
  p1Listen$: DynamicValue<boolean>;
  subOn$: DynamicValue<boolean>;
  subLevel$: DynamicValue<number>;
  subBal$: DynamicValue<number>;
  subWave$: DynamicValue<number>;
  subHarm$: DynamicValue<number>;
  subTone$: DynamicValue<number>;
  subListen$: DynamicValue<boolean>;
  pitchData$: DynamicValue<Float32Array | null>;
  /** Chromatic mask for the pitch-roll keyboard (always on). */
  notes$: readonly DynamicValue<boolean>[];
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
  applySourceDefaults: (profile: number) => void;
  setExclusiveListen: (which: 'dry' | 'm1' | 'm2' | 'p1' | 'sub' | null) => void;
};

export function octaverParamDefault(
  id: keyof typeof paramIds,
): number | boolean {
  const p = pluginMeta.parameters.find((x) => x.id === id);
  if (!p) return 0;
  if (
    id.endsWith('_on') ||
    id.endsWith('_listen') ||
    id === 'bypass' ||
    id === 'mono'
  )
    return p.default >= 0.5;
  return p.default;
}

export function createBoundOctaverHost(): IOctaverHost {
  const bypass$ = DynamicValue.fromConstant(false);
  const mono$ = DynamicValue.fromConstant(false);
  const profile$ = DynamicValue.fromConstant(0);
  const quality$ = DynamicValue.fromConstant(0.75);
  const octaveProtect$ = DynamicValue.fromConstant(0.9);
  const unvoiced$ = DynamicValue.fromConstant(0.55);
  const detect$ = DynamicValue.fromConstant(0);
  const fmin$ = DynamicValue.fromConstant(31);
  const fmax$ = DynamicValue.fromConstant(400);
  const glide$ = DynamicValue.fromConstant(40);
  const gate$ = DynamicValue.fromConstant(-48);
  const attack$ = DynamicValue.fromConstant(8);

  const dryOn$ = DynamicValue.fromConstant(true);
  const dryLevel$ = DynamicValue.fromConstant(0);
  const dryBal$ = DynamicValue.fromConstant(0);
  const dryListen$ = DynamicValue.fromConstant(false);

  const m1On$ = DynamicValue.fromConstant(false);
  const m1Level$ = DynamicValue.fromConstant(-3);
  const m1Bal$ = DynamicValue.fromConstant(0);
  const m1Formant$ = DynamicValue.fromConstant(0.9);
  const m1Tone$ = DynamicValue.fromConstant(0.45);
  const m1Listen$ = DynamicValue.fromConstant(false);

  const m2On$ = DynamicValue.fromConstant(false);
  const m2Level$ = DynamicValue.fromConstant(-5);
  const m2Bal$ = DynamicValue.fromConstant(0);
  const m2Formant$ = DynamicValue.fromConstant(0.92);
  const m2Tone$ = DynamicValue.fromConstant(0.3);
  const m2Listen$ = DynamicValue.fromConstant(false);

  const p1On$ = DynamicValue.fromConstant(false);
  const p1Level$ = DynamicValue.fromConstant(-5);
  const p1Bal$ = DynamicValue.fromConstant(0);
  const p1Formant$ = DynamicValue.fromConstant(0.85);
  const p1Tone$ = DynamicValue.fromConstant(0.6);
  const p1Listen$ = DynamicValue.fromConstant(false);

  const subOn$ = DynamicValue.fromConstant(true);
  const subLevel$ = DynamicValue.fromConstant(-4);
  const subBal$ = DynamicValue.fromConstant(0);
  const subWave$ = DynamicValue.fromConstant(0);
  const subHarm$ = DynamicValue.fromConstant(0.35);
  const subTone$ = DynamicValue.fromConstant(0.35);
  const subListen$ = DynamicValue.fromConstant(false);

  const notes$ = Array.from({ length: 12 }, () =>
    DynamicValue.fromConstant(true),
  );

  bindBoolParamToHost(bypass$, paramIds.bypass);
  bindBoolParamToHost(mono$, paramIds.mono);
  bindParamToHost(profile$, paramIds.profile);
  bindParamToHost(quality$, paramIds.quality);
  bindParamToHost(octaveProtect$, paramIds.octave_protect);
  bindParamToHost(unvoiced$, paramIds.unvoiced);
  bindParamToHost(detect$, paramIds.detect);
  bindParamToHost(fmin$, paramIds.fmin);
  bindParamToHost(fmax$, paramIds.fmax);
  bindParamToHost(glide$, paramIds.glide);
  bindParamToHost(gate$, paramIds.gate);
  bindParamToHost(attack$, paramIds.attack);

  bindBoolParamToHost(dryOn$, paramIds.dry_on);
  bindParamToHost(dryLevel$, paramIds.dry_level);
  bindParamToHost(dryBal$, paramIds.dry_bal);
  bindBoolParamToHost(dryListen$, paramIds.dry_listen);

  bindBoolParamToHost(m1On$, paramIds.m1_on);
  bindParamToHost(m1Level$, paramIds.m1_level);
  bindParamToHost(m1Bal$, paramIds.m1_bal);
  bindParamToHost(m1Formant$, paramIds.m1_formant);
  bindParamToHost(m1Tone$, paramIds.m1_tone);
  bindBoolParamToHost(m1Listen$, paramIds.m1_listen);

  bindBoolParamToHost(m2On$, paramIds.m2_on);
  bindParamToHost(m2Level$, paramIds.m2_level);
  bindParamToHost(m2Bal$, paramIds.m2_bal);
  bindParamToHost(m2Formant$, paramIds.m2_formant);
  bindParamToHost(m2Tone$, paramIds.m2_tone);
  bindBoolParamToHost(m2Listen$, paramIds.m2_listen);

  bindBoolParamToHost(p1On$, paramIds.p1_on);
  bindParamToHost(p1Level$, paramIds.p1_level);
  bindParamToHost(p1Bal$, paramIds.p1_bal);
  bindParamToHost(p1Formant$, paramIds.p1_formant);
  bindParamToHost(p1Tone$, paramIds.p1_tone);
  bindBoolParamToHost(p1Listen$, paramIds.p1_listen);

  bindBoolParamToHost(subOn$, paramIds.sub_on);
  bindParamToHost(subLevel$, paramIds.sub_level);
  bindParamToHost(subBal$, paramIds.sub_bal);
  bindParamToHost(subWave$, paramIds.sub_wave);
  bindParamToHost(subHarm$, paramIds.sub_harm);
  bindParamToHost(subTone$, paramIds.sub_tone);
  bindBoolParamToHost(subListen$, paramIds.sub_listen);

  const pitchData$ = DynamicValue.fromConstant<Float32Array | null>(null);
  bindVizPitch(pitchData$, OCTAVER_VIZ_ID);

  const beginEdit = (id: number) => postBegin(id);
  const endEdit = (id: number) => postEnd(id);

  const setBool = (dv: DynamicValue<boolean>, id: number, v: boolean) => {
    beginEdit(id);
    dv.set(v);
    endEdit(id);
  };

  const setNum = (dv: DynamicValue<number>, id: number, v: number) => {
    beginEdit(id);
    dv.set(v);
    endEdit(id);
  };

  const listenPairs: { dv: DynamicValue<boolean>; id: number }[] = [
    { dv: dryListen$, id: paramIds.dry_listen },
    { dv: m1Listen$, id: paramIds.m1_listen },
    { dv: m2Listen$, id: paramIds.m2_listen },
    { dv: p1Listen$, id: paramIds.p1_listen },
    { dv: subListen$, id: paramIds.sub_listen },
  ];
  for (const self of listenPairs) {
    self.dv.subscribe((on) => {
      if (!on) return;
      for (const other of listenPairs) {
        if (other === self) continue;
        if (other.dv.value) other.dv.set(false);
      }
    });
  }

  const setExclusiveListen = (which: 'dry' | 'm1' | 'm2' | 'p1' | 'sub' | null) => {
    setBool(dryListen$, paramIds.dry_listen, which === 'dry');
    setBool(m1Listen$, paramIds.m1_listen, which === 'm1');
    setBool(m2Listen$, paramIds.m2_listen, which === 'm2');
    setBool(p1Listen$, paramIds.p1_listen, which === 'p1');
    setBool(subListen$, paramIds.sub_listen, which === 'sub');
  };

  const applySourceDefaults = (profile: number) => {
    const d = octaverSourceDefaults(profile);
    setNum(profile$, paramIds.profile, profile);
    setNum(fmin$, paramIds.fmin, d.fmin);
    setNum(fmax$, paramIds.fmax, d.fmax);
    setNum(unvoiced$, paramIds.unvoiced, d.unvoiced);
    setNum(octaveProtect$, paramIds.octave_protect, d.octave);
    setNum(quality$, paramIds.quality, d.quality);
    setBool(dryOn$, paramIds.dry_on, d.dryOn);
    setBool(m1On$, paramIds.m1_on, d.m1On);
    setBool(m2On$, paramIds.m2_on, d.m2On);
    setBool(p1On$, paramIds.p1_on, d.p1On);
    setBool(subOn$, paramIds.sub_on, d.subOn);
    setNum(dryLevel$, paramIds.dry_level, d.dryLevel);
    setNum(m1Level$, paramIds.m1_level, d.m1Level);
    setNum(subLevel$, paramIds.sub_level, d.subLevel);
  };

  return {
    meta: pluginMeta,
    bypass$,
    mono$,
    profile$,
    quality$,
    octaveProtect$,
    unvoiced$,
    detect$,
    fmin$,
    fmax$,
    glide$,
    gate$,
    attack$,
    dryOn$,
    dryLevel$,
    dryBal$,
    dryListen$,
    m1On$,
    m1Level$,
    m1Bal$,
    m1Formant$,
    m1Tone$,
    m1Listen$,
    m2On$,
    m2Level$,
    m2Bal$,
    m2Formant$,
    m2Tone$,
    m2Listen$,
    p1On$,
    p1Level$,
    p1Bal$,
    p1Formant$,
    p1Tone$,
    p1Listen$,
    subOn$,
    subLevel$,
    subBal$,
    subWave$,
    subHarm$,
    subTone$,
    subListen$,
    pitchData$,
    notes$,
    beginEdit,
    endEdit,
    applySourceDefaults,
    setExclusiveListen,
  };
}
