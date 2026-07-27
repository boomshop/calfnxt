import type { PluginId } from "../plugins/registry";
import { pluginMeta as equalizerMeta } from "../generated/equalizerModel";

/** Editor pixel size from `*.plugin.json` (matches VST3 WebView). */
export const editorSizes: Record<PluginId, { width: number; height: number }> = {
  equalizer: equalizerMeta.editor,
};
