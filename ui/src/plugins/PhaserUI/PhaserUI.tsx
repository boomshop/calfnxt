import { Header } from '../../components';
import { Button, Knob, ModulationChart, Toggle, WithInfo } from '../../widgets';
import { paramIds } from '../../generated/phaserModel';
import { phaserParamDefault, type IPhaserHost } from '../../host/phaserHost';
import { phaserInfo } from './phaserInfo';
import '../PluginUI.scss';
import './PhaserUI.scss';

export interface PhaserUIProps {
  host: IPhaserHost;
}

const FREQ_DOTS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const FREQ_LABELS = [
  { pos: 20, label: '20' },
  { pos: 100, label: '100' },
  { pos: 1000, label: '1k' },
  { pos: 5000, label: '5k' },
  { pos: 20000, label: '20k' },
];

const DEPTH_DOTS = [0, 1200, 2400, 4800, 7200, 10800];
const DEPTH_LABELS = [
  { pos: 0, label: '0' },
  { pos: 1200, label: '1k' },
  { pos: 2400, label: '2k' },
  { pos: 4800, label: '4k' },
  { pos: 7200, label: '7k' },
  { pos: 10800, label: '10.8k' },
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

const STAGES_DOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const STAGES_LABELS = [
  { pos: 1, label: '1' },
  { pos: 2, label: '2' },
  { pos: 3, label: '3' },
  { pos: 4, label: '4' },
  { pos: 5, label: '5' },
  { pos: 6, label: '6' },
  { pos: 7, label: '7' },
  { pos: 8, label: '8' },
  { pos: 9, label: '9' },
  { pos: 10, label: '10' },
  { pos: 11, label: '11' },
  { pos: 12, label: '12' },
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

export function PhaserUI(props: PhaserUIProps) {
  const { host } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });

  return (
    <div className="PhaserUI PluginUI">
      <Header title="Phaser">
        <WithInfo title={phaserInfo.active}>
          <Toggle state$={host.active$} icon="power" className="active" />
        </WithInfo>
      </Header>

      <div className="block rate">
        <div className="title">Rate</div>
        <WithInfo title={phaserInfo.modRate}>
          <Knob
            label="Mod Rate"
            value$={host.modRate$}
            min={0.01}
            max={20}
            reset={phaserParamDefault('mod_rate')}
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
        <WithInfo title={phaserInfo.lfo}>
          <Toggle state$={host.lfo$} icon="play" />
        </WithInfo>
      </div>

      <div className="block chart">
        <div className="title">Frequency Response</div>
        <ModulationChart data$={host.response$} dbMin={-36} dbMax={24} />
      </div>

      <div className="block stereo">
        <div className="title">Stereo</div>
        <WithInfo title={phaserInfo.stereo}>
          <Knob
            label="Stereo Phase"
            value$={host.stereo$}
            min={0}
            max={360}
            reset={phaserParamDefault('stereo')}
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
        <WithInfo title={phaserInfo.reset} className="reset">
          <Button label="Reset" onClick={() => host.pulseReset()} />
        </WithInfo>
      </div>

      <div className="block params">
        <div className="title">Phaser</div>
        <WithInfo title={phaserInfo.baseFreq}>
          <Knob
            label="Center"
            value$={host.baseFreq$}
            min={20}
            max={20000}
            reset={phaserParamDefault('base_freq')}
            scale="frequency"
            dots={FREQ_DOTS}
            labels={FREQ_LABELS}
            {...edit(paramIds.base_freq)}
          />
        </WithInfo>
        <WithInfo title={phaserInfo.modDepth}>
          <Knob
            label="Depth"
            value$={host.modDepth$}
            min={0}
            max={10800}
            reset={phaserParamDefault('mod_depth')}
            dots={DEPTH_DOTS}
            labels={DEPTH_LABELS}
            {...edit(paramIds.mod_depth)}
            {...{ 'value.format': (v: number) => `${Math.round(v)} ct` }}
          />
        </WithInfo>
        <WithInfo title={phaserInfo.feedback}>
          <Knob
            label="Feedback"
            value$={host.feedback$}
            min={-0.99}
            max={0.99}
            reset={phaserParamDefault('feedback')}
            base={0}
            dots={FB_DOTS}
            labels={FB_LABELS}
            {...edit(paramIds.feedback)}
          />
        </WithInfo>
        <WithInfo title={phaserInfo.stages}>
          <Knob
            label="Stages"
            value$={host.stages$}
            min={1}
            max={12}
            snap={1}
            reset={phaserParamDefault('stages')}
            dots={STAGES_DOTS}
            labels={STAGES_LABELS}
            {...edit(paramIds.stages)}
            {...{ 'value.format': (v: number) => `${Math.round(v)}` }}
          />
        </WithInfo>
        <WithInfo title={phaserInfo.amount}>
          <Knob
            label="Amount"
            value$={host.amount$}
            min={-60}
            max={12}
            reset={phaserParamDefault('amount')}
            base={0}
            scale="decibel"
            log_factor={3}
            dots={MIX_DB_DOTS}
            labels={MIX_DB_LABELS}
            {...edit(paramIds.amount)}
          />
        </WithInfo>
        <WithInfo title={phaserInfo.dry}>
          <Knob
            label="Dry"
            value$={host.dry$}
            min={-60}
            max={12}
            reset={phaserParamDefault('dry')}
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
