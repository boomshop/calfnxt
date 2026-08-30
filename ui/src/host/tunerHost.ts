import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/tunerModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizPitch,
  postBegin,
  postEnd,
} from '../bind_param';

export const TUNER_VIZ_ID = 'tuner';

export const TUNER_PROFILE_ENTRIES = [
  { label: 'Voice', value: 0 },
  { label: 'Strings', value: 1 },
  { label: 'Guitar', value: 2 },
] as const;

export const TUNER_DETECT_ENTRIES = [
  { label: 'Mid', value: 0 },
  { label: 'Left', value: 1 },
  { label: 'Right', value: 2 },
  { label: 'Mix', value: 3 },
] as const;

export const TUNER_REF_ENTRIES = [
  { label: '415', value: 415 },
  { label: '432', value: 432 },
  { label: '440', value: 440 },
  { label: '442', value: 442 },
  { label: '443', value: 443 },
  { label: '444', value: 444 },
  { label: '466', value: 466 },
] as const;

export const TUNER_NOTE_IDS = [
  'note_c',
  'note_cs',
  'note_d',
  'note_ds',
  'note_e',
  'note_f',
  'note_fs',
  'note_g',
  'note_gs',
  'note_a',
  'note_as',
  'note_b',
] as const;

export const TUNER_NOTE_LABELS = [
  'C',
  'C♯',
  'D',
  'D♯',
  'E',
  'F',
  'F♯',
  'G',
  'G♯',
  'A',
  'A♯',
  'B',
] as const;

export const TUNER_KEY_ENTRIES = TUNER_NOTE_LABELS.map((label, value) => ({
  label,
  value,
}));

/** Scale templates in C; UI rotates by key and writes the 12 note bits. */
export const TUNER_SCALE_TEMPLATES: { label: string; bits: readonly number[] }[] = [
  { label: 'Chromatic', bits: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] },
  { label: 'Major', bits: [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 0, 1] },
  { label: 'Minor', bits: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 0] },
  { label: 'Harm. min', bits: [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 0, 1] },
  { label: 'Dorian', bits: [1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 1, 0] },
  { label: 'Mixolydian', bits: [1, 0, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0] },
  { label: 'Pent. maj', bits: [1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0] },
  { label: 'Pent. min', bits: [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0] },
  { label: 'Blues', bits: [1, 0, 0, 1, 0, 1, 1, 1, 0, 0, 1, 0] },
  { label: 'Whole', bits: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0] },
];

export type TunerProfileDefaults = {
  fmin: number;
  fmax: number;
  retune: number;
  threshold: number;
  flex: number;
  vibrato: number;
  formant: number;
  unvoiced: number;
  octave: number;
};

export const TUNER_VOICE_DEFAULTS: TunerProfileDefaults = {
  fmin: 80,
  // ~F5 — room for belted highs; still below a wide open 1 kHz window.
  // 550 clipped real tops (~500 Hz) into metallic PSOLA.
  fmax: 700,
  retune: 80,
  threshold: 10,
  flex: 100,
  vibrato: 0.75,
  formant: 0.85,
  unvoiced: 0.58,
  octave: 0.88,
};

export const TUNER_STRINGS_DEFAULTS: TunerProfileDefaults = {
  fmin: 55,
  fmax: 700,
  retune: 120,
  threshold: 14,
  flex: 150,
  vibrato: 0.9,
  formant: 0.92,
  unvoiced: 0.45,
  octave: 0.85,
};

export const TUNER_GUITAR_DEFAULTS: TunerProfileDefaults = {
  fmin: 70,
  fmax: 1400,
  retune: 80,
  threshold: 16,
  flex: 250,
  vibrato: 0.65,
  formant: 0.9,
  unvoiced: 0.6,
  octave: 0.75,
};

export const TUNER_SOURCE_DEFAULTS: readonly TunerProfileDefaults[] = [
  TUNER_VOICE_DEFAULTS,
  TUNER_STRINGS_DEFAULTS,
  TUNER_GUITAR_DEFAULTS,
];

export function tunerSourceDefaults(profile: number): TunerProfileDefaults {
  const i = Math.max(0, Math.min(2, Math.round(Number(profile))));
  return TUNER_SOURCE_DEFAULTS[i] ?? TUNER_VOICE_DEFAULTS;
}

