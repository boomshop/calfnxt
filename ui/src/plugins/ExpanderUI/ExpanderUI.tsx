import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { Header } from '../../components';
import {
  Buttons,
  DynamicsChart,
  FrequencyRange,
  HistoryChart,
  Knob,
  LevelMeter,
  Toggle,
  WithInfo,
} from '../../widgets';
import { paramIds } from '../../generated/expanderModel';
import {
  EXPANDER_LINK_ENTRIES,
  EXPANDER_MODE_ENTRIES,
  expanderParamDefault,
  type IExpanderHost,
} from '../../host/expanderHost';
import '../PluginUI.scss';
import './ExpanderUI.scss';
import { expanderInfo } from './expanderInfo';

export interface ExpanderUIProps {
  host: IExpanderHost;
}

const RATIO_DOTS = [1, 2, 4, 8, 12, 20];
const RATIO_LABELS = RATIO_DOTS.map((n) => ({ pos: n, label: String(n) }));

const THRESH_DOTS = [-60, -48, -36, -24, -12, -6, 0];
const THRESH_LABELS = [
  { pos: -60, label: '−60' },
  { pos: -48, label: '−48' },
  { pos: -36, label: '−36' },
  { pos: -24, label: '−24' },
  { pos: -12, label: '−12' },
  { pos: -6, label: '−6' },
  { pos: 0, label: '0' },
];

const KNEE_DOTS = [0, 3, 6, 12, 18, 24];
const KNEE_LABELS = [
  { pos: 0, label: '0' },
  { pos: 6, label: '6' },
  { pos: 12, label: '12' },
  { pos: 18, label: '18' },
  { pos: 24, label: '24' },
];

const ATTACK_DOTS = [0.1, 1, 5, 10, 20, 50, 100, 250, 500];
const ATTACK_LABELS = [
  { pos: 0.1, label: '0.1' },
  { pos: 1, label: '1' },
  { pos: 10, label: '10' },
  { pos: 50, label: '50' },
  { pos: 100, label: '100' },
  { pos: 250, label: '250' },
  { pos: 500, label: '500' },
];

const HOLD_DOTS = [0, 10, 25, 50, 100, 200, 350, 500];
const HOLD_LABELS = [
  { pos: 0, label: '0' },
  { pos: 50, label: '50' },
  { pos: 100, label: '100' },
  { pos: 250, label: '250' },
  { pos: 500, label: '500' },
];

const RELEASE_DOTS = [1, 10, 50, 100, 200, 500, 1000, 2000];
const RELEASE_LABELS = [
  { pos: 1, label: '1' },
  { pos: 100, label: '100' },
  { pos: 200, label: '200' },
  { pos: 500, label: '500' },
  { pos: 1000, label: '1s' },
  { pos: 2000, label: '2s' },
];

const RANGE_DOTS = [-90, -60, -48, -36, -24, -12, 0];
const RANGE_LABELS = [
  { pos: -90, label: '−90' },
  { pos: -60, label: '−60' },
  { pos: -36, label: '−36' },
  { pos: -24, label: '−24' },
  { pos: -12, label: '−12' },
  { pos: 0, label: '0' },
];

