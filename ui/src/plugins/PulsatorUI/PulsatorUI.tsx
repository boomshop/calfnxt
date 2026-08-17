import { useEffect, useMemo, useRef } from 'react';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import type { DynamicValue } from '@deutschesoft/awml';
import { DynamicValue as DV } from '@deutschesoft/awml';
import { Header } from '../../components';
import {
  Button,
  Buttons,
  Knob,
  PulsatorChart,
  Toggle,
  WaveformButtons,
  WithInfo,
} from '../../widgets';
import { paramIds } from '../../generated/pulsatorModel';
import {
  PULSATOR_PW_ENTRIES,
  pulsatorParamDefault,
  type IPulsatorHost,
} from '../../host/pulsatorHost';
import { pulsatorInfo } from './pulsatorInfo';
import '../PluginUI.scss';
import './PulsatorUI.scss';

export interface PulsatorUIProps {
  host: IPulsatorHost;
}

const AMOUNT_DOTS = [0, 0.25, 0.5, 0.75, 1];
const AMOUNT_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.25, label: '25' },
  { pos: 0.5, label: '50' },
  { pos: 0.75, label: '75' },
  { pos: 1, label: '100' },
];

const OFFSET_DOTS = [0, 0.25, 0.5, 0.75, 1];
const OFFSET_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.25, label: '25' },
  { pos: 0.5, label: '50' },
  { pos: 0.75, label: '75' },
  { pos: 1, label: '100' },
];

const BPM_DOTS = [0.5, 1, 3, 10, 30, 60, 120, 300];
const BPM_LABELS = [
  { pos: 0.5, label: '0.5' },
  { pos: 1, label: '1' },
  { pos: 3, label: '3' },
  { pos: 10, label: '10' },
  { pos: 30, label: '30' },
  { pos: 60, label: '60' },
  { pos: 120, label: '120' },
  { pos: 300, label: '300' },
];

const MS_DOTS = [200, 500, 1000, 5000, 15000, 60000, 120000];
const MS_LABELS = [
  { pos: 200, label: '0.2s' },
  { pos: 500, label: '0.5s' },
  { pos: 1000, label: '1s' },
  { pos: 5000, label: '5s' },
  { pos: 15000, label: '15s' },
  { pos: 60000, label: '1m' },
  { pos: 120000, label: '2m' },
];

function useTapTempo(
  bpm$: DynamicValue<number>,
  beginEdit: () => void,
  endEdit: () => void,
  disabled: boolean,
) {
  const times = useRef<number[]>([]);
  return () => {
    if (disabled) return;
    const now = performance.now();
    if (
      times.current.length &&
      now - times.current[times.current.length - 1] > 2000
    )
      times.current = [];
    times.current.push(now);
    const t = times.current;
    if (t.length < 2) return;
    let sum = 0;
    for (let i = 1; i < t.length; ++i) sum += t[i]! - t[i - 1]!;
    const bpm = Math.min(300, Math.max(0.5, 60000 / (sum / (t.length - 1))));
    beginEdit();
    bpm$.set(bpm);
    endEdit();
  };
}

/** Display DV: follows param unless sync locks to host tempo. */
function useTimingView(
  param$: DynamicValue<number>,
  locked: boolean,
  lockedValue: number,
): DynamicValue<number> {
  const view$ = useMemo(() => DV.fromConstant(param$.value), [param$]);
  useEffect(() => {
    if (locked) {
      view$.set(lockedValue);
      return;
    }
    view$.set(param$.value);
    const u1 = param$.subscribe((v) => view$.set(v), false);
    const u2 = view$.subscribe((v) => {
      if (Math.abs(param$.value - v) > 1e-4) param$.set(v);
    }, false);
    return () => {
      u1();
      u2();
    };
  }, [locked, lockedValue, param$, view$]);
  return view$;
}

