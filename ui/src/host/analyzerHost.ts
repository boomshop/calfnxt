import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/analyzerModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizCorr,
  bindVizGonio,
  bindVizSpectrum,
  postBegin,
  postEnd,
} from '../bind_param';

export const ANALYZER_MODE_ENTRIES = [
  { label: 'Average', value: 0 },
  { label: 'Max', value: 1 },
  { label: 'Stereo', value: 2 },
  { label: 'Difference', value: 3 },
  { label: 'Spectralizer', value: 4 },
] as const;

export const ANALYZER_FFT_ENTRIES = [
  { label: '1k', value: 0 },
  { label: '2k', value: 1 },
  { label: '4k', value: 2 },
  { label: '8k', value: 3 },
] as const;

export const ANALYZER_SCALE_ENTRIES = [
  { label: 'Linear', value: 0 },
  { label: '−3 dB', value: 1 },
  { label: '−4.5 dB', value: 2 },
] as const;

export type IAnalyzerHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  mode$: DynamicValue<number>;
  hold$: DynamicValue<boolean>;
  fftSize$: DynamicValue<number>;
  scale$: DynamicValue<number>;
  spectrum$: DynamicValue<number[]>;
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
  const mode$ = DynamicValue.fromConstant(analyzerParamDefault('mode'));
  bindParamToHost(mode$, paramIds.mode);

  const bypass$ = DynamicValue.fromConstant(false);
  bindBoolParamToHost(bypass$, paramIds.bypass);

  const hold$ = DynamicValue.fromConstant(false);
  bindBoolParamToHost(hold$, paramIds.hold);

  const fftSize$ = DynamicValue.fromConstant(analyzerParamDefault('fft_size', 1));
  bindParamToHost(fftSize$, paramIds.fft_size);

  const scale$ = DynamicValue.fromConstant(analyzerParamDefault('scale'));
  bindParamToHost(scale$, paramIds.scale);

  const spectrum$ = DynamicValue.fromConstant<number[]>([]);
  bindVizSpectrum(spectrum$, 'fft');

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
    spectrum$,
    corr$,
    gonio$,
    beginEdit: (id) => postBegin(id),
    endEdit: (id) => postEnd(id),
  };
}