export function ExpanderUI(props: ExpanderUIProps) {
  const { host } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });
  const mode = useDynamicValueReadonly(host.mode$, 0);
  const link = useDynamicValueReadonly(host.link$, 0);
  const openThresh = useDynamicValueReadonly(host.threshold$, -32);

  return (
    <div className="ExpanderUI PluginUI">
      <Header title="Expander">
        <WithInfo title={expanderInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
      </Header>

      <div className="history">
        <HistoryChart
          data$={host.historyData$}
          vizId="exp"
          graphs={[
            { className: 'hist-audio', mode: 'bottom' },
            { className: 'hist-audio-filtered', mode: 'bottom' },
            {
              className: 'hist-gr',
              mode: 'line',
              toFront: true,
              gradient: true,
            },
          ]}
        />
      </div>

      <div className="block detector">
        <div className="title">Detector</div>
        <FrequencyRange
          title="Sidechain"
          hipass$={host.hipass$}
          lopass$={host.lopass$}
          hpMode$={host.hpMode$}
          lpMode$={host.lpMode$}
          listen$={host.listen$}
          hipassDefault={expanderParamDefault('hipass')}
          lopassDefault={expanderParamDefault('lopass')}
          hipassEdit={edit(paramIds.hipass)}
          lopassEdit={edit(paramIds.lopass)}
        />
        <div className="selects">
          <WithInfo title={expanderInfo.mode} className="info-block">
            <Buttons
              entries={EXPANDER_MODE_ENTRIES}
              value={mode}
              onChange={(v) => {
                host.beginEdit(paramIds.mode);
                host.mode$.set(v);
                host.endEdit(paramIds.mode);
              }}
            />
          </WithInfo>
          <WithInfo title={expanderInfo.link} className="info-block">
            <Buttons
              entries={EXPANDER_LINK_ENTRIES}
              value={link}
              onChange={(v) => {
                host.beginEdit(paramIds.link);
                host.link$.set(v);
                host.endEdit(paramIds.link);
              }}
            />
          </WithInfo>
        </div>
      </div>

      <div className="block expander">
        <div className="title">Expander</div>

        <div className="upper">
          <WithInfo title={expanderInfo.threshold}>
            <Knob
              label="Thresh"
              value$={host.threshold$}
              min={-60}
              max={0}
              reset={expanderParamDefault('threshold')}
              base={0}
              dots={THRESH_DOTS}
              labels={THRESH_LABELS}
              {...edit(paramIds.threshold)}
              size="large"
              scale="decibel"
              log_factor={3}
            />
          </WithInfo>
          <WithInfo title={expanderInfo.ratio}>
            <Knob
              label="Ratio"
              value$={host.ratio$}
              min={1}
              max={20}
              reset={expanderParamDefault('ratio')}
              scale="log2"
              log_factor={4}
              dots={RATIO_DOTS}
              labels={RATIO_LABELS}
              {...{ 'value.format': (v: number) => `${v.toFixed(1)}:1` }}
              {...edit(paramIds.ratio)}
              size="large"
            />
          </WithInfo>
        </div>

        <div className="center">
          <WithInfo title={expanderInfo.attack}>
            <Knob
              label="Attack"
              value$={host.attack$}
              min={0.1}
              max={500}
              reset={expanderParamDefault('attack')}
              scale="log2"
              log_factor={4}
              dots={ATTACK_DOTS}
              labels={ATTACK_LABELS}
              size="small"
              {...{ 'value.format': (v: number) => `${v.toFixed(1)}` }}
              {...edit(paramIds.attack)}
            />
          </WithInfo>
          <WithInfo title={expanderInfo.hold}>
            <Knob
              label="Hold"
              value$={host.hold$}
              min={0}
              max={500}
              reset={expanderParamDefault('hold')}
              dots={HOLD_DOTS}
              labels={HOLD_LABELS}
              size="small"
              {...{ 'value.format': (v: number) => `${v.toFixed(0)}` }}
              {...edit(paramIds.hold)}
              scale="log2"
              log_factor={3}
            />
          </WithInfo>
          <WithInfo title={expanderInfo.release}>
            <Knob
              label="Release"
              value$={host.release$}
              min={1}
              max={2000}
              reset={expanderParamDefault('release')}
              scale="log2"
              log_factor={4}
              dots={RELEASE_DOTS}
              labels={RELEASE_LABELS}
              size="small"
              {...{ 'value.format': (v: number) => `${v.toFixed(0)}` }}
              {...edit(paramIds.release)}
            />
          </WithInfo>
        </div>
        <div className="lower">
          <WithInfo title={expanderInfo.knee}>
            <Knob
              label="Knee"
              value$={host.knee$}
              min={0}
              max={24}
              reset={expanderParamDefault('knee')}
              dots={KNEE_DOTS}
              labels={KNEE_LABELS}
              {...edit(paramIds.knee)}
              size="small"
            />
          </WithInfo>
          <WithInfo title={expanderInfo.relThreshActive}>
            <Toggle
              state$={host.relThreshActive$}
              icon="power"
              {...edit(paramIds.rel_thresh_active)}
            />
          </WithInfo>
          <WithInfo title={expanderInfo.releaseThreshold}>
            <Knob
              label="Rel Thresh"
              value$={host.releaseThreshold$}
              min={-60}
              max={openThresh}
              reset={expanderParamDefault('release_threshold')}
              base={0}
              dots={openThresh > -59.5 ? [-60, openThresh] : [-60]}
              labels={
                openThresh > -59.5
                  ? [
                      { pos: -60, label: '−60' },
                      {
                        pos: openThresh,
                        label:
                          Math.abs(openThresh) < 0.5
                            ? '0'
                            : `−${Math.abs(openThresh).toFixed(0)}`,
                      },
                    ]
                  : [{ pos: -60, label: '−60' }]
              }
              size="small"
              scale="decibel"
              log_factor={3}
              {...edit(paramIds.release_threshold)}
              enabled$={host.relThreshActive$}
            />
          </WithInfo>
          <WithInfo title={expanderInfo.range}>
            <Knob
              label="Range"
              value$={host.range$}
              min={-90}
              max={0}
              reset={expanderParamDefault('range')}
              base={0}
              dots={RANGE_DOTS}
              labels={RANGE_LABELS}
              size="small"
              scale="decibel"
              log_factor={3}
              {...edit(paramIds.range)}
            />
          </WithInfo>
        </div>
      </div>

      <div className="block chart">
        <div className="title">Transfer</div>
        <WithInfo title={expanderInfo.gr}>
          <LevelMeter
            className="gr"
            value$={host.gr$}
            min={0}
            max={60}
            base={0}
            reverse
            label="GR"
            show_scale
            falling={0}
            auto_hold={800}
            scale="log2"
            log_factor={5}
            levels={[1, 3, 6, 12]}
          />
        </WithInfo>
        <DynamicsChart
          type="expander"
          threshold$={host.threshold$}
          releaseThreshold$={host.releaseThreshold$}
          relThreshActive$={host.relThreshActive$}
          ratio$={host.ratio$}
          range$={host.range$}
          knee$={host.knee$}
          point$={host.point$}
          beginEdit={() => {
            host.beginEdit(paramIds.threshold);
            host.beginEdit(paramIds.ratio);
            host.beginEdit(paramIds.release_threshold);
          }}
          endEdit={() => {
            host.endEdit(paramIds.threshold);
            host.endEdit(paramIds.ratio);
            host.endEdit(paramIds.release_threshold);
          }}
        />
      </div>
    </div>
  );
}
