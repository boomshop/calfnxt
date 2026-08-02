import type { PluginId } from "../plugins/registry";
import { pluginMeta as equalizerMeta } from "../generated/equalizerModel";
import { pluginMeta as stereoMeta } from "../generated/stereoModel";
import { pluginMeta as transientsMeta } from "../generated/transientsModel";
import { pluginMeta as compressorMeta } from "../generated/compressorModel";
import { pluginMeta as deesserMeta } from "../generated/deesserModel";
import { pluginMeta as delayMeta } from "../generated/delayModel";

/** Editor pixel size from `*.plugin.json` (matches VST3 WebView). */
export const editorSizes: Record<PluginId, { width: number; height: number }> = {
  equalizer: equalizerMeta.editor,
  stereo: stereoMeta.editor,
  transients: transientsMeta.editor,
  compressor: compressorMeta.editor,
  deesser: deesserMeta.editor,
  delay: delayMeta.editor,
};
