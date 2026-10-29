import { useEffect, useMemo } from 'react';
import { useDynamicValue } from '@deutschesoft/use-aux-widgets';
import { Header } from '../../components';
import { createHeaderIo } from '../../host/headerMeters';
import {
  AlignWaveStrip,
  Button,
  CorrelationMeter,
  FrequencyRange,
  FREQUENCY_RANGE_LR_MODE_ENTRIES,
  Knob,
  Toggle,
  WithInfo,
} from '../../widgets';
import { paramIds } from '../../generated/alignerModel';
import {
  ALIGNER_LANES,
  alignerParamDefault,
  type IAlignerHost,
} from '../../host/alignerHost';
import { alignerInfo } from './alignerInfo';
import '../PluginUI.scss';
import './AlignerUI.scss';

export interface AlignerUIProps {
  host: IAlignerHost;
}

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
const TRIM_DOTS = [-50, -40, -30, -20, -10, 0, 10, 20, 30, 40, 50];
const TRIM_LABELS = [
  { pos: -50, label: '−50' },
  { pos: -40, label: '−40' },
  { pos: -30, label: '−30' },
  { pos: -20, label: '−20' },
  { pos: -10, label: '−10' },
  { pos: 0, label: '0' },
  { pos: 10, label: '10' },
  { pos: 20, label: '20' },
  { pos: 30, label: '30' },
  { pos: 40, label: '40' },
  { pos: 50, label: '50' },
];
const PAN_DOTS = [-1, 0, 1];
const PAN_LABELS = [
  { pos: -1, label: 'L' },
  { pos: 0, label: 'C' },
  { pos: 1, label: 'R' },
];
const LANE_DELAY_DOTS = TRIM_DOTS;
const LANE_DELAY_LABELS = TRIM_LABELS;

function laneParamId(lane: number, key: string): number {
  const n = String(lane + 1).padStart(2, '0');
  return (paramIds as Record<string, number>)[`b${n}_${key}`] ?? 0;
}

function laneKeyName(i: number, suffix: string): keyof typeof paramIds {
  const n = String(i + 1).padStart(2, '0');
  return `b${n}_${suffix}` as keyof typeof paramIds;
}

function joinClassName(index: number, joinOn: boolean[]): string {
  const up = index > 0 && joinOn[index];
  const down = index + 1 < ALIGNER_LANES && joinOn[index + 1];
  if (up && down) return 'joined';
  if (up) return 'joined-up';
  if (down) return 'joined-down';
  return '';
}

export function AlignerUI(props: AlignerUIProps) {
  const { host } = props;
  const headerIo = useMemo(() => createHeaderIo({ input: 8, output: 2 }), []);
  useEffect(() => () => headerIo.dispose(), [headerIo]);
  // Host is owned by BoundAlignerUI / StudioPlugin — do not dispose here
  // (React StrictMode remount would unbind viz while the host instance lives on).

  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });

  const [anchor] = useDynamicValue(host.anchor$, 0);
  const [maxLag] = useDynamicValue(host.maxLag$, 0);
  const [latencyMs] = useDynamicValue(host.latencyMs$, 0);

  const [j1] = useDynamicValue(host.lanes[1]!.join$, false);
  const [j2] = useDynamicValue(host.lanes[2]!.join$, false);
  const [j3] = useDynamicValue(host.lanes[3]!.join$, false);
  const [j4] = useDynamicValue(host.lanes[4]!.join$, false);
  const [j5] = useDynamicValue(host.lanes[5]!.join$, false);
  const [j6] = useDynamicValue(host.lanes[6]!.join$, false);
  const [j7] = useDynamicValue(host.lanes[7]!.join$, false);
  const joinOn = [false, j1, j2, j3, j4, j5, j6, j7];

  return (
    <div className="AlignerUI PluginUI">
      <Header title="Aligner" io={headerIo}>
        <WithInfo title={alignerInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
        <WithInfo title={alignerInfo.waveSpan}>
          <Knob
            value$={host.waveSpan$}
            label="Wave"
            min={24}
            max={240}
            unit="ms"
            reset={alignerParamDefault('wave_span')}
            size="tiny"
            scale="log2"
            log_factor={5}
            {...edit(paramIds.wave_span)}
          />
        </WithInfo>
      </Header>

      <div className="lanes">
        {Array.from({ length: ALIGNER_LANES }, (_, i) => (
          <LaneRow
            key={i}
            index={i}
            host={host}
            anchor={Math.round(anchor)}
            isAnchor={Math.round(anchor) === i}
            joinClass={joinClassName(i, joinOn)}
            joined={i > 0 && joinOn[i]!}
            edit={edit}
          />
        ))}
      </div>

      <div className="block analyze">
        <div className="title">Analyze</div>
        <WithInfo title={alignerInfo.analysis} className="info-block">
          <FrequencyRange
            hipass$={host.analysisHp$}
            lopass$={host.analysisLp$}
            hpMode$={host.analysisHpMode$}
            lpMode$={host.analysisLpMode$}
            modeEntries={FREQUENCY_RANGE_LR_MODE_ENTRIES}
            hipassDefault={alignerParamDefault('analysis_hp')}
            lopassDefault={alignerParamDefault('analysis_lp')}
            hipassEdit={edit(paramIds.analysis_hp)}
            lopassEdit={edit(paramIds.analysis_lp)}
          />
        </WithInfo>
        <div className="filter-targets">
          <WithInfo title={alignerInfo.filterHit}>
            <Toggle
              state$={host.filterHit$}
              label="Hit"
              {...edit(paramIds.filter_hit)}
            />
          </WithInfo>
          <WithInfo title={alignerInfo.filterWaves}>
            <Toggle
              state$={host.filterWaves$}
              label="Waves"
              {...edit(paramIds.filter_waves)}
            />
          </WithInfo>
          <WithInfo title={alignerInfo.filterCorr}>
            <Toggle
              state$={host.filterCorr$}
              label="Corr"
              {...edit(paramIds.filter_corr)}
            />
          </WithInfo>
        </div>
      </div>

      <div className="block master">
        <div className="title">
          Master
          {maxLag > 0.005 ? ` · lanes max ${maxLag.toFixed(2)} ms` : ''}
          {latencyMs > 0.005 ? ` · latency ${latencyMs.toFixed(2)} ms` : ''}
        </div>
        <WithInfo title={alignerInfo.masterWave} className="master-waves">
          <div className="master-wave-row">
            <span className="master-wave-label">L</span>
            <AlignWaveStrip
              className="master-wave"
              wave$={host.wave$}
              mode="master"
              channel={0}
            />
          </div>
          <div className="master-wave-row">
            <span className="master-wave-label">R</span>
            <AlignWaveStrip
              className="master-wave"
              wave$={host.wave$}
              mode="master"
              channel={1}
            />
          </div>
        </WithInfo>
        <div className="master-row">
          <WithInfo title={alignerInfo.masterTrim}>
            <Knob
              value$={host.masterTrim$}
              label="Delay"
              min={-50}
              max={50}
              base={0}
              unit="ms"
              dots={TRIM_DOTS}
              labels={TRIM_LABELS}
              reset={0}
              size="large"
              {...edit(paramIds.master_trim)}
            />
          </WithInfo>
          <WithInfo title={alignerInfo.masterVolume}>
            <Knob
              value$={host.masterVolume$}
              label="Volume"
              min={-60}
              max={12}
              unit="dB"
              dots={DB_DOTS}
              labels={DB_LABELS}
              reset={0}
              scale="decibel"
              log_factor={3}
              base={0}
              size="large"
              {...edit(paramIds.master_volume)}
            />
          </WithInfo>
        </div>
      </div>
    </div>
  );
}

