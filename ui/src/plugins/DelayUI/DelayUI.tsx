import { useEffect, useMemo, useRef } from 'react';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { DynamicValue } from '@deutschesoft/awml';
import { Header } from '../../components';
import {
  Button,
  Buttons,
  DelayEchoChart,
  FrequencyRange,
  Knob,
  Toggle,
  WithInfo,
} from '../../widgets';
import { paramIds } from '../../generated/delayModel';
import {
  DELAY_MIX_MODE_ENTRIES,
  delayParamDefault,
  type IDelayHost,
} from '../../host/delayHost';
import { delayInfo } from './delayInfo';
import '../PluginUI.scss';
import './DelayUI.scss';

export interface DelayUIProps {
  host: IDelayHost;
}

const SUBDIV_DOTS = [1, 2, 3, 4, 6, 8, 12, 16];
const SUBDIV_LABELS = SUBDIV_DOTS.map((n) => ({ pos: n, label: String(n) }));
const TIME_DOTS = [1, 2, 3, 4, 6, 8, 12, 16];
const TIME_LABELS = TIME_DOTS.map((n) => ({ pos: n, label: String(n) }));
const FB_DOTS = [0, 0.25, 0.5, 0.75, 1];
const FB_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.25, label: '.25' },
  { pos: 0.5, label: '.5' },
  { pos: 0.75, label: '.75' },
  { pos: 1, label: '1' },
];
const MIX_DB_DOTS = [-60, -48, -36, -24, -12, -6, 0, 6, 12];
const MIX_DB_LABELS = [
  { pos: -60, label: '−60' },
  { pos: -36, label: '−36' },
  { pos: -12, label: '−12' },
  { pos: 0, label: '0' },
  { pos: 12, label: '+12' },
];
const BPM_DOTS = [30, 60, 120, 180, 240, 300];
const BPM_LABELS = [
  { pos: 30, label: '30' },
  { pos: 60, label: '60' },
  { pos: 120, label: '120' },
  { pos: 180, label: '180' },
  { pos: 240, label: '240' },
  { pos: 300, label: '300' },
];
const MS_DOTS = [10, 100, 250, 500, 1000, 1500, 2000];
const MS_LABELS = [
  { pos: 10, label: '10' },
  { pos: 100, label: '100' },
  { pos: 250, label: '250' },
  { pos: 500, label: '500' },
  { pos: 1000, label: '1k' },
  { pos: 1500, label: '1.5k' },
  { pos: 2000, label: '2k' },
];
const WIDTH_DOTS = [-1, -0.5, 0, 0.5, 1];
const WIDTH_LABELS = [
  { pos: -1, label: '−1' },
  { pos: -0.5, label: '−.5' },
  { pos: 0, label: '0' },
  { pos: 0.5, label: '.5' },
  { pos: 1, label: '+1' },
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
    for (let i = 1; i < t.length; ++i) sum += t[i] - t[i - 1];
    const bpm = Math.min(300, Math.max(30, 60000 / (sum / (t.length - 1))));
    beginEdit();
    bpm$.set(bpm);
    endEdit();
  };
}

/**
 * Display DV for bpm/ms: follows host params unless sync locks to host tempo
 * (then knobs are disabled and show host BPM without writing presets).
 */
