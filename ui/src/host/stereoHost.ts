import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/stereoModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizCorr,
  bindVizGonio,
  postBegin,
  postEnd,
} from '../bind_param';

export const STEREO_MODE_ENTRIES = [
  { label: 'LR → LR', value: 0 },
  { label: 'LR → MS', value: 1 },
  { label: 'MS → LR', value: 2 },
  { label: 'LR → LL', value: 3 },
  { label: 'LR → RR', value: 4 },
  { label: 'LR → L+R', value: 5 },
  { label: 'LR → RL', value: 6 },
];

/** Two-line bus badge labels (stacked spans in the UI). */
export type StereoBusPair = readonly [string, string];

const LR: StereoBusPair = ['L', 'R'];
const MS: StereoBusPair = ['M', 'S'];
const LL: StereoBusPair = ['L', 'L'];
const RR: StereoBusPair = ['R', 'R'];
const RL: StereoBusPair = ['R', 'L'];
const MM: StereoBusPair = ['M', 'M'];

/** Bus format pairs: input (into In) vs output of the mode matrix. */
export function stereoBusFormats(mode: number): {
  beforeMode: StereoBusPair;
  afterMode: StereoBusPair;
} {
  switch (Math.round(mode)) {
    case 1: // LR → MS
      return { beforeMode: LR, afterMode: MS };
    case 2: // MS → LR
      return { beforeMode: MS, afterMode: LR };
    case 3: // LR → LL
      return { beforeMode: LR, afterMode: LL };
    case 4: // LR → RR
      return { beforeMode: LR, afterMode: RR };
    case 5: // LR → L+R mono
      return { beforeMode: LR, afterMode: MM };
    case 6: // LR → RL
      return { beforeMode: LR, afterMode: RL };
    case 0: // LR → LR
    default:
      return { beforeMode: LR, afterMode: LR };
  }
}

export type IStereoHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  levelL$: DynamicValue<number>;
  levelR$: DynamicValue<number>;
  mode$: DynamicValue<number>;
  mlev$: DynamicValue<number>;
  mpan$: DynamicValue<number>;
  slev$: DynamicValue<number>;
  sbal$: DynamicValue<number>;
  decorr$: DynamicValue<boolean>;
  decorrAmount$: DynamicValue<number>;
  decorrXover$: DynamicValue<number>;
  decorrSlope$: DynamicValue<number>;
  decorrStages$: DynamicValue<number>;
  decorrSpread$: DynamicValue<number>;
  muteL$: DynamicValue<boolean>;
  muteR$: DynamicValue<boolean>;
  phaseL$: DynamicValue<boolean>;
  phaseR$: DynamicValue<boolean>;
  delay$: DynamicValue<number>;
  stereoBase$: DynamicValue<number>;
  stereoPhase$: DynamicValue<number>;
  balanceOut$: DynamicValue<number>;
  corr$: DynamicValue<number>;
  gonio$: DynamicValue<number[]>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
};

function bindNum(name: keyof typeof paramIds): DynamicValue<number> {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  const dv = DynamicValue.fromConstant(meta?.default ?? 0);
  bindParamToHost(dv, paramIds[name]);
  return dv;
}

function bindBool(name: keyof typeof paramIds): DynamicValue<boolean> {
  const dv = DynamicValue.fromConstant(false);
  bindBoolParamToHost(dv, paramIds[name]);
  return dv;
}

export function createBoundStereoHost(): IStereoHost {
  const corr$ = DynamicValue.fromConstant(0);
  const gonio$ = DynamicValue.fromConstant<number[]>([]);
  bindVizCorr(corr$, 'stereo');
  bindVizGonio(gonio$, 'stereo');

  return {
    meta: pluginMeta,
    bypass$: bindBool('bypass'),
    levelL$: bindNum('level_l'),
    levelR$: bindNum('level_r'),
    mode$: bindNum('mode'),
    mlev$: bindNum('mlev'),
    mpan$: bindNum('mpan'),
    slev$: bindNum('slev'),
    sbal$: bindNum('sbal'),
    decorr$: bindBool('decorr'),
    decorrAmount$: bindNum('decorr_amount'),
    decorrXover$: bindNum('decorr_xover'),
    decorrSlope$: bindNum('decorr_slope'),
    decorrStages$: bindNum('decorr_stages'),
    decorrSpread$: bindNum('decorr_spread'),
    muteL$: bindBool('mute_l'),
    muteR$: bindBool('mute_r'),
    phaseL$: bindBool('phase_l'),
    phaseR$: bindBool('phase_r'),
    delay$: bindNum('delay'),
    stereoBase$: bindNum('stereo_base'),
    stereoPhase$: bindNum('stereo_phase'),
    balanceOut$: bindNum('balance_out'),
    corr$,
    gonio$,
    beginEdit: (id) => postBegin(id),
    endEdit: (id) => postEnd(id),
  };
}
