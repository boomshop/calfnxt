import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/pulsatorModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizLfo,
  bindVizTempo,
  postBegin,
  postEnd,
} from '../bind_param';

export const PULSATOR_PW_ENTRIES = [
  { label: '⅛', value: 0 },
  { label: '¼', value: 1 },
  { label: '½', value: 2 },
  { label: '1', value: 3 },
  { label: '2', value: 4 },
];

export type IPulsatorHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  mode$: DynamicValue<number>;
  amount$: DynamicValue<number>;
  offsetL$: DynamicValue<number>;
  offsetR$: DynamicValue<number>;
  mono$: DynamicValue<boolean>;
  pulseWidth$: DynamicValue<number>;
  sync$: DynamicValue<boolean>;
  bpm$: DynamicValue<number>;
  ms$: DynamicValue<number>;
  /** [valid 0/1, bpm] */
  hostTempo$: DynamicValue<number[]>;
  /** Live [phaseL, valL, phaseR, valR]. */
  lfo$: DynamicValue<number[]>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
  pulseReset: () => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function pulsatorParamDefault(
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

/** Link bpm ↔ ms (BPM is SSOT when either knob moves) — same as Delay.
 *  Range: 0.5…300 BPM ↔ 200…120000 ms (down to ~2 min/cycle). */
function linkBpmMs(bpm$: DynamicValue<number>, ms$: DynamicValue<number>) {
  let guard = false;
  bpm$.subscribe((bpm) => {
    if (guard) return;
    const b = Math.max(0.5, Math.min(300, bpm));
    const ms = Math.min(120000, Math.max(200, 60000 / b));
    if (Math.abs(ms$.value - ms) < 0.05) return;
    guard = true;
    ms$.set(ms);
    guard = false;
  }, false);
  ms$.subscribe((ms) => {
    if (guard) return;
    const m = Math.max(200, Math.min(120000, ms));
    const bpm = Math.min(300, Math.max(0.5, 60000 / m));
    if (Math.abs(bpm$.value - bpm) < 0.05) return;
    guard = true;
    bpm$.set(bpm);
    guard = false;
  }, false);
}

export function createBoundPulsatorHost(): IPulsatorHost {
  const reset$ = bindNum('reset', 0);
  const bpm$ = bindNum('bpm', 120);
  const ms$ = bindNum('ms', 500);
  linkBpmMs(bpm$, ms$);

  const hostTempo$ = DynamicValue.fromConstant<number[]>([0, 120]);
  const lfo$ = DynamicValue.fromConstant<number[]>([0, 0, 0, 0]);
  bindVizTempo(hostTempo$, 'pulsator');
  bindVizLfo(lfo$, 'pulsator');

  const pulseReset = () => {
    const id = paramIds.reset;
    postBegin(id);
    reset$.set(1);
    window.setTimeout(() => {
      reset$.set(0);
      postEnd(id);
    }, 40);
  };

  return {
    meta: pluginMeta,
    bypass$: bindBool('bypass'),
    mode$: bindNum('mode', 0),
    amount$: bindNum('amount', 1),
    offsetL$: bindNum('offset_l', 0),
    offsetR$: bindNum('offset_r', 0.5),
    mono$: bindBool('mono'),
    pulseWidth$: bindNum('pulsewidth', 3),
    sync$: bindBool('sync'),
    bpm$,
    ms$,
    hostTempo$,
    lfo$,
    beginEdit: postBegin,
    endEdit: postEnd,
    pulseReset,
  };
}
