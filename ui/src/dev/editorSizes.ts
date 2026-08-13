import type { PluginId } from "../plugins/registry";
import { pluginMeta as equalizerMeta } from "../generated/equalizerModel";
import { pluginMeta as stereoMeta } from "../generated/stereoModel";
import { pluginMeta as transientsMeta } from "../generated/transientsModel";
import { pluginMeta as compressorMeta } from "../generated/compressorModel";
import { pluginMeta as deesserMeta } from "../generated/deesserModel";
import { pluginMeta as delayMeta } from "../generated/delayModel";
import { pluginMeta as reverbMeta } from "../generated/reverbModel";
import { pluginMeta as mbcompMeta } from "../generated/mbcompModel";
import { pluginMeta as limiterMeta } from "../generated/limiterModel";
import { pluginMeta as mblimiterMeta } from "../generated/mblimiterModel";
import { pluginMeta as harmonicsMeta } from "../generated/harmonicsModel";

/** Editor pixel size from `*.plugin.json` (matches VST3 WebView). */
export const editorSizes: Record<PluginId, { width: number; height: number }> = {
  equalizer: equalizerMeta.editor,
  stereo: stereoMeta.editor,
  transients: transientsMeta.editor,
  compressor: compressorMeta.editor,
  deesser: deesserMeta.editor,
  delay: delayMeta.editor,
  reverb: reverbMeta.editor,
  mbcomp: mbcompMeta.editor,
  limiter: limiterMeta.editor,
  mblimiter: mblimiterMeta.editor,
  harmonics: harmonicsMeta.editor,
};
