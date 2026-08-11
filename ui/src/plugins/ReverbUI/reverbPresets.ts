/** Room-style starting points — writes full param bundles (not host presets). */

export type ReverbPresetId =
  | 'booth'
  | 'room'
  | 'chamber'
  | 'hall'
  | 'plate'
  | 'arena'
  | 'gated';

export type ReverbPresetValues = {
  room_size: number;
  distance: number;
  decay: number;
  diffusion: number;
  diffuse: number;
  predelay: number;
  hipass: number;
  lopass: number;
  hp_mode: number;
  lp_mode: number;
  listen: number;
  hf_damp: number;
  lf_damp: number;
  air: number;
  er_mode: number;
  er_level: number;
  path_mode: number;
  late_level: number;
  mod_rate: number;
  mod_depth: number;
  width_mode: number;
  width: number;
  duck: number;
  gate: number;
  gate_threshold: number;
  gate_hold: number;
  gate_release: number;
  freeze: number;
  dry: number;
  amount: number;
};

export type ReverbPreset = {
  id: ReverbPresetId;
  label: string;
  values: ReverbPresetValues;
};

export const REVERB_PRESETS: readonly ReverbPreset[] = [
  {
    id: 'booth',
    label: 'Booth',
    values: {
      room_size: 3.5,
      distance: 0.2,
      decay: 0.55,
      diffusion: 0.55,
      diffuse: 0.28,
      predelay: 8,
      hipass: 180,
      lopass: 9000,
      hp_mode: 1,
      lp_mode: 1,
      listen: 0,
      hf_damp: 5500,
      lf_damp: 0.22,
      air: 0.12,
      er_mode: 1,
      er_level: -3,
      path_mode: 0,
      late_level: -3,
      mod_rate: 0.55,
      mod_depth: 0.35,
      width_mode: 1,
      width: 0.85,
      duck: 0,
      gate: 0,
      gate_threshold: -24,
      gate_hold: 50,
      gate_release: 120,
      freeze: 0,
      dry: 0,
      amount: -9,
    },
  },
  {
    id: 'room',
    label: 'Room',
    values: {
      room_size: 8,
      distance: 0.35,
      decay: 1.0,
      diffusion: 0.45,
      diffuse: 0.3,
      predelay: 15,
      hipass: 220,
      lopass: 7000,
      hp_mode: 1,
      lp_mode: 1,
      listen: 0,
      hf_damp: 6500,
      lf_damp: 0.2,
      air: 0.25,
      er_mode: 1,
      er_level: -5,
      path_mode: 0,
      late_level: 0,
      mod_rate: 0.5,
      mod_depth: 0.3,
      width_mode: 1,
      width: 1.0,
      duck: 0,
      gate: 0,
      gate_threshold: -24,
      gate_hold: 50,
      gate_release: 120,
      freeze: 0,
      dry: 0,
      amount: -12,
    },
  },
  {
    id: 'chamber',
    label: 'Chamber',
    values: {
      room_size: 14,
      distance: 0.45,
      decay: 1.8,
      diffusion: 0.6,
      diffuse: 0.45,
      predelay: 22,
      hipass: 280,
      lopass: 5500,
      hp_mode: 1,
      lp_mode: 1,
      listen: 0,
      hf_damp: 5000,
      lf_damp: 0.28,
      air: 0.3,
      er_mode: 2,
      er_level: -6,
      path_mode: 1,
      late_level: 0,
      mod_rate: 0.45,
      mod_depth: 0.4,
      width_mode: 3,
      width: 1.15,
      duck: 0.1,
      gate: 0,
      gate_threshold: -24,
      gate_hold: 50,
      gate_release: 120,
      freeze: 0,
      dry: 0,
      amount: -14,
    },
  },
  {
    id: 'hall',
    label: 'Hall',
    values: {
      room_size: 22,
      distance: 0.55,
      decay: 3.2,
      diffusion: 0.7,
      diffuse: 0.5,
      predelay: 28,
      hipass: 250,
      lopass: 4500,
      hp_mode: 1,
      lp_mode: 1,
      listen: 0,
      hf_damp: 4200,
      lf_damp: 0.35,
      air: 0.35,
      er_mode: 1,
      er_level: -8,
      path_mode: 0,
      late_level: 0,
      mod_rate: 0.35,
      mod_depth: 0.45,
      width_mode: 1,
      width: 1.25,
      duck: 0.15,
      gate: 0,
      gate_threshold: -24,
      gate_hold: 50,
      gate_release: 120,
      freeze: 0,
      dry: 0,
      amount: -15,
    },
  },
  {
    id: 'plate',
    label: 'Plate',
    values: {
      room_size: 10,
      distance: 0.3,
      decay: 2.2,
      diffusion: 0.85,
      diffuse: 0.65,
      predelay: 5,
      hipass: 350,
      lopass: 10000,
      hp_mode: 1,
      lp_mode: 1,
      listen: 0,
      hf_damp: 9000,
      lf_damp: 0.45,
      air: 0.5,
      er_mode: 2,
      er_level: -12,
      path_mode: 1,
      late_level: 0,
      mod_rate: 0.7,
      mod_depth: 0.55,
      width_mode: 3,
      width: 1.35,
      duck: 0,
      gate: 0,
      gate_threshold: -24,
      gate_hold: 50,
      gate_release: 120,
      freeze: 0,
      dry: 0,
      amount: -11,
    },
  },
  {
    id: 'arena',
    label: 'Arena',
    values: {
      room_size: 36,
      distance: 0.75,
      decay: 6.5,
      diffusion: 0.75,
      diffuse: 0.55,
      predelay: 45,
      hipass: 200,
      lopass: 3500,
      hp_mode: 1,
      lp_mode: 1,
      listen: 0,
      hf_damp: 3200,
      lf_damp: 0.4,
      air: 0.2,
      er_mode: 1,
      er_level: -10,
      path_mode: 0,
      late_level: 0,
      mod_rate: 0.25,
      mod_depth: 0.5,
      width_mode: 2,
      width: 1.5,
      duck: 0.2,
      gate: 0,
      gate_threshold: -24,
      gate_hold: 50,
      gate_release: 120,
      freeze: 0,
      dry: 0,
      amount: -18,
    },
  },
  {
    id: 'gated',
    label: 'Gated',
    values: {
      room_size: 9,
      distance: 0.25,
      decay: 1.4,
      diffusion: 0.55,
      diffuse: 0.4,
      predelay: 0,
      hipass: 300,
      lopass: 8000,
      hp_mode: 1,
      lp_mode: 1,
      listen: 0,
      hf_damp: 7000,
      lf_damp: 0.25,
      air: 0.3,
      er_mode: 1,
      er_level: -4,
      path_mode: 0,
      late_level: 0,
      mod_rate: 0.5,
      mod_depth: 0.25,
      width_mode: 1,
      width: 1.1,
      duck: 0,
      gate: 1,
      gate_threshold: -18,
      gate_hold: 80,
      gate_release: 60,
      freeze: 0,
      dry: 0,
      amount: -8,
    },
  },
];