function useTimingView(
  param$: DynamicValue<number>,
  locked: boolean,
  lockedValue: number,
): DynamicValue<number> {
  const view$ = useMemo(
    () => DynamicValue.fromConstant(param$.value),
    [param$],
  );
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

/** Delay editor: timing, mix, feedback filter, predictive echo charts. */
export function DelayUI(props: DelayUIProps) {
  const { host } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });

  const sync = useDynamicValueReadonly(host.sync$, false);
  const mixMode = useDynamicValueReadonly(host.mixMode$, 1);
  const hostTempo = useDynamicValueReadonly(host.hostTempo$, [0, 120]);
  const hostValid = (hostTempo[0] ?? 0) >= 0.5;
  const hostBpm = hostTempo[1] ?? 120;
  const timingLocked = sync && hostValid;

  const bpmView$ = useTimingView(host.bpm$, timingLocked, hostBpm);
  const msView$ = useTimingView(
    host.ms$,
    timingLocked,
    Math.min(2000, Math.max(10, 60000 / hostBpm)),
  );

  const onTap = useTapTempo(
    host.bpm$,
    () => host.beginEdit(paramIds.bpm),
    () => host.endEdit(paramIds.bpm),
    timingLocked,
  );

  // Echo diagram follows effective tempo (host when sync-locked).
  const chartBpm$ = useMemo(
    () => DynamicValue.fromConstant(host.bpm$.value),
    [host.bpm$],
  );
  useEffect(() => {
    if (timingLocked) {
      chartBpm$.set(hostBpm);
      return;
    }
    chartBpm$.set(host.bpm$.value);
    return host.bpm$.subscribe((v) => chartBpm$.set(v), false);
  }, [chartBpm$, host.bpm$, hostBpm, timingLocked]);

  return (
    <div className="DelayUI PluginUI">
      <Header title="Delay">
        <WithInfo title={delayInfo.active}>
          <Toggle state$={host.active$} icon="power" className="active" />
        </WithInfo>
      </Header>

      <div className="top block">
        <div className="title">Delays</div>
        <WithInfo title={delayInfo.mixMode} className="info-block">
          <Buttons
            entries={DELAY_MIX_MODE_ENTRIES}
            value={mixMode}
            onChange={(v) => {
              host.beginEdit(paramIds.mix_mode);
              host.mixMode$.set(v);
              host.endEdit(paramIds.mix_mode);
            }}
          />
        </WithInfo>
        <WithInfo title={delayInfo.subdiv}>
          <Knob
            label="Subdivide"
            className="subdiv"
            value$={host.subdiv$}
            min={1}
            max={16}
            snap={1}
            reset={delayParamDefault('subdiv')}
            dots={SUBDIV_DOTS}
            labels={SUBDIV_LABELS}
            scale="log2"
            log_factor={2}
            size="large"
            {...{ 'value.format': (v: number) => String(Math.round(v)) }}
            {...edit(paramIds.subdiv)}
          />
        </WithInfo>
        <WithInfo title={delayInfo.timeL}>
          <Knob
            label="Time L"
            value$={host.timeL$}
            min={1}
            max={16}
            snap={1}
            reset={delayParamDefault('time_l')}
            dots={TIME_DOTS}
            labels={TIME_LABELS}
            scale="log2"
            log_factor={2}
            {...{ 'value.format': (v: number) => String(Math.round(v)) }}
            {...edit(paramIds.time_l)}
          />
        </WithInfo>
        <WithInfo title={delayInfo.timeR}>
          <Knob
            label="Time R"
            value$={host.timeR$}
            min={1}
            max={16}
            snap={1}
            reset={delayParamDefault('time_r')}
            dots={TIME_DOTS}
            labels={TIME_LABELS}
            scale="log2"
            log_factor={2}
            className="warn"
            {...{ 'value.format': (v: number) => String(Math.round(v)) }}
            {...edit(paramIds.time_r)}
          />
        </WithInfo>
        <DelayEchoChart
          bpm$={chartBpm$}
          subdiv$={host.subdiv$}
          timeL$={host.timeL$}
          timeR$={host.timeR$}
          feedback$={host.feedback$}
          amount$={host.amount$}
          mixMode$={host.mixMode$}
          width$={host.width$}
        />
      </div>

      <div className="left block">
        <div className="title">Timing</div>
        <WithInfo title={delayInfo.sync}>
          <Toggle
            state$={host.sync$}
            label={hostValid ? `Host Sync ${Math.round(hostBpm)}` : 'Host Sync'}
            className="sync"
          />
        </WithInfo>
        <WithInfo title={delayInfo.tempo}>
          <Knob
            label="Tempo"
            value$={bpmView$}
            min={30}
            max={300}
            reset={delayParamDefault('bpm')}
            dots={BPM_DOTS}
            labels={BPM_LABELS}
            disabled={timingLocked}
            {...edit(paramIds.bpm)}
            className="bpm"
          />
        </WithInfo>
        <WithInfo title={delayInfo.beatMs}>
          <Knob
            label="Beat ms"
            value$={msView$}
            min={10}
            max={2000}
            reset={delayParamDefault('ms')}
            dots={MS_DOTS}
            labels={MS_LABELS}
            disabled={timingLocked}
            {...edit(paramIds.ms)}
            className="ms"
          />
        </WithInfo>
        <WithInfo title={delayInfo.tap}>
          <Button
            label="Tap Tempo"
            className={timingLocked ? 'disabled tap' : 'tap'}
            onClick={onTap}
            disabled={timingLocked}
          />
        </WithInfo>
      </div>

      <div className="center block">
        <div className="title">Mix</div>
        <WithInfo title={delayInfo.feedback}>
          <Knob
            label="Feedback"
            value$={host.feedback$}
            min={0}
            max={1}
            reset={delayParamDefault('feedback')}
            dots={FB_DOTS}
            labels={FB_LABELS}
            {...edit(paramIds.feedback)}
          />
        </WithInfo>
        <WithInfo title={delayInfo.width}>
          <Knob
            label="Stereo Width"
            value$={host.width$}
            min={-1}
            max={1}
            reset={delayParamDefault('width')}
            base={0}
            dots={WIDTH_DOTS}
            labels={WIDTH_LABELS}
            {...edit(paramIds.width)}
          />
        </WithInfo>
        <WithInfo title={delayInfo.dry}>
          <Knob
            label="Dry Level"
            value$={host.dry$}
            min={-60}
            max={12}
            reset={delayParamDefault('dry')}
            base={0}
            scale="decibel"
            log_factor={3}
            dots={MIX_DB_DOTS}
            labels={MIX_DB_LABELS}
            {...edit(paramIds.dry)}
          />
        </WithInfo>
        <WithInfo title={delayInfo.wet}>
          <Knob
            label="Wet Level"
            value$={host.amount$}
            min={-60}
            max={12}
            reset={delayParamDefault('amount')}
            base={0}
            scale="decibel"
            log_factor={3}
            dots={MIX_DB_DOTS}
            labels={MIX_DB_LABELS}
            {...edit(paramIds.amount)}
          />
        </WithInfo>
      </div>

      <div className="right block">
        <div className="title">Feedback Filter</div>
        <FrequencyRange
          title="Feedback Filter"
          hipass$={host.hipass$}
          lopass$={host.lopass$}
          hpMode$={host.hpMode$}
          lpMode$={host.lpMode$}
          hipassDefault={delayParamDefault('hipass')}
          lopassDefault={delayParamDefault('lopass')}
          hipassEdit={edit(paramIds.hipass)}
          lopassEdit={edit(paramIds.lopass)}
        />
      </div>
    </div>
  );
}
