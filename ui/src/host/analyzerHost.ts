import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/analyzerModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizCorr,
  bindVizGonio,
  bindVizLoudness,
  bindVizSpectrum,
  postBegin,
  postEnd,
} from '../utils/bind_param';

export const ANALYZER_FFT_ENTRIES = [
  { label: '1k', value: 0 },
  { label: '2k', value: 1 },
  { label: '4k', value: 2 },
  { label: '8k', value: 3 },
] as const;

export const ANALYZER_STANDARD_ENTRIES = [
  { label: 'EBU', value: 0, target: -23, ceil: -1 },
  { label: 'ATSC', value: 1, target: -24, ceil: -2 },
  { label: '−14', value: 2, target: -14, ceil: -1 },
  { label: '−16', value: 3, target: -16, ceil: -1 },
] as const;

export const ANALYZER_SCALE_ENTRIES = [
  { label: 'Linear', value: 0 },
  { label: '−3 dB', value: 1 },
  { label: '−4.5 dB', value: 2 },
] as const;

export type IAnalyzerHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  mode$: DynamicValue<boolean>;
  hold$: DynamicValue<boolean>;
  fftSize$: DynamicValue<number>;
  scale$: DynamicValue<number>;
  standard$: DynamicValue<number>;
  target$: DynamicValue<number>;
  tpCeil$: DynamicValue<number>;
  spectrum$: DynamicValue<number[]>;
  loudness$: DynamicValue<number[]>;
  /** Last ~12 s, slot-major: momentary, short-term, true peak, RMS (dB). */
  loudnessHistory$: DynamicValue<Float32Array | null>;
  momentary$: DynamicValue<number>;
  shortTerm$: DynamicValue<number>;
  integrated$: DynamicValue<number>;
  lra$: DynamicValue<number>;
  /** Absolute short-term ends of the loudness range (LUFS). */
  lraLo$: DynamicValue<number>;
  lraHi$: DynamicValue<number>;
  peakL$: DynamicValue<number>;
  peakR$: DynamicValue<number>;
  rmsL$: DynamicValue<number>;
  rmsR$: DynamicValue<number>;
  /** MultiMeter order: L RMS, L peak, R peak, R RMS. */
  levels$: DynamicValue<number[]>;
  /** MultiMeter order: momentary, short-term, integrated (LUFS). */
  lufs$: DynamicValue<number[]>;
  corr$: DynamicValue<number>;
  gonio$: DynamicValue<number[]>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
};