function LaneRow(props: {
  index: number;
  host: IAlignerHost;
  anchor: number;
  isAnchor: boolean;
  joinClass: string;
  joined: boolean;
  edit: (id: number) => { beginEdit: () => void; endEdit: () => void };
}) {
  const { index: i, host, anchor, isAnchor, joinClass, joined, edit } = props;
  const lane = host.lanes[i]!;
  const blockClass = ['lane', 'block', joinClass].filter(Boolean).join(' ');

  return (
    <div className={blockClass}>
      {i > 0 ? (
        <WithInfo title={alignerInfo.join} className="join">
          <Toggle
            state$={lane.join$}
            icon="mono"
            icon_active="stereo"
            {...edit(laneParamId(i, 'join'))}
          />
        </WithInfo>
      ) : null}
      <WithInfo title={alignerInfo.anchor} className="anchor">
        <Button
          onClick={() => host.anchor$.set(i)}
          label={i + 1 + ''}
          state={isAnchor}
          className="warn"
          icon={isAnchor ? 'sine' : 'blank'}
        />
      </WithInfo>

      <div className="lane-toggles">
        <WithInfo title={alignerInfo.mute}>
          <Toggle
            state$={lane.mute$}
            label="M"
            {...edit(laneParamId(i, 'mute'))}
          />
        </WithInfo>
        <WithInfo title={alignerInfo.solo}>
          <Toggle
            state$={lane.solo$}
            label="S"
            className="warn"
            {...edit(laneParamId(i, 'solo'))}
          />
        </WithInfo>
      </div>

      <div className="lane-mid">
        <WithInfo title={alignerInfo.wave} className="wave">
          <AlignWaveStrip wave$={host.wave$} lane={i} anchor={anchor} />
        </WithInfo>
        <WithInfo title={alignerInfo.corr} className="meter">
          {/* show_scale must stay on — PhaseMeter.draw assumes this.scale exists. */}
          <CorrelationMeter value$={lane.corr$} />
        </WithInfo>
      </div>

      <div className="lane-right">
        <WithInfo title={alignerInfo.phase}>
          <Toggle
            state$={lane.phase$}
            icon="phase"
            {...edit(laneParamId(i, 'phase'))}
          />
        </WithInfo>
        <WithInfo title={alignerInfo.delay}>
          <Knob
            value$={lane.delay$}
            label={joined ? 'Rel' : 'Dly Trm'}
            min={-50}
            max={50}
            base={0}
            unit="ms"
            dots={LANE_DELAY_DOTS}
            labels={LANE_DELAY_LABELS}
            reset={0}
            size="small"
            {...edit(laneParamId(i, 'delay'))}
          />
        </WithInfo>
        <WithInfo title={alignerInfo.pan}>
          <Knob
            value$={lane.pan$}
            label="Pan"
            min={-1}
            max={1}
            reset={0}
            base={0}
            dots={PAN_DOTS}
            labels={PAN_LABELS}
            size="small"
            {...edit(laneParamId(i, 'pan'))}
          />
        </WithInfo>
        <WithInfo title={alignerInfo.gain}>
          <Knob
            value$={lane.gain$}
            label="Gain"
            min={-60}
            max={12}
            unit="dB"
            dots={DB_DOTS}
            labels={DB_LABELS}
            reset={alignerParamDefault(laneKeyName(i, 'gain'))}
            scale="decibel"
            log_factor={3}
            base={0}
            size="small"
            {...edit(laneParamId(i, 'gain'))}
          />
        </WithInfo>
      </div>
    </div>
  );
}
