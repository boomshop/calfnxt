import { DynamicValue } from '@deutschesoft/awml';
import type { DynamicValue as DV } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/alignerModel';
import { postBegin, postEnd } from '../utils/bind_param';
import { bindVizCtrl, bindVizWave } from '../utils/bind_param';
import {
  makeHostParamBinders,
  makeParamDefault,
} from '../utils/hostParamBind';

export const ALIGNER_LANES = 8 as const;

export type AlignerLaneHost = {
  mute$: DV<boolean>;
  solo$: DV<boolean>;
  phase$: DV<boolean>;
  join$: DV<boolean>;
  delay$: DV<number>;
  gain$: DV<number>;
  pan$: DV<number>;
  corr$: DV<number>;
};

export type IAlignerHost = {
  meta: typeof pluginMeta;
  bypass$: DV<boolean>;
  anchor$: DV<number>;
  masterVolume$: DV<number>;
  masterTrim$: DV<number>;
  analysisHp$: DV<number>;
  analysisLp$: DV<number>;
  analysisHpMode$: DV<number>;
  analysisLpMode$: DV<number>;
  filterHit$: DV<boolean>;
  filterWaves$: DV<boolean>;
  filterCorr$: DV<boolean>;
  waveSpan$: DV<number>;
  lanes: AlignerLaneHost[];
  maxLag$: DV<number>;
  /** Latency reported to the host (ms). */
  latencyMs$: DV<number>;
  /** Hit windows + master extras (see AlignWaveStrip). */
  wave$: DV<number[]>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
  dispose: () => void;
};

const paramDefault = makeParamDefault(pluginMeta.parameters);

export function alignerParamDefault(
  name: keyof typeof paramIds,
  fallback = 0,
): number {
  return paramDefault(name, fallback);
}

const { bindNum, bindBool } = makeHostParamBinders(paramIds, paramDefault);

function laneKey(i: number, suffix: string): keyof typeof paramIds {
  const n = String(i + 1).padStart(2, '0');
  return `b${n}_${suffix}` as keyof typeof paramIds;
}

export function createBoundAlignerHost(): IAlignerHost {
  // kind "ctrl": [latencyMs, maxLaneMs, corr×8]
  const status$ = DynamicValue.fromConstant([] as number[]);
  const wave$ = DynamicValue.fromConstant([] as number[]);
  const unbindStatus = bindVizCtrl(status$, 'aligner');
  const unbindWave = bindVizWave(wave$, 'aligner');

  const maxLag$ = DynamicValue.fromConstant(0);
  const latencyMs$ = DynamicValue.fromConstant(0);
  const laneCorr: DV<number>[] = [];
  for (let i = 0; i < ALIGNER_LANES; ++i) {
    laneCorr.push(DynamicValue.fromConstant(0));
  }

  const unsub = status$.subscribe((v) => {
    if (!v || v.length < 2 + ALIGNER_LANES) return;
    latencyMs$.set(v[0] ?? 0);
    maxLag$.set(v[1] ?? 0);
    for (let i = 0; i < ALIGNER_LANES; ++i) {
      laneCorr[i]!.set(v[2 + i] ?? 0);
    }
  });

  const lanes: AlignerLaneHost[] = [];
  for (let i = 0; i < ALIGNER_LANES; ++i) {
    lanes.push({
      mute$: bindBool(laneKey(i, 'mute')),
      solo$: bindBool(laneKey(i, 'solo')),
      phase$: bindBool(laneKey(i, 'phase')),
      join$: bindBool(laneKey(i, 'join')),
      delay$: bindNum(laneKey(i, 'delay')),
      gain$: bindNum(laneKey(i, 'gain')),
      pan$: bindNum(laneKey(i, 'pan')),
      corr$: laneCorr[i]!,
    });
  }

  return {
    meta: pluginMeta,
    bypass$: bindBool('bypass'),
    anchor$: bindNum('anchor'),
    masterVolume$: bindNum('master_volume'),
    masterTrim$: bindNum('master_trim'),
    analysisHp$: bindNum('analysis_hp'),
    analysisLp$: bindNum('analysis_lp'),
    analysisHpMode$: bindNum('analysis_hp_mode'),
    analysisLpMode$: bindNum('analysis_lp_mode'),
    filterHit$: bindBool('filter_hit'),
    filterWaves$: bindBool('filter_waves'),
    filterCorr$: bindBool('filter_corr'),
    waveSpan$: bindNum('wave_span'),
    lanes,
    maxLag$,
    latencyMs$,
    wave$,
    beginEdit: postBegin,
    endEdit: postEnd,
    dispose: () => {
      unbindStatus();
      unbindWave();
      unsub();
    },
  };
}