export type ITunerHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  profile$: DynamicValue<number>;
  quality$: DynamicValue<number>;
  formant$: DynamicValue<number>;
  retune$: DynamicValue<number>;
  release$: DynamicValue<number>;
  amount$: DynamicValue<number>;
  threshold$: DynamicValue<number>;
  flex$: DynamicValue<number>;
  vibrato$: DynamicValue<number>;
  settle$: DynamicValue<number>;
  vibOn$: DynamicValue<boolean>;
  vibDelay$: DynamicValue<number>;
  vibFade$: DynamicValue<number>;
  vibRate$: DynamicValue<number>;
  octaveProtect$: DynamicValue<number>;
  unvoiced$: DynamicValue<number>;
  detect$: DynamicValue<number>;
  fmin$: DynamicValue<number>;
  fmax$: DynamicValue<number>;
  ref$: DynamicValue<number>;
  notes$: DynamicValue<boolean>[];
  pitchData$: DynamicValue<Float32Array | null>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
  applyProfile: (profile: number) => void;
  applyScale: (templateIndex: number, key: number) => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function tunerParamDefault(
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

export function rotateScaleBits(bits: readonly number[], key: number): number[] {
  const k = ((Math.round(key) % 12) + 12) % 12;
  return bits.map((_, i) => bits[(i - k + 12) % 12] ?? 0);
}

export function createBoundTunerHost(): ITunerHost {
  const notes$ = TUNER_NOTE_IDS.map((id) => bindBool(id));
  const profile$ = bindNum('profile', 0);
  const fmin$ = bindNum('fmin', 80);
  const fmax$ = bindNum('fmax', 700);
  const retune$ = bindNum('retune', 80);
  const release$ = bindNum('release', 120);
  const threshold$ = bindNum('threshold', 10);
  const flex$ = bindNum('flex', 100);
  const vibrato$ = bindNum('vibrato', 0.75);
  const formant$ = bindNum('formant', 0.85);
  const unvoiced$ = bindNum('unvoiced', 0.58);
  const octaveProtect$ = bindNum('octave_protect', 0.88);
  const settle$ = bindNum('settle', 0.4);
  const vibOn$ = bindBool('vib_on');
  const vibDelay$ = bindNum('vib_delay', 100);
  const vibFade$ = bindNum('vib_fade', 200);
  const vibRate$ = bindNum('vib_rate', 5);

  const applyProfile = (profile: number) => {
    const src = Math.max(0, Math.min(2, Math.round(profile)));
    const d = tunerSourceDefaults(src);
    const ids: [number, DynamicValue<number>, number][] = [
      [paramIds.profile, profile$, src],
      [paramIds.fmin, fmin$, d.fmin],
      [paramIds.fmax, fmax$, d.fmax],
      [paramIds.retune, retune$, d.retune],
      [paramIds.threshold, threshold$, d.threshold],
      [paramIds.flex, flex$, d.flex],
      [paramIds.vibrato, vibrato$, d.vibrato],
      [paramIds.formant, formant$, d.formant],
      [paramIds.unvoiced, unvoiced$, d.unvoiced],
      [paramIds.octave_protect, octaveProtect$, d.octave],
    ];
    for (const [id, dv, v] of ids) {
      postBegin(id);
      dv.set(v);
      postEnd(id);
    }
  };

  const applyScale = (templateIndex: number, key: number) => {
    const tmpl = TUNER_SCALE_TEMPLATES[templateIndex];
    if (!tmpl) return;
    const bits = rotateScaleBits(tmpl.bits, key);
    for (let i = 0; i < 12; ++i) {
      const id = paramIds[TUNER_NOTE_IDS[i]];
      postBegin(id);
      notes$[i].set(bits[i] >= 0.5);
      postEnd(id);
    }
  };

  const pitchData$ = DynamicValue.fromConstant<Float32Array | null>(null);
  bindVizPitch(pitchData$, TUNER_VIZ_ID);

  return {
    meta: pluginMeta,
    bypass$: bindBool('bypass'),
    profile$,
    quality$: bindNum('quality', 0.65),
    formant$,
    retune$,
    release$,
    amount$: bindNum('amount', 1),
    threshold$,
    flex$,
    vibrato$,
    settle$,
    vibOn$,
    vibDelay$,
    vibFade$,
    vibRate$,
    octaveProtect$,
    unvoiced$,
    detect$: bindNum('detect', 0),
    fmin$,
    fmax$,
    ref$: bindNum('ref', 440),
    notes$,
    pitchData$,
    beginEdit: postBegin,
    endEdit: postEnd,
    applyProfile,
    applyScale,
  };
}
