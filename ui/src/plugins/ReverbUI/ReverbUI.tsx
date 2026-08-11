import { useEffect, useMemo, useRef, useState } from 'react';
import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { DynamicValue } from '@deutschesoft/awml';
import { Header } from '../../components';
import {
  Buttons,
  FrequencyRange,
  Knob,
  ReverbChart,
  Toggle,
  WithInfo,
} from '../../widgets';
import { paramIds } from '../../generated/reverbModel';
import {
  REVERB_ER_MODE_ENTRIES,
  REVERB_PATH_MODE_ENTRIES,
  REVERB_PRESET_ENTRIES,
  REVERB_WIDTH_MODE_ENTRIES,
  reverbParamDefault,
  type IReverbHost,
} from '../../host/reverbHost';
import type { ReverbPresetId } from './reverbPresets';
import { reverbInfo } from './reverbInfo';
import '../PluginUI.scss';
import './ReverbUI.scss';

type ReverbPanelId =
  | 'filter'
  | 'early'
  | 'late'
  | 'width'
  | 'dynamics'
  | 'presets';

const REVERB_PANEL_ENTRIES: readonly { label: string; value: ReverbPanelId }[] =
  [
    { label: 'Feed Filter', value: 'filter' },
    { label: 'ER', value: 'early' },
    { label: 'Late', value: 'late' },
    { label: 'Width', value: 'width' },
    { label: 'Dynamics', value: 'dynamics' },
  ];

/** AUX Reverb chart uses decay in ms; host param is seconds. */
function useDecayMsBridge(
  decaySec$: DynamicValue<number>,
): DynamicValue<number> {
  const rtime$ = useMemo(
    () => DynamicValue.fromConstant(reverbParamDefault('decay') * 1000),
    [],
  );
  const guard = useRef(false);
  useEffect(() => {
    const u1 = decaySec$.subscribe((sec) => {
      if (guard.current) return;
      const ms = Math.min(15000, Math.max(400, sec * 1000));
      if (Math.abs(rtime$.value - ms) < 0.5) return;
      guard.current = true;
      rtime$.set(ms);
      guard.current = false;
    }, true);
    const u2 = rtime$.subscribe((ms) => {
      if (guard.current) return;
      const sec = Math.min(15, Math.max(0.4, ms / 1000));
      if (Math.abs(decaySec$.value - sec) < 0.0005) return;
      guard.current = true;
      decaySec$.set(sec);
      guard.current = false;
    }, false);
    return () => {
      u1();
      u2();
    };
  }, [decaySec$, rtime$]);
  return rtime$;
}