/** DSP descriptor default (plain) for AUX Knob double-click reset. */
export function analyzerParamDefault(
  name: keyof typeof paramIds,
  fallback = 0,
): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function createBoundAnalyzerHost(): IAnalyzerHost {
  const mode$ = DynamicValue.fromConstant(false);
  bindBoolParamToHost(mode$, paramIds.mode);

  const bypass$ = DynamicValue.fromConstant(false);
  bindBoolParamToHost(bypass$, paramIds.bypass);

  const hold$ = DynamicValue.fromConstant(false);
  bindBoolParamToHost(hold$, paramIds.hold);

  const fftSize$ = DynamicValue.fromConstant(analyzerParamDefault('fft_size', 2));
  bindParamToHost(fftSize$, paramIds.fft_size);

  const scale$ = DynamicValue.fromConstant(analyzerParamDefault('scale'));
  bindParamToHost(scale$, paramIds.scale);

  const standard$ = DynamicValue.fromConstant(analyzerParamDefault('standard', 2));
  bindParamToHost(standard$, paramIds.standard);

  const target$ = DynamicValue.fromConstant(analyzerParamDefault('target', -14));
  bindParamToHost(target$, paramIds.target);

  const tpCeil$ = DynamicValue.fromConstant(analyzerParamDefault('tp_ceil', -1));
  bindParamToHost(tpCeil$, paramIds.tp_ceil);

  const spectrum$ = DynamicValue.fromConstant<number[]>([]);
  bindVizSpectrum(spectrum$, 'fft');

  const loudness$ = DynamicValue.fromConstant<number[]>([]);
  bindVizLoudness(loudness$, 'loud');

  const METER_FLOOR = -60;
  const meterDb = (v: number | undefined) =>
    v == null || !Number.isFinite(v) || v < -90 ? METER_FLOOR : v;

  const loudnessHistory$ = DynamicValue.fromConstant<Float32Array | null>(null);
  const momentary$ = DynamicValue.fromConstant(METER_FLOOR);
  const shortTerm$ = DynamicValue.fromConstant(METER_FLOOR);
  const integrated$ = DynamicValue.fromConstant(METER_FLOOR);
  const lra$ = DynamicValue.fromConstant(-200);
  const lraLo$ = DynamicValue.fromConstant(METER_FLOOR);
  const lraHi$ = DynamicValue.fromConstant(METER_FLOOR);
  const peakL$ = DynamicValue.fromConstant(METER_FLOOR);
  const peakR$ = DynamicValue.fromConstant(METER_FLOOR);
  const rmsL$ = DynamicValue.fromConstant(METER_FLOOR);
  const rmsR$ = DynamicValue.fromConstant(METER_FLOOR);
  const levels$ = DynamicValue.fromConstant<number[]>([
    METER_FLOOR,
    METER_FLOOR,
    METER_FLOOR,
    METER_FLOOR,
  ]);
  const lufs$ = DynamicValue.fromConstant<number[]>([
    METER_FLOOR,
    METER_FLOOR,
    METER_FLOOR,
  ]);

  loudness$.subscribe((v) => {
    const momentary = meterDb(v[0]);
    const shortTerm = meterDb(v[1]);
    const integrated = (v[12] ?? 0) >= 0.5 ? meterDb(v[2]) : METER_FLOOR;
    momentary$.set(momentary);
    shortTerm$.set(shortTerm);
    integrated$.set(integrated);
    lufs$.set([momentary, shortTerm, integrated]);
    const lraOk = (v[13] ?? 0) >= 0.5;
    lra$.set(lraOk && Number.isFinite(v[3]) ? v[3]! : -200);
    lraLo$.set(lraOk ? meterDb(v[18]) : METER_FLOOR);
    lraHi$.set(lraOk ? meterDb(v[19]) : METER_FLOOR);
    const rmsL = meterDb(v[16]);
    const rmsR = meterDb(v[17]);
    const pkL = meterDb(v[4]);
    const pkR = meterDb(v[5]);
    rmsL$.set(rmsL);
    rmsR$.set(rmsR);
    peakL$.set(pkL);
    peakR$.set(pkR);
    levels$.set([rmsL, pkL, pkR, rmsR]);

    const n = Math.max(0, Math.round(v[20] ?? 0));
    const need = n * 4;
    const base = 21;
    if (need < 4 || v.length < base + need) {
      loudnessHistory$.set(null);
      return;
    }
    const buf = new Float32Array(need);
    for (let i = 0; i < need; ++i) buf[i] = v[base + i] ?? -200;
    loudnessHistory$.set(buf);
  });

  const corr$ = DynamicValue.fromConstant(0);
  const gonio$ = DynamicValue.fromConstant<number[]>([]);
  bindVizCorr(corr$, 'stereo');
  bindVizGonio(gonio$, 'stereo');

  return {
    meta: pluginMeta,
    bypass$,
    mode$,
    hold$,
    fftSize$,
    scale$,
    standard$,
    target$,
    tpCeil$,
    spectrum$,
    loudness$,
    loudnessHistory$,
    momentary$,
    shortTerm$,
    integrated$,
    lra$,
    lraLo$,
    lraHi$,
    peakL$,
    peakR$,
    rmsL$,
    rmsR$,
    levels$,
    lufs$,
    corr$,
    gonio$,
    beginEdit: (id) => postBegin(id),
    endEdit: (id) => postEnd(id),
  };
}
