import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { Header } from '../../components';
import {
  Buttons,
  HistoryChart,
  Knob,
  LevelMeter,
  Toggle,
  WithInfo,
} from '../../widgets';
import { paramIds } from '../../generated/limiterModel';
import {
  LIMITER_CURVE_ENTRIES,
  limiterParamDefault,
  type ILimiterHost,
} from '../../host/limiterHost';
import '../PluginUI.scss';
import './LimiterUI.scss';
import { limiterInfo } from './limiterInfo';

export interface LimiterUIProps {
  host: ILimiterHost;
}

const LIMIT_DOTS = [-24, -18, -12, -6, -3, 0];
const LIMIT_LABELS = [
  { pos: -24, label: '−24' },
  { pos: -18, label: '−18' },
  { pos: -12, label: '−12' },
  { pos: -6, label: '−6' },
  { pos: -3, label: '−3' },
  { pos: 0, label: '0' },
];

const LOOK_DOTS = [0.1, 0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const LOOK_LABELS = [
  { pos: 0.1, label: '0.1' },
  { pos: 1, label: '1' },
  { pos: 2, label: '2' },
  { pos: 3, label: '3' },
  { pos: 4, label: '4' },
  { pos: 5, label: '5' },
  { pos: 7, label: '7' },
  { pos: 10, label: '10' },
];

const RELEASE_DOTS = [1, 10, 50, 100, 250, 500, 1000];
const RELEASE_LABELS = [
  { pos: 1, label: '1' },
  { pos: 10, label: '10' },
  { pos: 50, label: '50' },
  { pos: 100, label: '100' },
  { pos: 250, label: '250' },
  { pos: 500, label: '500' },
  { pos: 1000, label: '1s' },
];

const OS_DOTS = [1, 2, 3, 4];
const OS_LABELS = OS_DOTS.map((n) => ({ pos: n, label: `${n}×` }));

const ASC_DOTS = [0, 0.25, 0.5, 0.75, 1];
const ASC_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.5, label: '0.5' },
  { pos: 1, label: '1' },
];

const KNEE_DOTS = [0, 3, 6, 9, 12];
const KNEE_LABELS = KNEE_DOTS.map((n) => ({ pos: n, label: String(n) }));

const HOLD_DOTS = [0, 10, 25, 50, 100, 250, 500];
const HOLD_LABELS = [
  { pos: 0, label: '0' },
  { pos: 10, label: '10' },
  { pos: 25, label: '25' },
  { pos: 50, label: '50' },
  { pos: 100, label: '100' },
  { pos: 250, label: '250' },
  { pos: 500, label: '500' },
];

const UNIT_DOTS = [0, 0.25, 0.5, 0.75, 1];
const UNIT_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.5, label: '0.5' },
  { pos: 1, label: '1' },
];

const MARGIN_DOTS = [0, 0.1, 0.5, 1, 2, 3];
const MARGIN_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.1, label: '0.1' },
  { pos: 0.5, label: '0.5' },
  { pos: 1, label: '1' },
  { pos: 2, label: '2' },
  { pos: 3, label: '3' },
];