/** DSP late predelay = param + distance×40 ms; chart edits the effective value. */
function useEffectivePredelayBridge(
  predelay$: DynamicValue<number>,
  distance$: DynamicValue<number>,
): DynamicValue<number> {
  const chart$ = useMemo(
    () =>
      DynamicValue.fromConstant(
        reverbParamDefault('predelay') + reverbParamDefault('distance') * 40,
      ),
    [],
  );
  const guard = useRef(false);
  useEffect(() => {
    const syncOut = () => {
      if (guard.current) return;
      const ms = Math.min(
        540,
        Math.max(0, predelay$.value + distance$.value * 40),
      );
      if (Math.abs(chart$.value - ms) < 0.25) return;
      guard.current = true;
      chart$.set(ms);
      guard.current = false;
    };
    const u1 = predelay$.subscribe(syncOut, true);
    const u2 = distance$.subscribe(syncOut, false);
    const u3 = chart$.subscribe((ms) => {
      if (guard.current) return;
      const param = Math.min(500, Math.max(0, ms - distance$.value * 40));
      if (Math.abs(predelay$.value - param) < 0.25) return;
      guard.current = true;
      predelay$.set(param);
      guard.current = false;
    }, false);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [predelay$, distance$, chart$]);
  return chart$;
}

/** Chart attack (ms) mirrors PreDiff; AUX clamps attack ≤ predelay when drawing. */
function useDiffuseAttackBridge(
  diffuse$: DynamicValue<number>,
): DynamicValue<number> {
  const attack$ = useMemo(() => DynamicValue.fromConstant(0), []);
  useEffect(() => {
    return diffuse$.subscribe((d) => {
      const ms = Math.min(80, Math.max(0, d * 80));
      if (Math.abs(attack$.value - ms) < 0.25) return;
      attack$.set(ms);
    }, true);
  }, [diffuse$, attack$]);
  return attack$;
}

export interface ReverbUIProps {
  host: IReverbHost;
}

const ROOM_DOTS = [2, 6, 12, 20, 30, 40];
const ROOM_LABELS = ROOM_DOTS.map((n) => ({ pos: n, label: String(n) }));
const DECAY_DOTS = [0.4, 1, 2, 4, 8, 15];
const DECAY_LABELS = [
  { pos: 0.4, label: '.4' },
  { pos: 1, label: '1' },
  { pos: 2, label: '2' },
  { pos: 4, label: '4' },
  { pos: 8, label: '8' },
  { pos: 15, label: '15' },
];
const MS_DOTS = [0, 20, 50, 100, 250, 500];
const MS_LABELS = MS_DOTS.map((n) => ({ pos: n, label: String(n) }));
const UNIT_DOTS = [0, 0.25, 0.5, 0.75, 1];
const UNIT_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.25, label: '.25' },
  { pos: 0.5, label: '.5' },
  { pos: 0.75, label: '.75' },
  { pos: 1, label: '1' },
];
const WIDTH_DOTS = [0, 0.5, 1, 1.5, 2];
const WIDTH_LABELS = WIDTH_DOTS.map((n) => ({ pos: n, label: String(n) }));
const DB_DOTS = [-60, -36, -24, -12, -6, 0, 6, 12];
const DB_LABELS = [
  { pos: -60, label: '−60' },
  { pos: -48, label: '−48' },
  { pos: -36, label: '−36' },
  { pos: -24, label: '−24' },
  { pos: -12, label: '−12' },
  { pos: 0, label: '0' },
  { pos: 6, label: '+6' },
  { pos: 12, label: '+12' },
];
const HF_DOTS = [2000, 5000, 10000, 20000];
const HF_LABELS = [
  { pos: 2000, label: '2k' },
  { pos: 5000, label: '5k' },
  { pos: 10000, label: '10k' },
  { pos: 20000, label: '20k' },
];
const MOD_DOTS = [0.05, 0.2, 0.5, 1, 2, 5];
const MOD_LABELS = [
  { pos: 0.05, label: '.05' },
  { pos: 0.5, label: '.5' },
  { pos: 1, label: '1' },
  { pos: 5, label: '5' },
];
const GATE_THRESH_DOTS = [-60, -48, -36, -24, -12, -6, 0];
const GATE_THRESH_LABELS = [
  { pos: -60, label: '−60' },
  { pos: -48, label: '−48' },
  { pos: -36, label: '−36' },
  { pos: -24, label: '−24' },
  { pos: -12, label: '−12' },
  { pos: -6, label: '−6' },
  { pos: 0, label: '0' },
];
const GATE_HOLD_DOTS = [1, 10, 20, 50, 100, 250, 500];
const GATE_HOLD_LABELS = [
  { pos: 1, label: '1' },
  { pos: 20, label: '20' },
  { pos: 50, label: '50' },
  { pos: 100, label: '100' },
  { pos: 250, label: '250' },
  { pos: 500, label: '500' },
];
const GATE_RELEASE_DOTS = [5, 20, 50, 120, 200, 500, 1000, 2000];
const GATE_RELEASE_LABELS = [
  { pos: 5, label: '5' },
  { pos: 50, label: '50' },
  { pos: 120, label: '120' },
  { pos: 500, label: '500' },
  { pos: 1000, label: '1s' },
  { pos: 2000, label: '2s' },
];

