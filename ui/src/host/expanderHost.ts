import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/expanderModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizEnvelope,
  bindVizGr,
  bindVizPoint,
  bindVizUnitLevels,
  postBegin,
  postEnd,
} from '../utils/bind_param';
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
  /** Live hold amount 0…1 from DSP (tab warn / Holding meter). */
  amount$: DynamicValue<number>;
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
  /** True when either Inv is armed — HistoryChart inhibit series visibility. */
  inhibitHistVisible$: DynamicValue<boolean>;
  gr$: DynamicValue<number>;
  point$: DynamicValue<number[]>;
  historyData$: DynamicValue<Float32Array | null>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function expanderParamDefault(
  name: keyof typeof paramIds,
  fallback = 0,
): number {
  return paramDefault(name, fallback);
}

function bindNum(
  name: keyof typeof paramIds,
  fallback = 0,
): DynamicValue<number> {
  const dv = DynamicValue.fromConstant(paramDefault(name, fallback));
  bindParamToHost(dv, paramIds[name]);
  return dv;
}

function bindBool(name: keyof typeof paramIds): DynamicValue<boolean> {
  const dv = DynamicValue.fromConstant(paramDefault(name, 0) >= 0.5);
  bindBoolParamToHost(dv, paramIds[name]);
  return dv;
}

function bindInhibit(
  prefix: 'inv1' | 'inv2',
  amount$: DynamicValue<number>,
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

export function createBoundExpanderHost(): IExpanderHost {
  const gr$ = DynamicValue.fromConstant(0);
  const point$ = DynamicValue.fromConstant<number[]>([-96, -96]);
  const historyData$ = DynamicValue.fromConstant<Float32Array | null>(null);
  const inhibitAct$ = DynamicValue.fromConstant<number[]>([0, 0]);
  const inv1Amount$ = DynamicValue.fromConstant(0);
  const inv2Amount$ = DynamicValue.fromConstant(0);
  const inhibitHistVisible$ = DynamicValue.fromConstant(false);

  bindVizGr(gr$, 'exp');
  bindVizPoint(point$, 'exp');
  // Always 4-channel envelope — never strip; hide inhibit via visible$ on the graph.
  bindVizEnvelope(historyData$, 'exp');
  bindVizUnitLevels(inhibitAct$, 'exp');
  inhibitAct$.subscribe((v) => {
    inv1Amount$.set(typeof v[0] === 'number' ? v[0] : 0);
    inv2Amount$.set(typeof v[1] === 'number' ? v[1] : 0);
  });

  const threshold$ = bindNum('threshold', -32);
  const releaseThreshold$ = bindNum('release_threshold', -32);

  // Keep release ≤ open in the UI model (DSP also clamps).
  threshold$.subscribe((t) => {
    if (releaseThreshold$.value > t) releaseThreshold$.set(t);
  });

  const listen$ = bindBool('listen');
  const inv1 = bindInhibit('inv1', inv1Amount$);
  const inv2 = bindInhibit('inv2', inv2Amount$);
  wireExclusiveListen([listen$, inv1.listen$, inv2.listen$]);

  const syncInhibitHistVisible = () => {
    inhibitHistVisible$.set(!!(inv1.active$.value || inv2.active$.value));
  };
  inv1.active$.subscribe(syncInhibitHistVisible);
  inv2.active$.subscribe(syncInhibitHistVisible);
  syncInhibitHistVisible();

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
    inhibitHistVisible$,
    gr$,
    point$,
    historyData$,
    beginEdit: postBegin,
    endEdit: postEnd,
  };
}
