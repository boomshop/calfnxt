import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/transientsModel';
import { bindBoolParamToHost, bindParamToHost, bindVizEnvelope, postBegin, postEnd } from '../bind_param';
import { FREQUENCY_RANGE_MODE_ENTRIES } from '../widgets/FrequencyRange';

export const TRANSIENTS_VIEW_ENTRIES = [
  { label: 'Output', value: 0 },
  { label: 'Envelope', value: 1 },
  { label: 'Attack', value: 2 },
  { label: 'Release', value: 3 },
];

export const TRANSIENTS_LINK_ENTRIES = [
  { label: 'Max', value: 0 },
  { label: 'Avg', value: 1 },
  { label: 'Mid', value: 2 },
];

/** @deprecated Prefer FREQUENCY_RANGE_MODE_ENTRIES from FrequencyRange. */
export const TRANSIENTS_FILTER_MODE_ENTRIES = FREQUENCY_RANGE_MODE_ENTRIES;

export type ITransientsHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  mix$: DynamicValue<number>;
  attackTime$: DynamicValue<number>;
  attackBoost$: DynamicValue<number>;
  sustainThreshold$: DynamicValue<number>;
  releaseTime$: DynamicValue<number>;
  releaseBoost$: DynamicValue<number>;
  lookahead$: DynamicValue<number>;
  view$: DynamicValue<number>;
  hipass$: DynamicValue<number>;
  lopass$: DynamicValue<number>;
  hpMode$: DynamicValue<number>;
  lpMode$: DynamicValue<number>;
  listen$: DynamicValue<boolean>;
  softClip$: DynamicValue<number>;
  link$: DynamicValue<number>;
  sensitivity$: DynamicValue<number>;
  delta$: DynamicValue<boolean>;
  /** Envelope buffer: original, filtered, output, envelope, attack, release + phase. */
  envelopeData$: DynamicValue<Float32Array | null>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  return pluginMeta.parameters.find((p) => p.id === name)?.default ?? fallback;
}

/** DSP descriptor default (plain) for AUX Knob double-click reset. */
export function transientsParamDefault(
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

export function createBoundTransientsHost(): ITransientsHost {
  const envelopeData$ = DynamicValue.fromConstant<Float32Array | null>(null);
  bindVizEnvelope(envelopeData$, 'env');

  return {
    meta: pluginMeta,
    bypass$: bindBool('bypass'),
    mix$: bindNum('mix', 1),
    attackTime$: bindNum('attack_time', 30),
    attackBoost$: bindNum('attack_boost', 0),
    sustainThreshold$: bindNum('sustain_threshold', 0),
    releaseTime$: bindNum('release_time', 300),
    releaseBoost$: bindNum('release_boost', 0),
    lookahead$: bindNum('lookahead', 0),
    view$: bindNum('view', 0),
    hipass$: bindNum('hipass', 100),
    lopass$: bindNum('lopass', 5000),
    hpMode$: bindNum('hp_mode', 0),
    lpMode$: bindNum('lp_mode', 0),
    listen$: bindBool('listen'),
    softClip$: bindNum('soft_clip', 0),
    link$: bindNum('link', 0),
    sensitivity$: bindNum('sensitivity', 0),
    delta$: bindBool('delta'),
    envelopeData$,
    beginEdit: (id) => postBegin(id),
    endEdit: (id) => postEnd(id),
  };
}
