import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/expanderModel';
import { bindVizUnitLevels, postBegin, postEnd } from '../utils/bind_param';
import {
  bindDynamicsHostViz,
  makeHostParamBinders,
  makeParamDefault,
} from '../utils/hostParamBind';
import {
  COMPRESSOR_CHANNEL_ENTRIES,
  COMPRESSOR_LINK_ENTRIES,
  COMPRESSOR_MODE_ENTRIES,
} from './compressorHost';

export const EXPANDER_MODE_ENTRIES = COMPRESSOR_MODE_ENTRIES;
export const EXPANDER_LINK_ENTRIES = COMPRESSOR_LINK_ENTRIES;
export const EXPANDER_CHANNEL_ENTRIES = COMPRESSOR_CHANNEL_ENTRIES;

export type ExpanderPanelId = 'detector' | 'inv1' | 'inv2';

export type IExpanderInhibitHost = {
  active$: DynamicValue<boolean>;
  gain$: DynamicValue<number>;
  threshold$: DynamicValue<number>;
  hold$: DynamicValue<number>;
  release$: DynamicValue<number>;
  hipass$: DynamicValue<number>;
  lopass$: DynamicValue<number>;
  hpMode$: DynamicValue<number>;
  lpMode$: DynamicValue<number>;
  listen$: DynamicValue<boolean>;
  /** Live hold amount 0…1 from DSP (tab warn / Hold meter). */
  amount$: DynamicValue<number>;
  /** Post-filter Inv key peak in dBFS (−60…0) for LevelMeter. */
  levelDb$: DynamicValue<number>;
};

export type IExpanderHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  /** 0 Stereo / 1 Left / 2 Right / 3 Mid / 4 Side. */
  channel$: DynamicValue<number>;
  sidechainActive$: DynamicValue<boolean>;
  threshold$: DynamicValue<number>;
  releaseThreshold$: DynamicValue<number>;
  relThreshActive$: DynamicValue<boolean>;
  ratio$: DynamicValue<number>;
  knee$: DynamicValue<number>;
  attack$: DynamicValue<number>;
  hold$: DynamicValue<number>;
  release$: DynamicValue<number>;
  range$: DynamicValue<number>;
  mode$: DynamicValue<number>;
  link$: DynamicValue<number>;
  hipass$: DynamicValue<number>;
  lopass$: DynamicValue<number>;
  hpMode$: DynamicValue<number>;
  lpMode$: DynamicValue<number>;
  listen$: DynamicValue<boolean>;
  inv1: IExpanderInhibitHost;
  inv2: IExpanderInhibitHost;
  /**
   * Key MultiMeter values in dBFS (−60…0): Trig post, then I1/H1 and/or I2/H2
   * depending on which Inv paths are armed. Hold amount is mapped 0…1 → −60…0.
   */
  keyMeters$: DynamicValue<number[]>;
  keyMeterCount$: DynamicValue<number>;
  gr$: DynamicValue<number>;
  point$: DynamicValue<number[]>;
  historyData$: DynamicValue<Float32Array | null>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
};

const paramDefault = makeParamDefault(pluginMeta.parameters);

export function expanderParamDefault(
  name: keyof typeof paramIds,
  fallback = 0,
): number {
  return paramDefault(name, fallback);
}

const { bindNum, bindBool } = makeHostParamBinders(paramIds, paramDefault);

function bindInhibit(
  prefix: 'inv1' | 'inv2',
  amount$: DynamicValue<number>,
  levelDb$: DynamicValue<number>,
): IExpanderInhibitHost {
  return {
    active$: bindBool(`${prefix}_active`),
    gain$: bindNum(`${prefix}_gain`, 0),
    threshold$: bindNum(`${prefix}_threshold`, -24),
    hold$: bindNum(`${prefix}_hold`, 50),
    release$: bindNum(`${prefix}_release`, 120),
    hipass$: bindNum(`${prefix}_hipass`, 20),
    lopass$: bindNum(`${prefix}_lopass`, 20000),
    hpMode$: bindNum(`${prefix}_hp_mode`, 0),
    lpMode$: bindNum(`${prefix}_lp_mode`, 0),
    listen$: bindBool(`${prefix}_listen`),
    amount$,
    levelDb$,
  };
}

/** Keep listen exclusive across main detector + both inhibit paths. */
function wireExclusiveListen(listens: DynamicValue<boolean>[]): void {
  for (const a of listens) {
    a.subscribe((on) => {
      if (!on) return;
      for (const b of listens) {
        if (b !== a && b.value) b.set(false);
      }
    });
  }
}

