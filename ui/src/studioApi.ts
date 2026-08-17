/**
 * Public surface for the screenshot Studio (`studio/`).
 * VST entries keep using Bound*UI; Studio builds hosts itself and injects fixtures.
 *
 * Do not re-export `plugins/registry` (it lazy-loads Bound*UI shells).
 */

export type PluginId =
  | 'equalizer'
  | 'stereo'
  | 'transients'
  | 'compressor'
  | 'expander'
  | 'deesser'
  | 'delay'
  | 'reverb'
  | 'mbcomp'
  | 'limiter'
  | 'mblimiter'
  | 'harmonics'
  | 'analyzer'
  | 'filter'
  | 'ringmod'
  | 'pulsator';

const PLUGIN_IDS: PluginId[] = [
  'equalizer',
  'stereo',
  'transients',
  'compressor',
  'expander',
  'deesser',
  'delay',
  'reverb',
  'mbcomp',
  'limiter',
  'mblimiter',
  'harmonics',
  'analyzer',
  'filter',
  'ringmod',
  'pulsator',
];

export function isPluginId(id: string): id is PluginId {
  return (PLUGIN_IDS as string[]).includes(id);
}

export function knownPluginIds(): PluginId[] {
  return PLUGIN_IDS.slice();
}

/** Read plugin id from location.hash (`#equalizer`). */
export function pluginIdFromHash(hash = window.location.hash): string {
  return hash.replace(/^#/, '').split(/[?/]/, 1)[0].trim();
}

export { editorSizes } from './dev/editorSizes';

export { CompressorUI } from './plugins/CompressorUI/CompressorUI';
export {
  createBoundCompressorHost,
  type ICompressorHost,
} from './host/compressorHost';

export { ExpanderUI } from './plugins/ExpanderUI/ExpanderUI';
export {
  createBoundExpanderHost,
  type IExpanderHost,
} from './host/expanderHost';

export { DeesserUI } from './plugins/DeesserUI/DeesserUI';
export {
  createBoundDeesserHost,
  type IDeesserHost,
} from './host/deesserHost';

export { DelayUI } from './plugins/DelayUI/DelayUI';
export { createBoundDelayHost, type IDelayHost } from './host/delayHost';

export { EqualizerUI } from './plugins/EqualizerUI/EqualizerUI';
export {
  createBoundEqualizerHost,
  type IEqualizerHost,
  type IEqualizerBand,
} from './host/equalizerHost';

export { MbcompUI } from './plugins/MbcompUI/MbcompUI';
export {
  createBoundMbcompHost,
  type IMbcompHost,
  type IMbcompBand,
} from './host/mbcompHost';

export { LimiterUI } from './plugins/LimiterUI/LimiterUI';
export {
  createBoundLimiterHost,
  type ILimiterHost,
} from './host/limiterHost';

export { MblimiterUI } from './plugins/MblimiterUI/MblimiterUI';
export {
  createBoundMblimiterHost,
  type IMblimiterHost,
  type IMblimiterBand,
} from './host/mblimiterHost';

export { HarmonicsUI } from './plugins/HarmonicsUI/HarmonicsUI';
export {
  createBoundHarmonicsHost,
  type IHarmonicsHost,
} from './host/harmonicsHost';
export { HARMONICS_PRESETS } from './plugins/HarmonicsUI/harmonicsPresets';

export { ReverbUI } from './plugins/ReverbUI/ReverbUI';
export { createBoundReverbHost, type IReverbHost } from './host/reverbHost';
export { REVERB_PRESETS } from './plugins/ReverbUI/reverbPresets';

export { StereoUI } from './plugins/StereoUI/StereoUI';
export { createBoundStereoHost, type IStereoHost } from './host/stereoHost';

export { TransientsUI } from './plugins/TransientsUI/TransientsUI';
export {
  createBoundTransientsHost,
  type ITransientsHost,
} from './host/transientsHost';

export { AnalyzerUI } from './plugins/AnalyzerUI/AnalyzerUI';
export {
  createBoundAnalyzerHost,
  type IAnalyzerHost,
} from './host/analyzerHost';

export { FilterUI } from './plugins/FilterUI/FilterUI';
export {
  createBoundFilterHost,
  type IFilterHost,
} from './host/filterHost';

export { RingmodUI } from './plugins/RingmodUI/RingmodUI';
export {
  createBoundRingmodHost,
  type IRingmodHost,
} from './host/ringmodHost';

export { PulsatorUI } from './plugins/PulsatorUI/PulsatorUI';
export {
  createBoundPulsatorHost,
  type IPulsatorHost,
} from './host/pulsatorHost';

export { createHeaderIo, type IHeaderIo } from './host/headerMeters';

/** Studio forces this off before capture (WithInfo tip bubbles). */
export { showWidgetInfo$ } from './prefs/showWidgetInfo';

/** Studio forces night + calfnxt accents for consistent website shots. */
export { themeAccent$, themeMode$ } from './prefs/theme';
