import type { PluginId } from "../plugins/registry";
import { pluginMeta as equalizerMeta } from "../generated/equalizerModel";
import { pluginMeta as stereoMeta } from "../generated/stereoModel";

/** Editor pixel size from `*.plugin.json` (matches VST3 WebView). */
export const editorSizes: Record<PluginId, { width: number; height: number }> = {
  equalizer: equalizerMeta.editor,
  stereo: stereoMeta.editor,
};
