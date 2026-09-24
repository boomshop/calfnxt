import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/tamerModel';
import {
  auxHighpass6,
  auxHighpass12,
  auxHighpass24,
  auxHighpass36,
  auxHighpass48,
  auxLowpass6,
  auxLowpass12,
  auxLowpass24,
  auxLowpass36,
  auxLowpass48,
} from '../dsp/eqFilters';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizLadder,
  bindVizResponse,
  bindVizSpectrum,
  postBegin,
  postEnd,
} from '../utils/bind_param';

export const TAMER_QUALITY_ENTRIES = [
  { label: 'Fast', value: 0 },
  { label: 'Normal', value: 1 },
  { label: 'Studio', value: 2 },
  { label: 'Ultra', value: 3 },
];

/** Display tilt (matches Analyzer / EQ spectrum). */
export const TAMER_SPECTRUM_ENTRIES = [
  { label: 'Linear', value: 0 },
  { label: '−3 dB/oct', value: 1 },
  { label: '−4.5 dB/oct', value: 2 },
];

/** Plain 0…4 → 6/12/24/36/48 dB (detection HP/LP, always on). */
export type TamerSlopeDb = 6 | 12 | 24 | 36 | 48;

export const TAMER_SLOPE_ENTRIES: { label: string; value: number }[] = [
  { label: '6 dB', value: 0 },
  { label: '12 dB', value: 1 },
  { label: '24 dB', value: 2 },
  { label: '36 dB', value: 3 },
  { label: '48 dB', value: 4 },
];

export function tamerSlopeDbFromPlain(plain: number): TamerSlopeDb {
  switch (Math.round(Math.max(0, Math.min(4, plain)))) {
    case 0:
      return 6;
    case 1:
      return 12;
    case 2:
      return 24;
    case 3:
      return 36;
    default:
      return 48;
  }
}

export function tamerAuxHpType(slopeDb: TamerSlopeDb) {
  if (slopeDb === 6) return auxHighpass6;
  if (slopeDb === 12) return auxHighpass12;
  if (slopeDb === 24) return auxHighpass24;
  if (slopeDb === 36) return auxHighpass36;
  return auxHighpass48;
}

export function tamerAuxLpType(slopeDb: TamerSlopeDb) {
  if (slopeDb === 6) return auxLowpass6;
  if (slopeDb === 12) return auxLowpass12;
  if (slopeDb === 24) return auxLowpass24;
  if (slopeDb === 36) return auxLowpass36;
  return auxLowpass48;
}

export type ITamerHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  fLo$: DynamicValue<number>;
  fHi$: DynamicValue<number>;
  hpSlope$: DynamicValue<number>;
  lpSlope$: DynamicValue<number>;
  depth$: DynamicValue<number>;
  sharpness$: DynamicValue<number>;
  threshold$: DynamicValue<number>;
  harmonics$: DynamicValue<number>;
  attack$: DynamicValue<number>;
  release$: DynamicValue<number>;
  quality$: DynamicValue<number>;
  spectrum$: DynamicValue<number>;
  diffListen$: DynamicValue<boolean>;
  spectrumData$: DynamicValue<number[]>;
  grResponse$: DynamicValue<number[]>;
  /** Harmonic protect guides [n, keep, (hz, halfW)×n]. */
  ladder$: DynamicValue<number[]>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function tamerParamDefault(
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

export function createBoundTamerHost(): ITamerHost {
  const spectrumData$ = DynamicValue.fromConstant<number[]>([]);
  const grResponse$ = DynamicValue.fromConstant<number[]>([]);
  const ladder$ = DynamicValue.fromConstant<number[]>([]);
  bindVizSpectrum(spectrumData$, 'fft');
  bindVizResponse(grResponse$, 'tamer');
  bindVizLadder(ladder$, 'tamer');

  return {
    meta: pluginMeta,
    bypass$: bindBool('bypass'),
    fLo$: bindNum('f_lo', 200),
    fHi$: bindNum('f_hi', 5000),
    hpSlope$: bindNum('hp_slope', 2),
    lpSlope$: bindNum('lp_slope', 2),
    depth$: bindNum('depth', 6),
    sharpness$: bindNum('sharpness', 1 / 12),
    threshold$: bindNum('threshold', 6),
    harmonics$: bindNum('harmonics', 0),
    attack$: bindNum('attack', 5),
    release$: bindNum('release', 80),
    quality$: bindNum('quality', 1),
    spectrum$: bindNum('spectrum', 1),
    diffListen$: bindBool('diff_listen'),
    spectrumData$,
    grResponse$,
    ladder$,
    beginEdit: postBegin,
    endEdit: postEnd,
  };
}