export function LimiterUI(props: LimiterUIProps) {
  const { host } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });
  const curve = useDynamicValueReadonly(host.curve$, 0);

  return (
    <div className="LimiterUI PluginUI">
      <Header title="Limiter">
        <WithInfo title={limiterInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
        <WithInfo title={limiterInfo.diffListen}>
          <Toggle
            state$={host.diffListen$}
            icon="headphones"
            className="warn"
          />
        </WithInfo>
      </Header>

      <HistoryChart
        data$={host.historyData$}
        vizId="limiter"
        graphs={[
          { className: 'hist-audio-filtered', mode: 'bottom' },
          {
            className: 'hist-gr',
            mode: 'line',
            toFront: true,
            gradient: true,
          },
        ]}
        className="history"
      />

      <div className="main">
        <div className="block limit">
          <div className="title">Limit</div>

          <div className="top">
            <WithInfo title={limiterInfo.oversampling}>
              <Knob
                label="Oversampling"
                value$={host.oversampling$}
                min={1}
                max={4}
                snap={1}
                reset={limiterParamDefault('oversampling')}
                dots={OS_DOTS}
                labels={OS_LABELS}
                {...{ 'value.format': (v: number) => `${Math.round(v)}×` }}
                {...edit(paramIds.oversampling)}
                start={225}
                angle={90}
              />
            </WithInfo>

            <WithInfo title={limiterInfo.attack}>
              <Knob
                label="Look"
                value$={host.attack$}
                min={0.1}
                max={10}
                reset={limiterParamDefault('attack')}
                dots={LOOK_DOTS}
                labels={LOOK_LABELS}
                {...{ 'value.format': (v: number) => `${v.toFixed(2)} ms` }}
                {...edit(paramIds.attack)}
                scale="log2"
                log_factor={2}
              />
            </WithInfo>

            <WithInfo title={limiterInfo.limit}>
              <Knob
                label="Limit"
                size="large"
                value$={host.limit$}
                min={-24}
                max={0}
                reset={limiterParamDefault('limit')}
                dots={LIMIT_DOTS}
                labels={LIMIT_LABELS}
                {...{ 'value.format': (v: number) => `${v.toFixed(1)} dB` }}
                {...edit(paramIds.limit)}
              />
            </WithInfo>

            <WithInfo title={limiterInfo.release}>
              <Knob
                label="Release"
                value$={host.release$}
                min={1}
                max={1000}
                reset={limiterParamDefault('release')}
                dots={RELEASE_DOTS}
                labels={RELEASE_LABELS}
                {...{
                  'value.format': (v: number) =>
                    v >= 1000 ? '1 s' : `${Math.round(v)} ms`,
                }}
                {...edit(paramIds.release)}
                scale="log2"
                log_factor={5}
              />
            </WithInfo>

            <WithInfo title={limiterInfo.knee}>
              <Knob
                label="Knee"
                value$={host.knee$}
                min={0}
                max={12}
                reset={limiterParamDefault('knee')}
                dots={KNEE_DOTS}
                labels={KNEE_LABELS}
                {...{ 'value.format': (v: number) => `${v.toFixed(1)} dB` }}
                {...edit(paramIds.knee)}
                className="knee"
              />
            </WithInfo>
          </div>

          <div className="bottom">
            <WithInfo title={limiterInfo.autoLevel}>
              <Toggle state$={host.autoLevel$} label="Auto Level" />
            </WithInfo>

            <div className="feat-group">
              <WithInfo title={limiterInfo.asc}>
                <Toggle state$={host.asc$} label="ASC" />
              </WithInfo>
              <WithInfo title={limiterInfo.ascCoeff}>
                <Knob
                  label="Level"
                  size="small"
                  value$={host.ascCoeff$}
                  enabled$={host.asc$}
                  min={0}
                  max={1}
                  reset={limiterParamDefault('asc_coeff')}
                  dots={ASC_DOTS}
                  labels={ASC_LABELS}
                  {...{ 'value.format': (v: number) => v.toFixed(2) }}
                  {...edit(paramIds.asc_coeff)}
                />
              </WithInfo>
            </div>

            <WithInfo title={limiterInfo.curve} className="info-block">
              <Buttons
                entries={LIMITER_CURVE_ENTRIES}
                value={curve}
                onChange={(v) => {
                  host.beginEdit(paramIds.curve);
                  host.curve$.set(v);
                  host.endEdit(paramIds.curve);
                }}
              />
            </WithInfo>
          </div>
        </div>

        <div className="block meter">
          <div className="title">Attenuation</div>
          <WithInfo title={limiterInfo.gr}>
            <LevelMeter
              className="gr"
              value$={host.gr$}
              min={0}
              max={24}
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
        </div>

        <div className="block character">
          <div className="title">Character</div>

          <div className="feat-group">
            <WithInfo title={limiterInfo.colorEnable}>
              <Toggle state$={host.colorEnable$} label="Color" />
            </WithInfo>
            <WithInfo title={limiterInfo.color}>
              <Knob
                label="Amount"
                size="medium"
                value$={host.color$}
                enabled$={host.colorEnable$}
                min={0}
                max={1}
                reset={limiterParamDefault('color')}
                dots={UNIT_DOTS}
                labels={UNIT_LABELS}
                {...{
                  'value.format': (v: number) => `${Math.round(v * 100)} %`,
                }}
                {...edit(paramIds.color)}
              />
            </WithInfo>
          </div>

          <div className="feat-group">
            <WithInfo title={limiterInfo.truePeak}>
              <Toggle state$={host.truePeak$} label="True Peak" />
            </WithInfo>
            <WithInfo title={limiterInfo.margin}>
              <Knob
                label="Margin"
                size="medium"
                value$={host.margin$}
                enabled$={host.truePeak$}
                min={0}
                max={3}
                reset={limiterParamDefault('margin')}
                dots={MARGIN_DOTS}
                labels={MARGIN_LABELS}
                {...{ 'value.format': (v: number) => `${v.toFixed(2)} dB` }}
                {...edit(paramIds.margin)}
                scale="log2"
                log_factor={3}
              />
            </WithInfo>
          </div>

          <div className="feat-group">
            <WithInfo title={limiterInfo.holdEnable}>
              <Toggle state$={host.holdEnable$} label="Hold" />
            </WithInfo>
            <WithInfo title={limiterInfo.releaseHold}>
              <Knob
                label="Time"
                size="medium"
                value$={host.releaseHold$}
                enabled$={host.holdEnable$}
                min={0}
                max={500}
                reset={limiterParamDefault('release_hold')}
                dots={HOLD_DOTS}
                labels={HOLD_LABELS}
                {...{ 'value.format': (v: number) => `${Math.round(v)} ms` }}
                {...edit(paramIds.release_hold)}
                scale="log2"
                log_factor={5}
              />
            </WithInfo>
          </div>

          <div className="feat-group">
            <WithInfo title={limiterInfo.emphasisEnable}>
              <Toggle state$={host.emphasisEnable$} label="Emphasis" />
            </WithInfo>
            <WithInfo title={limiterInfo.emphasis}>
              <Knob
                label="Amount"
                size="medium"
                value$={host.emphasis$}
                enabled$={host.emphasisEnable$}
                min={0}
                max={1}
                reset={limiterParamDefault('emphasis')}
                dots={UNIT_DOTS}
                labels={UNIT_LABELS}
                {...{
                  'value.format': (v: number) => `${Math.round(v * 100)} %`,
                }}
                {...edit(paramIds.emphasis)}
              />
            </WithInfo>
          </div>
        </div>
      </div>
    </div>
  );
}
