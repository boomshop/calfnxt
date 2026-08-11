import { useEffect, useMemo } from 'react';
import { DynamicValue } from '@deutschesoft/awml';
import {
  type EqPassSlope,
  type IEqualizerBand,
  toAuxEqType,
} from '../../host/equalizerHost';
import { EQChart, Knob, Select, Toggle } from '../';
import { WithInfo } from '../WithInfo';
import type { AuxOnSet } from '../editGesture';
import { frequencyRangeInfo } from './frequencyRangeInfo';
import './FrequencyRange.scss';

/** HP/LP mode plains: 0=off, 1/2/3/4 = 12/24/36/48 dB. */
export const FREQUENCY_RANGE_MODE_ENTRIES = [
  { label: 'Off', value: 0 },
  { label: '12 dB', value: 1 },
  { label: '24 dB', value: 2 },
  { label: '36 dB', value: 3 },
  { label: '48 dB', value: 4 },
];

const HP_LP_DOTS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const HP_LP_LABELS = [
  { pos: 20, label: '20' },
  { pos: 100, label: '100' },
  { pos: 1000, label: '1k' },
  { pos: 10000, label: '10k' },
  { pos: 20000, label: '20k' },
];

/** Map DSP mode 0…4 → chart slope (mode 0 unused while inactive). */
function slopeFromMode(mode: number): EqPassSlope {
  if (mode >= 4) return 48;
  if (mode >= 3) return 36;
  if (mode >= 2) return 24;
  return 12;
}

export type FrequencyRangeEdit = {
  beginEdit?: () => void;
  endEdit?: () => void;
  onSet?: AuxOnSet;
};

export interface FrequencyRangeProps {
  className?: string;
  hipass$: DynamicValue<number>;
  lopass$: DynamicValue<number>;
  hpMode$: DynamicValue<number>;
  lpMode$: DynamicValue<number>;
  /** When set, shows headphones toggle for sidechain listen. */
  listen$?: DynamicValue<boolean>;
  hipassDefault?: number;
  lopassDefault?: number;
  hipassEdit?: FrequencyRangeEdit;
  lopassEdit?: FrequencyRangeEdit;
  title?: string;
}

/**
 * Shared HP/LP sidechain range: EQChart + slope selects + freq knobs (+ listen).
 * Encapsulates fake EqBand wiring for detector filters.
 */
export function FrequencyRange(props: FrequencyRangeProps) {
  const {
    className,
    hipass$,
    lopass$,
    hpMode$,
    lpMode$,
    listen$,
    hipassDefault = 100,
    lopassDefault = 5000,
    hipassEdit,
    lopassEdit,
  } = props;

  const filterBands = useMemo<IEqualizerBand[]>(() => {
    const makeBand = (
      index: number,
      id: string,
      type: 'highpass' | 'lowpass',
      frequency$: DynamicValue<number>,
      mode$: DynamicValue<number>,
      freqDefault: number,
    ) => {
      const gain$ = DynamicValue.fromConstant(0);
      const effectiveGain$ = DynamicValue.fromConstant(0);
      const q$ = DynamicValue.fromConstant(0.707);
      const type$ = DynamicValue.fromConstant(type);
      const initialMode = mode$.value;
      const slope$ = DynamicValue.fromConstant<EqPassSlope>(
        slopeFromMode(initialMode > 0 ? initialMode : 1),
      );
      const auxType$ = DynamicValue.fromConstant(
        toAuxEqType(type, slope$.value),
      );
      const active$ = DynamicValue.fromConstant(initialMode > 0);
      const dyn$ = DynamicValue.fromConstant(false);
      const dynAttack$ = DynamicValue.fromConstant(0);
      const dynRelease$ = DynamicValue.fromConstant(0);
      const dynThreshold$ = DynamicValue.fromConstant(0);
      const dynRatio$ = DynamicValue.fromConstant(1);
      const bandListen$ = DynamicValue.fromConstant(false);
      const unsub = mode$.subscribe((v: number) => {
        active$.set(v > 0);
        if (v > 0) {
          const slope = slopeFromMode(v);
          slope$.set(slope);
          auxType$.set(toAuxEqType(type, slope));
        }
      }, false);
      return {
        index,
        id,
        gain$,
        effectiveGain$,
        frequency$,
        q$,
        type$,
        slope$,
        auxType$,
        active$,
        dyn$,
        dynAttack$,
        dynRelease$,
        dynThreshold$,
        dynRatio$,
        listen$: bandListen$,
        defaults: {
          frequency: freqDefault,
          gain: 0,
          q: 0.707,
          dynAttack: 0,
          dynRelease: 0,
          dynThreshold: 0,
          dynRatio: 1,
        },
        _unsub: unsub,
      };
    };

    return [
      makeBand(0, 'freq-range-hp', 'highpass', hipass$, hpMode$, hipassDefault),
      makeBand(1, 'freq-range-lp', 'lowpass', lopass$, lpMode$, lopassDefault),
    ] as (IEqualizerBand & { _unsub: () => void })[];
  }, [hipass$, hpMode$, lopass$, lpMode$, hipassDefault, lopassDefault]);

  useEffect(
    () => () =>
      (filterBands as (IEqualizerBand & { _unsub?: () => void })[]).forEach(
        (band) => band._unsub?.(),
      ),
    [filterBands],
  );

  const cls = ['FrequencyRange', className ?? ''].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      {listen$ ? (
        <WithInfo title={frequencyRangeInfo.listen}>
          <Toggle state$={listen$} icon="headphones" className="listen warn" />
        </WithInfo>
      ) : null}
      <EQChart
        bands={filterBands}
        interactive
        showLabels={false}
        yRange={{ min: -60, max: 6 }}
        dbGrid={12}
      />
      <div className="filter">
        <WithInfo title={frequencyRangeInfo.hpMode}>
          <Select value$={hpMode$} entries={FREQUENCY_RANGE_MODE_ENTRIES} />
        </WithInfo>
        <WithInfo title={frequencyRangeInfo.hipass}>
          <Knob
            label="HP Hz"
            value$={hipass$}
            min={20}
            max={20000}
            reset={hipassDefault}
            scale="frequency"
            dots={HP_LP_DOTS}
            labels={HP_LP_LABELS}
            size="small"
            {...hipassEdit}
          />
        </WithInfo>
        <WithInfo title={frequencyRangeInfo.lopass}>
          <Knob
            label="LP Hz"
            value$={lopass$}
            min={20}
            max={20000}
            reset={lopassDefault}
            scale="frequency"
            dots={HP_LP_DOTS}
            labels={HP_LP_LABELS}
            size="small"
            {...lopassEdit}
          />
        </WithInfo>
        <WithInfo title={frequencyRangeInfo.lpMode}>
          <Select value$={lpMode$} entries={FREQUENCY_RANGE_MODE_ENTRIES} />
        </WithInfo>
      </div>
    </div>
  );
}
