import type { ComponentType } from "react";

export type PluginId =
  | "equalizer"
  | "stereo"
  | "transients"
  | "compressor"
  | "expander"
  | "deesser"
  | "delay"
  | "reverb"
  | "mbcomp"
  | "limiter"
  | "mblimiter"
  | "harmonics"
  | "analyzer";

type PluginLoader = () => Promise<{ default: ComponentType }>;

/** Hash route id → lazy plugin shell (bound to VST3 host). */
export const pluginApps: Record<PluginId, PluginLoader> = {
  equalizer: () => import("./EqualizerUI/BoundEqualizerUI"),
  stereo: () => import("./StereoUI/BoundStereoUI"),
  transients: () => import("./TransientsUI/BoundTransientsUI"),
  compressor: () => import("./CompressorUI/BoundCompressorUI"),
  expander: () => import("./ExpanderUI/BoundExpanderUI"),
  deesser: () => import("./DeesserUI/BoundDeesserUI"),
  delay: () => import("./DelayUI/BoundDelayUI"),
  reverb: () => import("./ReverbUI/BoundReverbUI"),
  mbcomp: () => import("./MbcompUI/BoundMbcompUI"),
  limiter: () => import("./LimiterUI/BoundLimiterUI"),
  mblimiter: () => import("./MblimiterUI/BoundMblimiterUI"),
  harmonics: () => import("./HarmonicsUI/BoundHarmonicsUI"),
  analyzer: () => import("./AnalyzerUI/BoundAnalyzerUI"),
};

export function isPluginId(id: string): id is PluginId {
  return Object.prototype.hasOwnProperty.call(pluginApps, id);
}

export function knownPluginIds(): PluginId[] {
  return Object.keys(pluginApps) as PluginId[];
}

/** Read plugin id from location.hash (`#equalizer`). */
export function pluginIdFromHash(hash = window.location.hash): string {
  return hash.replace(/^#/, "").split(/[?/]/, 1)[0].trim();
}
