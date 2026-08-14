/**
 * Starting points from classic Calf Saturator / Exciter / Bass Enhancer defaults.
 * UI-only bundles (not host presets) — same pattern as Reverb Room/Hall/Plate.
 *
 * Slope modes: 0=off, 1/2/4 = LR 12/24/48 dB.
 * Mix: out = dry * input + wet * tone(post(sat(feed(x))) − post(feed(x))).
 */

export type HarmonicsPresetId = 'wide' | 'exciter' | 'bass';

export type HarmonicsPresetValues = {
  drive: number;
  blend: number;
  dry: number;
  wet: number;
  oversample: number;
  asymmetry: number;
  tone: number;
  pre_hipass: number;
  pre_lopass: number;
  pre_hp_mode: number;
  pre_lp_mode: number;
  post_hipass: number;
  post_lopass: number;
  post_hp_mode: number;
  post_lp_mode: number;
  pre_listen: number;
  listen: number;
};

export type HarmonicsPreset = {
  id: HarmonicsPresetId;
  label: string;
  values: HarmonicsPresetValues;
};

/** Full-range sat — dry muted, wet hot, filters off. */
const wide: HarmonicsPresetValues = {
  drive: 7.5,
  blend: 0,
  dry: -60,
  wet: 3,
  oversample: 2,
  asymmetry: 0,
  tone: 0,
  pre_hipass: 20,
  pre_lopass: 20000,
  pre_hp_mode: 0,
  pre_lp_mode: 0,
  post_hipass: 20,
  post_lopass: 20000,
  post_hp_mode: 0,
  post_lp_mode: 0,
  pre_listen: 0,
  listen: 0,
};

/** Air / bite — Feed HP 3 kHz @ 24 dB, Post HP 5.5 kHz @ 12 dB. */
const exciter: HarmonicsPresetValues = {
  drive: 7.5,
  blend: 5,
  dry: 0,
  wet: -3,
  oversample: 2,
  asymmetry: 0,
  tone: 0,
  pre_hipass: 3000,
  pre_lopass: 20000,
  pre_hp_mode: 2,
  pre_lp_mode: 0,
  post_hipass: 5500,
  post_lopass: 20000,
  post_hp_mode: 1,
  post_lp_mode: 0,
  pre_listen: 0,
  listen: 0,
};

/** Low weight — Feed LP 150 Hz @ 24 dB, Post LP 100 Hz @ 12 dB. */
const bass: HarmonicsPresetValues = {
  drive: 7.5,
  blend: -5,
  dry: 0,
  wet: 3,
  oversample: 2,
  asymmetry: 0,
  tone: 0,
  pre_hipass: 20,
  pre_lopass: 150,
  pre_hp_mode: 0,
  pre_lp_mode: 2,
  post_hipass: 20,
  post_lopass: 100,
  post_hp_mode: 0,
  post_lp_mode: 1,
  pre_listen: 0,
  listen: 0,
};

export const HARMONICS_PRESETS: readonly HarmonicsPreset[] = [
  { id: 'wide', label: 'Wide', values: wide },
  { id: 'exciter', label: 'Exciter', values: exciter },
  { id: 'bass', label: 'Bass', values: bass },
];