export function PulsatorUI(props: PulsatorUIProps) {
  const { host } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });

  const mode = useDynamicValueReadonly(host.mode$, 0);
  const pulseWidth = useDynamicValueReadonly(host.pulseWidth$, 3);
  const sync = useDynamicValueReadonly(host.sync$, false);
  const hostTempo = useDynamicValueReadonly(host.hostTempo$, [0, 120]);
  const hostValid = (hostTempo[0] ?? 0) >= 0.5;
  const hostBpm = hostTempo[1] ?? 120;
  const timingLocked = sync && hostValid;

  const bpmView$ = useTimingView(host.bpm$, timingLocked, hostBpm);
  const msView$ = useTimingView(
    host.ms$,
    timingLocked,
    Math.min(120000, Math.max(200, 60000 / hostBpm)),
  );

  const onTap = useTapTempo(
    host.bpm$,
    () => host.beginEdit(paramIds.bpm),
    () => host.endEdit(paramIds.bpm),
    timingLocked,
  );

  return (
    <div className="PulsatorUI PluginUI">
      <Header title="Pulsator">
        <WithInfo title={pulsatorInfo.mono}>
          <Toggle state$={host.mono$} icon="stereo" icon_active="mono" />
        </WithInfo>
        <WithInfo title={pulsatorInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
        <WithInfo title={pulsatorInfo.reset} className="reset">
          <Button label="Reset" onClick={() => host.pulseReset()} />
        </WithInfo>
      </Header>

      <div className="block timing">
        <div className="title">Timing</div>
        <WithInfo title={pulsatorInfo.sync} className="sync">
          <Toggle
            state$={host.sync$}
            label={hostValid ? `Host Sync ${Math.round(hostBpm)}` : 'Host Sync'}
          />
        </WithInfo>
        <WithInfo title={pulsatorInfo.tempo} className="bpm">
          <Knob
            label="Tempo"
            value$={bpmView$}
            min={0.5}
            max={300}
            reset={pulsatorParamDefault('bpm')}
            scale="frequency"
            dots={BPM_DOTS}
            labels={BPM_LABELS}
            disabled={timingLocked}
            {...edit(paramIds.bpm)}
          />
        </WithInfo>
        <WithInfo title={pulsatorInfo.beatMs} className="ms">
          <Knob
            label="Beat"
            value$={msView$}
            min={200}
            max={120000}
            reset={pulsatorParamDefault('ms')}
            scale="frequency"
            dots={MS_DOTS}
            labels={MS_LABELS}
            disabled={timingLocked}
            {...{
              'value.format': (v: number) =>
                v >= 1000 ? `${(v / 1000).toFixed(3)}s` : `${Math.round(v)}ms`,
            }}
            {...edit(paramIds.ms)}
          />
        </WithInfo>
        <WithInfo title={pulsatorInfo.tap} className="tap">
          <Button
            label="Tap Tempo"
            className={timingLocked ? 'disabled' : undefined}
            onClick={onTap}
            disabled={timingLocked}
          />
        </WithInfo>
      </div>

      <div className="block modulation">
        <div className="title">Modulation</div>
        <WithInfo title={pulsatorInfo.mode} className="info-block wave">
          <WaveformButtons
            value={mode}
            onChange={(v) => {
              host.beginEdit(paramIds.mode);
              host.mode$.set(v);
              host.endEdit(paramIds.mode);
            }}
          />
        </WithInfo>
        <WithInfo title={pulsatorInfo.amount}>
          <Knob
            label="Amount"
            value$={host.amount$}
            min={0}
            max={1}
            reset={pulsatorParamDefault('amount')}
            dots={AMOUNT_DOTS}
            labels={AMOUNT_LABELS}
            size="large"
            {...edit(paramIds.amount)}
          />
        </WithInfo>
        <WithInfo title={pulsatorInfo.pulseWidth} className="info-block pw">
          <Buttons
            layout="horizontal"
            entries={PULSATOR_PW_ENTRIES}
            value={Math.round(pulseWidth)}
            onChange={(v) => {
              host.beginEdit(paramIds.pulsewidth);
              host.pulseWidth$.set(v as number);
              host.endEdit(paramIds.pulsewidth);
            }}
          />
        </WithInfo>
      </div>

      <div className="block pulse">
        <div className="title">Pulse</div>
        <PulsatorChart
          className="chart"
          mode$={host.mode$}
          amount$={host.amount$}
          offsetL$={host.offsetL$}
          offsetR$={host.offsetR$}
          pulseWidth$={host.pulseWidth$}
          lfo$={host.lfo$}
        />
        <div className="offsets">
          <WithInfo title={pulsatorInfo.offsetL}>
            <Knob
              label="Offset L"
              value$={host.offsetL$}
              min={0}
              max={1}
              reset={pulsatorParamDefault('offset_l')}
              dots={OFFSET_DOTS}
              labels={OFFSET_LABELS}
              {...edit(paramIds.offset_l)}
            />
          </WithInfo>
          <WithInfo title={pulsatorInfo.offsetR}>
            <Knob
              label="Offset R"
              value$={host.offsetR$}
              min={0}
              max={1}
              reset={pulsatorParamDefault('offset_r')}
              dots={OFFSET_DOTS}
              labels={OFFSET_LABELS}
              {...edit(paramIds.offset_r)}
            />
          </WithInfo>
        </div>
      </div>
    </div>
  );
}
