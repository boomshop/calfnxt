import { DynamicValue } from '@deutschesoft/awml';
import { paramIds, pluginMeta } from '../generated/ringmodModel';
import {
  bindBoolParamToHost,
  bindParamToHost,
  bindVizCtrl,
  bindVizUnitLevels,
  postBegin,
  postEnd,
} from '../bind_param';

export const RINGMOD_WAVE_ENTRIES = [
  { icon: 'sine', value: 0 },
  { icon: 'triangle', value: 1 },
  { icon: 'rect', value: 2 },
  { icon: 'saw', value: 3 },
  { icon: 'saw', value: 4 },
];

export type IRingmodHost = {
  meta: typeof pluginMeta;
  bypass$: DynamicValue<boolean>;
  modMode$: DynamicValue<number>;
  modFreq$: DynamicValue<number>;
  modAmount$: DynamicValue<number>;
  modPhase$: DynamicValue<number>;
  modDetune$: DynamicValue<number>;
  modListen$: DynamicValue<boolean>;
  lfo1Mode$: DynamicValue<number>;
  lfo1Freq$: DynamicValue<number>;
  lfo1ModFreqLo$: DynamicValue<number>;
  lfo1ModFreqHi$: DynamicValue<number>;
  lfo1ModFreqActive$: DynamicValue<boolean>;
  lfo1ModDetuneLo$: DynamicValue<number>;
  lfo1ModDetuneHi$: DynamicValue<number>;
  lfo1ModDetuneActive$: DynamicValue<boolean>;
  lfo2Mode$: DynamicValue<number>;
  lfo2Freq$: DynamicValue<number>;
  lfo2Lfo1FreqLo$: DynamicValue<number>;
  lfo2Lfo1FreqHi$: DynamicValue<number>;
  lfo2Lfo1FreqActive$: DynamicValue<boolean>;
  lfo2ModAmountLo$: DynamicValue<number>;
  lfo2ModAmountHi$: DynamicValue<number>;
  lfo2ModAmountActive$: DynamicValue<boolean>;
  /** [lfo1, lfo2] raw activity 0…1 (footer LEDs). */
  lfoActivity$: DynamicValue<number[]>;
  lfo1Activity$: DynamicValue<number>;
  lfo2Activity$: DynamicValue<number>;
  /**
   * Knob LEDs (Calf-style routing + activity):
   * - LFO1 Frequency: LFO1 rate, or LFO2 rate when LFO2→LFO1 freq is active
   * - Mod Frequency / Detune: LFO1 activity while that route is active, else 0
   * - Mod Amount: LFO2 activity while that route is active, else 0
   */
  lfo1FreqLed$: DynamicValue<number>;
  modFreqLed$: DynamicValue<number>;
  modDetuneLed$: DynamicValue<number>;
  modAmountLed$: DynamicValue<number>;
  /**
   * Knob display values: mirror the host param, or follow DSP effective value
   * while the corresponding LFO route overrides the knob.
   */
  modFreqView$: DynamicValue<number>;
  modDetuneView$: DynamicValue<number>;
  modAmountView$: DynamicValue<number>;
  lfo1FreqView$: DynamicValue<number>;
  beginEdit: (id: number) => void;
  endEdit: (id: number) => void;
  pulseReset: (which: 1 | 2) => void;
};

function paramDefault(name: keyof typeof paramIds, fallback = 0): number {
  const meta = pluginMeta.parameters.find((p) => p.id === name);
  return typeof meta?.default === 'number' ? meta.default : fallback;
}