/** Peak unit 0…1 → dBFS (−60…0), matching ExpanderPlugin::takeLfoActivity. */
function peakUnitToDb(u: number): number {
  if (!Number.isFinite(u)) return -60;
  return Math.min(0, Math.max(-60, u * 60 - 60));
}

/** Hold desire 0…1 → same −60…0 scale so it shares a MultiMeter. */
function holdToDb(amt: number): number {
  if (!Number.isFinite(amt)) return -60;
  return Math.min(0, Math.max(-60, amt * 60 - 60));
}

export function createBoundExpanderHost(): IExpanderHost {
  const gr$ = DynamicValue.fromConstant(0);
  const point$ = DynamicValue.fromConstant<number[]>([-96, -96]);
  const historyData$ = DynamicValue.fromConstant<Float32Array | null>(null);
  const inhibitAct$ = DynamicValue.fromConstant<number[]>([0, 0, 0, 0, 0]);
  const inv1Amount$ = DynamicValue.fromConstant(0);
  const inv2Amount$ = DynamicValue.fromConstant(0);
  const inv1LevelDb$ = DynamicValue.fromConstant(-60);
  const inv2LevelDb$ = DynamicValue.fromConstant(-60);
  const triggerLevelDb$ = DynamicValue.fromConstant(-60);
  const keyMeters$ = DynamicValue.fromConstant<number[]>([-60]);
  const keyMeterCount$ = DynamicValue.fromConstant(1);

  // Always 6-channel envelope — Inv series use listed$/visible$ on the graph.
  bindDynamicsHostViz('exp', { gr$, point$, historyData$ });
  bindVizUnitLevels(inhibitAct$, 'exp');

  const threshold$ = bindNum('threshold', -32);
  const releaseThreshold$ = bindNum('release_threshold', -32);

  // Keep release ≤ open in the UI model (DSP also clamps).
  threshold$.subscribe((t) => {
    if (releaseThreshold$.value > t) releaseThreshold$.set(t);
  });

  const listen$ = bindBool('listen');
  const inv1 = bindInhibit('inv1', inv1Amount$, inv1LevelDb$);
  const inv2 = bindInhibit('inv2', inv2Amount$, inv2LevelDb$);
  wireExclusiveListen([listen$, inv1.listen$, inv2.listen$]);

  const syncKeyMeters = () => {
    const vals: number[] = [triggerLevelDb$.value ?? -60];
    if (inv1.active$.value) {
      vals.push(inv1LevelDb$.value ?? -60, holdToDb(inv1Amount$.value ?? 0));
    }
    if (inv2.active$.value) {
      vals.push(inv2LevelDb$.value ?? -60, holdToDb(inv2Amount$.value ?? 0));
    }
    keyMeters$.set(vals);
    keyMeterCount$.set(vals.length);
  };

  inhibitAct$.subscribe((v) => {
    inv1Amount$.set(typeof v[0] === 'number' ? v[0] : 0);
    inv2Amount$.set(typeof v[1] === 'number' ? v[1] : 0);
    inv1LevelDb$.set(peakUnitToDb(typeof v[2] === 'number' ? v[2] : 0));
    inv2LevelDb$.set(peakUnitToDb(typeof v[3] === 'number' ? v[3] : 0));
    triggerLevelDb$.set(peakUnitToDb(typeof v[4] === 'number' ? v[4] : 0));
    syncKeyMeters();
  });
  inv1.active$.subscribe(syncKeyMeters);
  inv2.active$.subscribe(syncKeyMeters);
  syncKeyMeters();

  return {
    meta: pluginMeta,
    bypass$: bindBool('bypass'),
    channel$: bindNum('channel', 0),
    sidechainActive$: bindBool('sidechain_active'),
    threshold$,
    releaseThreshold$,
    relThreshActive$: bindBool('rel_thresh_active'),
    ratio$: bindNum('ratio', 4),
    knee$: bindNum('knee', 6),
    attack$: bindNum('attack', 5),
    hold$: bindNum('hold', 0),
    release$: bindNum('release', 120),
    range$: bindNum('range', -60),
    mode$: bindNum('mode', 1),
    link$: bindNum('link', 0),
    hipass$: bindNum('hipass', 20),
    lopass$: bindNum('lopass', 20000),
    hpMode$: bindNum('hp_mode', 0),
    lpMode$: bindNum('lp_mode', 0),
    listen$,
    inv1,
    inv2,
    keyMeters$,
    keyMeterCount$,
    gr$,
    point$,
    historyData$,
    beginEdit: postBegin,
    endEdit: postEnd,
  };
}
