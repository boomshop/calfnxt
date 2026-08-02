import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/delayModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizTempo,
  postBegin,
  postEnd,
} from '../bind_param';

export const DELAY_MIX_MODE_ENTRIES = [
  { label: 'Stereo', value: 0 },
  { label: 'Ping-Pong', value: 1 },
  { label: 'L then R', value: 2 },
  { label: 'R then L', value: 3 },
];

export type IDelayHost = {
  meta: typeof pluginMeta;
  active$: DynamicValue<boolean>;
  sync$: DynamicValue<boolean>;
  bpm$: DynamicValue<number>;
  ms$: DynamicValue<number>;
  subdiv$: DynamicValue<number>;
  timeL$: DynamicValue<number>;
  timeR$: DynamicValue<number>;
  feedback$: DynamicValue<number>;
  amount$: DynamicValue<number>;
  dry$: DynamicValue<number>;
  width$: DynamicValue<number>;
  mixMode$: DynamicValue<number>;
  hipass$: DynamicValue<number>;
  lopass$: DynamicValue<number>;
  hpMode$: DynamicValue<number>;
  lpMode$: DynamicValue<number>;
  /** [valid, bpm] from host ProcessContext. */
  hostTempo$: DynamicValue<number[]>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function delayParamDefault(
  name: keyof typeof paramIds,
  fallback = 0,
): number {
  return paramDefault(name, fallback);
}

function bindNum(name: keyof typeof paramIds, fallback = 0): DynamicValue<number> {
  const dv = DynamicValue.fromConstant(paramDefault(name, fallback));
  bindParamToHost(dv, paramIds[name]);
  return dv;
}

function bindBool(name: keyof typeof paramIds): DynamicValue<boolean> {
  const dv = DynamicValue.fromConstant(paramDefault(name, 0) >= 0.5);
  bindBoolParamToHost(dv, paramIds[name]);
  return dv;
}

/** Link bpm ↔ ms (BPM is SSOT when either knob moves). */
function linkBpmMs(bpm$: DynamicValue<number>, ms$: DynamicValue<number>) {
  let guard = false;
  bpm$.subscribe((bpm) => {
    if (guard)
      return;
    const ms = Math.min(2000, Math.max(10, 60000 / Math.max(30, Math.min(300, bpm))));
    if (Math.abs(ms$.value - ms) < 0.05)
      return;
    guard = true;
    ms$.set(ms);
    guard = false;
  }, false);
  ms$.subscribe((ms) => {
    if (guard)
      return;
    const bpm = Math.min(300, Math.max(30, 60000 / Math.max(10, Math.min(2000, ms))));
    if (Math.abs(bpm$.value - bpm) < 0.05)
      return;
    guard = true;
    bpm$.set(bpm);
    guard = false;
  }, false);
}

export function createBoundDelayHost(): IDelayHost {
  const bpm$ = bindNum('bpm', 120);
  const ms$ = bindNum('ms', 500);
  linkBpmMs(bpm$, ms$);

  const hostTempo$ = DynamicValue.fromConstant<number[]>([0, 120]);
  bindVizTempo(hostTempo$, 'delay');

  return {
    meta: pluginMeta,
    active$: bindBool('active'),
    sync$: bindBool('sync'),
    bpm$,
    ms$,
    subdiv$: bindNum('subdiv', 4),
    timeL$: bindNum('time_l', 3),
    timeR$: bindNum('time_r', 5),
    feedback$: bindNum('feedback', 0.5),
    amount$: bindNum('amount', -12),
    dry$: bindNum('dry', 0),
    width$: bindNum('width', 1),
    mixMode$: bindNum('mix_mode', 1),
    hipass$: bindNum('hipass', 80),
    lopass$: bindNum('lopass', 8000),
    hpMode$: bindNum('hp_mode', 0),
    lpMode$: bindNum('lp_mode', 2),
    hostTempo$,
    beginEdit: postBegin,
    endEdit: postEnd,
  };
}