export function ringmodParamDefault(
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

function unit(v: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
}

/** Keep Min ≤ Max: raising Min pushes Max up; lowering Max pulls Min down. */
function wireMinMax(lo$: DynamicValue<number>, hi$: DynamicValue<number>) {
  lo$.subscribe((lo) => {
    if (lo > hi$.value) hi$.set(lo);
  });
  hi$.subscribe((hi) => {
    if (hi < lo$.value) lo$.set(hi);
  });
}

/** Mirror param ↔ view when idle; view tracks effective while `active$` is on. */
function wireOverrideView(
  param$: DynamicValue<number>,
  view$: DynamicValue<number>,
  active$: DynamicValue<boolean>,
  effectiveIndex: number,
  effective$: DynamicValue<number[]>,
) {
  param$.subscribe((v) => {
    if (!active$.value) view$.set(v);
  });
  view$.subscribe((v) => {
    if (!active$.value && Math.abs(param$.value - v) > 1e-9) param$.set(v);
  }, false);
  active$.subscribe((on) => {
    if (on) {
      const cur = effective$.value[effectiveIndex];
      if (typeof cur === 'number' && Number.isFinite(cur)) view$.set(cur);
    } else {
      view$.set(param$.value);
    }
  }, false);
}

export function createBoundRingmodHost(): IRingmodHost {
  const lfoActivity$ = DynamicValue.fromConstant<number[]>([0, 0]);
  const lfo1Activity$ = DynamicValue.fromConstant(0);
  const lfo2Activity$ = DynamicValue.fromConstant(0);
  const lfo1FreqLed$ = DynamicValue.fromConstant(0);
  const modFreqLed$ = DynamicValue.fromConstant(0);
  const modDetuneLed$ = DynamicValue.fromConstant(0);
  const modAmountLed$ = DynamicValue.fromConstant(0);

  const lfo1ModFreqActive$ = bindBool('lfo1_mod_freq_active');
  const lfo1ModDetuneActive$ = bindBool('lfo1_mod_detune_active');
  const lfo2Lfo1FreqActive$ = bindBool('lfo2_lfo1_freq_active');
  const lfo2ModAmountActive$ = bindBool('lfo2_mod_amount_active');

  const lfo1ModFreqLo$ = bindNum('lfo1_mod_freq_lo', 200);
  const lfo1ModFreqHi$ = bindNum('lfo1_mod_freq_hi', 4000);
  const lfo1ModDetuneLo$ = bindNum('lfo1_mod_detune_lo', -100);
  const lfo1ModDetuneHi$ = bindNum('lfo1_mod_detune_hi', 100);
  const lfo2Lfo1FreqLo$ = bindNum('lfo2_lfo1_freq_lo', 0.05);
  const lfo2Lfo1FreqHi$ = bindNum('lfo2_lfo1_freq_hi', 0.5);
  const lfo2ModAmountLo$ = bindNum('lfo2_mod_amount_lo', 0.3);
  const lfo2ModAmountHi$ = bindNum('lfo2_mod_amount_hi', 0.6);
  wireMinMax(lfo1ModFreqLo$, lfo1ModFreqHi$);
  wireMinMax(lfo1ModDetuneLo$, lfo1ModDetuneHi$);
  wireMinMax(lfo2Lfo1FreqLo$, lfo2Lfo1FreqHi$);
  wireMinMax(lfo2ModAmountLo$, lfo2ModAmountHi$);

  const modFreq$ = bindNum('mod_freq', 1000);
  const modDetune$ = bindNum('mod_detune', 0);
  const modAmount$ = bindNum('mod_amount', 0.5);
  const lfo1Freq$ = bindNum('lfo1_freq', 0.1);

  const modFreqView$ = DynamicValue.fromConstant(modFreq$.value);
  const modDetuneView$ = DynamicValue.fromConstant(modDetune$.value);
  const modAmountView$ = DynamicValue.fromConstant(modAmount$.value);
  const lfo1FreqView$ = DynamicValue.fromConstant(lfo1Freq$.value);

  const effective$ = DynamicValue.fromConstant<number[]>([
    modFreq$.value,
    modDetune$.value,
    modAmount$.value,
    lfo1Freq$.value,
  ]);
  bindVizCtrl(effective$, 'ringmod');

  wireOverrideView(modFreq$, modFreqView$, lfo1ModFreqActive$, 0, effective$);
  wireOverrideView(modDetune$, modDetuneView$, lfo1ModDetuneActive$, 1, effective$);
  wireOverrideView(modAmount$, modAmountView$, lfo2ModAmountActive$, 2, effective$);
  wireOverrideView(lfo1Freq$, lfo1FreqView$, lfo2Lfo1FreqActive$, 3, effective$);

  effective$.subscribe((v) => {
    if (lfo1ModFreqActive$.value && typeof v[0] === 'number')
      modFreqView$.set(v[0]);
    if (lfo1ModDetuneActive$.value && typeof v[1] === 'number')
      modDetuneView$.set(v[1]);
    if (lfo2ModAmountActive$.value && typeof v[2] === 'number')
      modAmountView$.set(v[2]);
    if (lfo2Lfo1FreqActive$.value && typeof v[3] === 'number')
      lfo1FreqView$.set(v[3]);
  }, false);

  const syncLeds = () => {
    const a1 = unit(lfo1Activity$.value);
    const a2 = unit(lfo2Activity$.value);
    lfo1FreqLed$.set(lfo2Lfo1FreqActive$.value ? a2 : a1);
    modFreqLed$.set(lfo1ModFreqActive$.value ? a1 : 0);
    modDetuneLed$.set(lfo1ModDetuneActive$.value ? a1 : 0);
    modAmountLed$.set(lfo2ModAmountActive$.value ? a2 : 0);
  };

  bindVizUnitLevels(lfoActivity$, 'lfo');
  lfoActivity$.subscribe((v) => {
    lfo1Activity$.set(unit(v[0] ?? 0));
    lfo2Activity$.set(unit(v[1] ?? 0));
    syncLeds();
  });
  lfo1ModFreqActive$.subscribe(syncLeds, false);
  lfo1ModDetuneActive$.subscribe(syncLeds, false);
  lfo2Lfo1FreqActive$.subscribe(syncLeds, false);
  lfo2ModAmountActive$.subscribe(syncLeds, false);

  const lfo1Reset$ = bindNum('lfo1_reset', 0);
  const lfo2Reset$ = bindNum('lfo2_reset', 0);

  const pulseReset = (which: 1 | 2) => {
    const id = which === 1 ? paramIds.lfo1_reset : paramIds.lfo2_reset;
    const dv = which === 1 ? lfo1Reset$ : lfo2Reset$;
    postBegin(id);
    dv.set(1);
    postEnd(id);
    requestAnimationFrame(() => {
      postBegin(id);
      dv.set(0);
      postEnd(id);
    });
  };

  return {
    meta: pluginMeta,
    bypass$: bindBool('bypass'),
    modMode$: bindNum('mod_mode', 0),
    modFreq$,
    modAmount$,
    modPhase$: bindNum('mod_phase', 0.5),
    modDetune$,
    modListen$: bindBool('mod_listen'),
    lfo1Mode$: bindNum('lfo1_mode', 0),
    lfo1Freq$,
    lfo1ModFreqLo$,
    lfo1ModFreqHi$,
    lfo1ModFreqActive$,
    lfo1ModDetuneLo$,
    lfo1ModDetuneHi$,
    lfo1ModDetuneActive$,
    lfo2Mode$: bindNum('lfo2_mode', 0),
    lfo2Freq$: bindNum('lfo2_freq', 0.2),
    lfo2Lfo1FreqLo$,
    lfo2Lfo1FreqHi$,
    lfo2Lfo1FreqActive$,
    lfo2ModAmountLo$,
    lfo2ModAmountHi$,
    lfo2ModAmountActive$,
    lfoActivity$,
    lfo1Activity$,
    lfo2Activity$,
    lfo1FreqLed$,
    modFreqLed$,
    modDetuneLed$,
    modAmountLed$,
    modFreqView$,
    modDetuneView$,
    modAmountView$,
    lfo1FreqView$,
    beginEdit: postBegin,
    endEdit: postEnd,
    pulseReset,
  };
}