export function ReverbUI({ host }: ReverbUIProps) {
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });

  const roomSize = useDynamicValueReadonly(
    host.roomSize$,
    reverbParamDefault('room_size'),
  );
  const distance = useDynamicValueReadonly(
    host.distance$,
    reverbParamDefault('distance'),
  );
  const decay = useDynamicValueReadonly(
    host.decay$,
    reverbParamDefault('decay'),
  );
  const erMode = useDynamicValueReadonly(
    host.erMode$,
    reverbParamDefault('er_mode'),
  );
  const pathMode = useDynamicValueReadonly(
    host.pathMode$,
    reverbParamDefault('path_mode'),
  );
  const widthMode = useDynamicValueReadonly(
    host.widthMode$,
    reverbParamDefault('width_mode'),
  );
  const rtime$ = useDecayMsBridge(host.decay$);
  const chartPredelay$ = useEffectivePredelayBridge(
    host.predelay$,
    host.distance$,
  );
  const chartAttack$ = useDiffuseAttackBridge(host.diffuse$);
  const [panel, setPanel] = useState<ReverbPanelId>('filter');

  const setMode = (dv: typeof host.erMode$, id: number, value: number) => {
    host.beginEdit(id);
    dv.set(value);
    host.endEdit(id);
  };

  return (
    <div className="PluginUI ReverbUI">
      <Header title="Reverb">
        <WithInfo title={reverbInfo.active}>
          <Toggle state$={host.active$} icon="power" className="active" />
        </WithInfo>
        <WithInfo title={reverbInfo.freeze}>
          <Toggle state$={host.freeze$} label="Freeze" />
        </WithInfo>
      </Header>

      <ReverbChart
        predelay$={chartPredelay$}
        attack$={chartAttack$}
        rlevel$={host.lateLevel$}
        rtime$={rtime$}
        erlevel$={host.erLevel$}
        roomSize={roomSize}
        distance={distance}
        erMode={erMode}
        decaySec={decay}
        beginEdit={() => {
          host.beginEdit(paramIds.predelay);
          host.beginEdit(paramIds.late_level);
          host.beginEdit(paramIds.decay);
          host.beginEdit(paramIds.er_level);
        }}
        endEdit={() => {
          host.endEdit(paramIds.predelay);
          host.endEdit(paramIds.late_level);
          host.endEdit(paramIds.decay);
          host.endEdit(paramIds.er_level);
        }}
      />

      <div className="block space">
        <div className="title">Space</div>

        <WithInfo title={reverbInfo.room}>
          <Knob
            label="Room (m)"
            value$={host.roomSize$}
            min={2}
            max={40}
            reset={reverbParamDefault('room_size')}
            dots={ROOM_DOTS}
            labels={ROOM_LABELS}
            {...edit(paramIds.room_size)}
            size="large"
            className="room"
          />
        </WithInfo>

        <WithInfo title={reverbInfo.distance}>
          <Knob
            label="Distance"
            value$={host.distance$}
            min={0}
            max={1}
            reset={reverbParamDefault('distance')}
            dots={UNIT_DOTS}
            labels={UNIT_LABELS}
            {...edit(paramIds.distance)}
            className="distance"
          />
        </WithInfo>

        <WithInfo title={reverbInfo.diffusion}>
          <Knob
            label="Diffusion"
            value$={host.diffusion$}
            min={0}
            max={1}
            reset={reverbParamDefault('diffusion')}
            dots={UNIT_DOTS}
            labels={UNIT_LABELS}
            {...edit(paramIds.diffusion)}
            className="diffusion"
          />
        </WithInfo>

        <WithInfo title={reverbInfo.predelay}>
          <Knob
            label="Predelay"
            value$={host.predelay$}
            min={0}
            max={500}
            unit="ms"
            reset={reverbParamDefault('predelay')}
            dots={MS_DOTS}
            labels={MS_LABELS}
            {...edit(paramIds.predelay)}
            className="predelay"
            scale="log2"
            log_factor={3}
          />
        </WithInfo>

        <WithInfo title={reverbInfo.preDiff}>
          <Knob
            label="Pre Diff"
            value$={host.diffuse$}
            min={0}
            max={1}
            reset={reverbParamDefault('diffuse')}
            dots={UNIT_DOTS}
            labels={UNIT_LABELS}
            {...edit(paramIds.diffuse)}
            className="prediff"
          />
        </WithInfo>

        <WithInfo title={reverbInfo.decay}>
          <Knob
            label="Decay (s)"
            value$={host.decay$}
            min={0.4}
            max={15}
            scale="log2"
            log_factor={4}
            reset={reverbParamDefault('decay')}
            dots={DECAY_DOTS}
            labels={DECAY_LABELS}
            {...edit(paramIds.decay)}
            size="large"
            className="decay"
          />
        </WithInfo>
      </div>

      <div className={`block panel panel-${panel}`}>
        <Buttons
          entries={REVERB_PANEL_ENTRIES}
          value={panel}
          onChange={setPanel}
          className="panel-nav"
        />
        <div className="panel-content">
          {panel === 'filter' ? (
            <FrequencyRange
              title="Feed into ER & Late"
              hipass$={host.hipass$}
              lopass$={host.lopass$}
              hpMode$={host.hpMode$}
              lpMode$={host.lpMode$}
              listen$={host.listen$}
              hipassDefault={reverbParamDefault('hipass')}
              lopassDefault={reverbParamDefault('lopass')}
              hipassEdit={edit(paramIds.hipass)}
              lopassEdit={edit(paramIds.lopass)}
            />
          ) : null}

          {panel === 'early' ? (
            <>
              <WithInfo title={reverbInfo.erMode} className="info-block">
                <Buttons
                  entries={REVERB_ER_MODE_ENTRIES}
                  value={erMode}
                  onChange={(v) =>
                    setMode(host.erMode$, paramIds.er_mode, v as number)
                  }
                />
              </WithInfo>
              <WithInfo title={reverbInfo.path} className="info-block">
                <Buttons
                  entries={REVERB_PATH_MODE_ENTRIES}
                  value={pathMode}
                  onChange={(v) =>
                    setMode(host.pathMode$, paramIds.path_mode, v as number)
                  }
                />
              </WithInfo>
              <WithInfo title={reverbInfo.erLevel}>
                <Knob
                  label="Volume"
                  value$={host.erLevel$}
                  min={-60}
                  max={12}
                  unit="dB"
                  reset={reverbParamDefault('er_level')}
                  {...edit(paramIds.er_level)}
                  size="large"
                  className="volume"
                  dots={DB_DOTS}
                  labels={DB_LABELS}
                  scale="decibel"
                  log_factor={2}
                />
              </WithInfo>
            </>
          ) : null}

          {panel === 'late' ? (
            <>
              <WithInfo title={reverbInfo.lateLevel}>
                <Knob
                  label="Volume"
                  value$={host.lateLevel$}
                  min={-60}
                  max={12}
                  unit="dB"
                  reset={reverbParamDefault('late_level')}
                  {...edit(paramIds.late_level)}
                  dots={DB_DOTS}
                  labels={DB_LABELS}
                  scale="decibel"
                  log_factor={2}
                />
              </WithInfo>
              <WithInfo title={reverbInfo.air}>
                <Knob
                  label="Air"
                  value$={host.air$}
                  min={0}
                  max={1}
                  reset={reverbParamDefault('air')}
                  dots={UNIT_DOTS}
                  labels={UNIT_LABELS}
                  {...edit(paramIds.air)}
                />
              </WithInfo>
              <WithInfo title={reverbInfo.hfDamp}>
                <Knob
                  label="HF Damp"
                  value$={host.hfDamp$}
                  min={2000}
                  max={20000}
                  scale="log2"
                  log_factor={4}
                  unit="Hz"
                  reset={reverbParamDefault('hf_damp')}
                  dots={HF_DOTS}
                  labels={HF_LABELS}
                  {...edit(paramIds.hf_damp)}
                />
              </WithInfo>
              <WithInfo title={reverbInfo.modRate}>
                <Knob
                  label="Mod Rate"
                  value$={host.modRate$}
                  min={0.05}
                  max={5}
                  scale="log2"
                  log_factor={4}
                  unit="Hz"
                  reset={reverbParamDefault('mod_rate')}
                  dots={MOD_DOTS}
                  labels={MOD_LABELS}
                  {...edit(paramIds.mod_rate)}
                />
              </WithInfo>
              <WithInfo title={reverbInfo.lfDamp}>
                <Knob
                  label="LF Damp"
                  value$={host.lfDamp$}
                  min={0}
                  max={1}
                  reset={reverbParamDefault('lf_damp')}
                  dots={UNIT_DOTS}
                  labels={UNIT_LABELS}
                  {...edit(paramIds.lf_damp)}
                />
              </WithInfo>
              <WithInfo title={reverbInfo.modDepth}>
                <Knob
                  label="Mod Depth"
                  value$={host.modDepth$}
                  min={0}
                  max={1}
                  reset={reverbParamDefault('mod_depth')}
                  dots={UNIT_DOTS}
                  labels={UNIT_LABELS}
                  {...edit(paramIds.mod_depth)}
                />
              </WithInfo>
            </>
          ) : null}

          {panel === 'width' ? (
            <>
              <WithInfo title={reverbInfo.widthMode} className="info-block">
                <Buttons
                  entries={REVERB_WIDTH_MODE_ENTRIES}
                  value={widthMode}
                  onChange={(v) =>
                    setMode(host.widthMode$, paramIds.width_mode, v as number)
                  }
                />
              </WithInfo>
              <WithInfo title={reverbInfo.width}>
                <Knob
                  label="Width"
                  value$={host.width$}
                  min={0}
                  max={2}
                  reset={reverbParamDefault('width')}
                  dots={WIDTH_DOTS}
                  labels={WIDTH_LABELS}
                  {...edit(paramIds.width)}
                  size="large"
                  base={1}
                />
              </WithInfo>
            </>
          ) : null}

          {panel === 'dynamics' ? (
            <>
              <WithInfo title={reverbInfo.duck}>
                <Knob
                  label="Duck"
                  value$={host.duck$}
                  min={0}
                  max={1}
                  reset={reverbParamDefault('duck')}
                  dots={UNIT_DOTS}
                  labels={UNIT_LABELS}
                  {...edit(paramIds.duck)}
                  className="duck"
                  size="large"
                />
              </WithInfo>
              <WithInfo title={reverbInfo.gate}>
                <Toggle state$={host.gate$} label="Gated" className="gate" />
              </WithInfo>
              <WithInfo title={reverbInfo.gateHold}>
                <Knob
                  label="Hold"
                  value$={host.gateHold$}
                  min={1}
                  max={500}
                  scale="log2"
                  log_factor={4}
                  unit="ms"
                  reset={reverbParamDefault('gate_hold')}
                  dots={GATE_HOLD_DOTS}
                  labels={GATE_HOLD_LABELS}
                  {...edit(paramIds.gate_hold)}
                  enabled$={host.gate$}
                />
              </WithInfo>
              <WithInfo title={reverbInfo.gateThresh}>
                <Knob
                  label="Thresh"
                  value$={host.gateThreshold$}
                  min={-60}
                  max={0}
                  unit="dB"
                  reset={reverbParamDefault('gate_threshold')}
                  base={0}
                  scale="decibel"
                  log_factor={3}
                  dots={GATE_THRESH_DOTS}
                  labels={GATE_THRESH_LABELS}
                  {...edit(paramIds.gate_threshold)}
                  enabled$={host.gate$}
                />
              </WithInfo>
              <WithInfo title={reverbInfo.gateRelease}>
                <Knob
                  label="Release"
                  value$={host.gateRelease$}
                  min={5}
                  max={2000}
                  scale="log2"
                  log_factor={4}
                  unit="ms"
                  reset={reverbParamDefault('gate_release')}
                  dots={GATE_RELEASE_DOTS}
                  labels={GATE_RELEASE_LABELS}
                  {...edit(paramIds.gate_release)}
                  enabled$={host.gate$}
                />
              </WithInfo>
            </>
          ) : null}
        </div>
      </div>

      <div className="block mix">
        <div className="title">Mix</div>
        <WithInfo title={reverbInfo.dry}>
          <Knob
            label="Dry"
            value$={host.dry$}
            min={-60}
            max={12}
            unit="dB"
            reset={reverbParamDefault('dry')}
            dots={DB_DOTS}
            labels={DB_LABELS}
            {...edit(paramIds.dry)}
            scale="decibel"
            log_factor={2}
            base={0}
          />
        </WithInfo>
        <WithInfo title={reverbInfo.wet}>
          <Knob
            label="Wet"
            value$={host.amount$}
            min={-60}
            max={12}
            unit="dB"
            reset={reverbParamDefault('amount')}
            dots={DB_DOTS}
            labels={DB_LABELS}
            {...edit(paramIds.amount)}
            scale="decibel"
            log_factor={2}
            base={0}
          />
        </WithInfo>
      </div>

      <Buttons
        entries={REVERB_PRESET_ENTRIES}
        value={'' as ReverbPresetId}
        onChange={(id) => host.applyPreset(id as ReverbPresetId)}
        className="presets"
      />
    </div>
  );
}
