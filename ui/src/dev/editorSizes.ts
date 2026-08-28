import type { PluginId } from "../plugins/registry";
import { pluginMeta as equalizerMeta } from "../generated/equalizerModel";
import { pluginMeta as stereoMeta } from "../generated/stereoModel";
import { pluginMeta as transientsMeta } from "../generated/transientsModel";
import { pluginMeta as compressorMeta } from "../generated/compressorModel";
import { pluginMeta as expanderMeta } from "../generated/expanderModel";
import { pluginMeta as deesserMeta } from "../generated/deesserModel";
import { pluginMeta as delayMeta } from "../generated/delayModel";
import { pluginMeta as reverbMeta } from "../generated/reverbModel";
import { pluginMeta as mbcompMeta } from "../generated/mbcompModel";
import { pluginMeta as limiterMeta } from "../generated/limiterModel";
import { pluginMeta as mblimiterMeta } from "../generated/mblimiterModel";
import { pluginMeta as harmonicsMeta } from "../generated/harmonicsModel";
import { pluginMeta as analyzerMeta } from "../generated/analyzerModel";
import { pluginMeta as filterMeta } from "../generated/filterModel";
import { pluginMeta as ringmodMeta } from "../generated/ringmodModel";
import { pluginMeta as pulsatorMeta } from "../generated/pulsatorModel";
import { pluginMeta as crusherMeta } from "../generated/crusherModel";
import { pluginMeta as phaserMeta } from "../generated/phaserModel";
import { pluginMeta as flangerMeta } from "../generated/flangerModel";
import { pluginMeta as chorusMeta } from "../generated/chorusModel";
import { pluginMeta as splitMeta } from "../generated/splitModel";
import { pluginMeta as tunerMeta } from "../generated/tunerModel";

/** Editor pixel size from `*.plugin.json` (matches VST3 WebView). */
export const editorSizes: Record<PluginId, { width: number; height: number }> = {
  equalizer: equalizerMeta.editor,
  stereo: stereoMeta.editor,
  transients: transientsMeta.editor,
  compressor: compressorMeta.editor,
  expander: expanderMeta.editor,
  deesser: deesserMeta.editor,
  delay: delayMeta.editor,
  reverb: reverbMeta.editor,
  mbcomp: mbcompMeta.editor,
  limiter: limiterMeta.editor,
  mblimiter: mblimiterMeta.editor,
  harmonics: harmonicsMeta.editor,
  analyzer: analyzerMeta.editor,
  filter: filterMeta.editor,
  ringmod: ringmodMeta.editor,
  pulsator: pulsatorMeta.editor,
  crusher: crusherMeta.editor,
  phaser: phaserMeta.editor,
  flanger: flangerMeta.editor,
  chorus: chorusMeta.editor,
  split: splitMeta.editor,
  tuner: tunerMeta.editor,
};
