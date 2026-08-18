import { Header } from '../../components';
import { Button, Knob, ModulationChart, Toggle, WithInfo } from '../../widgets';
import { paramIds } from '../../generated/flangerModel';
import { flangerParamDefault, type IFlangerHost } from '../../host/flangerHost';
import { flangerInfo } from './flangerInfo';
import '../PluginUI.scss';
import './FlangerUI.scss';

export interface FlangerUIProps {
  host: IFlangerHost;
}

const DELAY_DOTS = [0.1, 0.2, 0.5, 1, 2, 5, 10];
const DELAY_LABELS = [
  { pos: 0.1, label: '0.1' },
  { pos: 0.5, label: '0.5' },
  { pos: 1, label: '1' },
  { pos: 2, label: '2' },
  { pos: 5, label: '5' },
  { pos: 10, label: '10' },
];

const RATE_DOTS = [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 20];
const RATE_LABELS = [
  { pos: 0.01, label: '0.01' },
  { pos: 0.05, label: '0.05' },
  { pos: 0.1, label: '0.1' },
  { pos: 0.5, label: '0.5' },
  { pos: 1, label: '1' },
  { pos: 2, label: '2' },
  { pos: 5, label: '5' },
  { pos: 10, label: '10' },
  { pos: 20, label: '20' },
];

const FB_DOTS = [-0.99, -0.5, 0, 0.5, 0.99];
const FB_LABELS = [
  { pos: -0.99, label: '−1' },
  { pos: -0.5, label: '−0.5' },
  { pos: 0, label: '0' },
  { pos: 0.5, label: '0.5' },
  { pos: 0.99, label: '+1' },
];

const STEREO_DOTS = [0, 90, 180, 270, 360];
const STEREO_LABELS = [
  { pos: 0, label: '0' },
  { pos: 90, label: '90' },
  { pos: 180, label: '180' },
  { pos: 270, label: '270' },
  { pos: 360, label: '360' },
];

const MIX_DB_DOTS = [-60, -48, -36, -24, -12, -6, 0, 6, 12];
const MIX_DB_LABELS = [
  { pos: -60, label: '−60' },
  { pos: -36, label: '−36' },
  { pos: -24, label: '−24' },
  { pos: -12, label: '−12' },
  { pos: -6, label: '−6' },
  { pos: 0, label: '0' },
  { pos: 6, label: '+6' },
  { pos: 12, label: '+12' },
];

export function FlangerUI(props: FlangerUIProps) {
  const { host } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });

  return (
    <div className="FlangerUI PluginUI">
      <Header title="Flanger">
        <WithInfo title={flangerInfo.active}>
          <Toggle state$={host.active$} icon="power" className="active" />
        </WithInfo>
      </Header>

      <div className="block rate">
        <div className="title">Rate</div>
        <WithInfo title={flangerInfo.modRate}>
          <Knob
            label="Mod Rate"
            value$={host.modRate$}
            min={0.01}
            max={20}
            reset={flangerParamDefault('mod_rate')}
            scale="frequency"
            log_factor={4}
            dots={RATE_DOTS}
            labels={RATE_LABELS}
            size="large"
            {...edit(paramIds.mod_rate)}
          />
        </WithInfo>
      </div>

      <div className="block lfo">
        <div className="title">LFO</div>
        <WithInfo title={flangerInfo.lfo}>
          <Toggle state$={host.lfo$} icon="play" />
        </WithInfo>
      </div>

      <div className="block chart">
        <div className="title">Peaks &amp; Notches</div>
        <ModulationChart data$={host.response$} mode="comb" dbMin={-36} dbMax={24} />
      </div>

      <div className="block stereo">
        <div className="title">Stereo</div>
        <WithInfo title={flangerInfo.stereo}>
          <Knob
            label="Stereo Phase"
            value$={host.stereo$}
            min={0}
            max={360}
            reset={flangerParamDefault('stereo')}
            dots={STEREO_DOTS}
            labels={STEREO_LABELS}
            size="large"
            {...edit(paramIds.stereo)}
            {...{ 'value.format': (v: number) => `${Math.round(v)}°` }}
          />
        </WithInfo>
      </div>

      <div className="block reset">
        <div className="title">LFO</div>
        <WithInfo title={flangerInfo.reset} className="reset">
          <Button label="Reset" onClick={() => host.pulseReset()} />
        </WithInfo>
      </div>

      <div className="block params">
        <div className="title">Flanger</div>
        <WithInfo title={flangerInfo.minDelay}>
          <Knob
            label="Min Delay"
            value$={host.minDelay$}
            min={0.1}
            max={10}
            reset={flangerParamDefault('min_delay')}
            scale="frequency"
            log_factor={4}
            dots={DELAY_DOTS}
            labels={DELAY_LABELS}
            {...edit(paramIds.min_delay)}
            {...{ 'value.format': (v: number) => `${v.toFixed(2)} ms` }}
          />
        </WithInfo>
        <WithInfo title={flangerInfo.modDepth}>
          <Knob
            label="Depth"
            value$={host.modDepth$}
            min={0.1}
            max={10}
            reset={flangerParamDefault('mod_depth')}
            scale="frequency"
            log_factor={4}
            dots={DELAY_DOTS}
            labels={DELAY_LABELS}
            {...edit(paramIds.mod_depth)}
            {...{ 'value.format': (v: number) => `${v.toFixed(2)} ms` }}
          />
        </WithInfo>
        <WithInfo title={flangerInfo.feedback}>
          <Knob
            label="Feedback"
            value$={host.feedback$}
            min={-0.99}
            max={0.99}
            reset={flangerParamDefault('feedback')}
            base={0}
            dots={FB_DOTS}
            labels={FB_LABELS}
            {...edit(paramIds.feedback)}
          />
        </WithInfo>
        <WithInfo title={flangerInfo.amount}>
          <Knob
            label="Amount"
            value$={host.amount$}
            min={-60}
            max={12}
            reset={flangerParamDefault('amount')}
            base={0}
            scale="decibel"
            log_factor={3}
            dots={MIX_DB_DOTS}
            labels={MIX_DB_LABELS}
            {...edit(paramIds.amount)}
          />
        </WithInfo>
        <WithInfo title={flangerInfo.dry}>
          <Knob
            label="Dry"
            value$={host.dry$}
            min={-60}
            max={12}
            reset={flangerParamDefault('dry')}
            base={0}
            scale="decibel"
            log_factor={3}
            dots={MIX_DB_DOTS}
            labels={MIX_DB_LABELS}
            {...edit(paramIds.dry)}
          />
        </WithInfo>
      </div>
    </div>
  );
}
