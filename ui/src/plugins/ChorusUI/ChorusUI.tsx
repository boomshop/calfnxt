import { Header } from '../../components';
import {
  Button,
  ChorusChart,
  FREQUENCY_RANGE_LR_MODE_ENTRIES,
  FrequencyRange,
  Knob,
  Toggle,
  WithInfo,
} from '../../widgets';
import { paramIds } from '../../generated/chorusModel';
import { chorusParamDefault, type IChorusHost } from '../../host/chorusHost';
import { chorusInfo } from './chorusInfo';
import '../PluginUI.scss';
import './ChorusUI.scss';

export interface ChorusUIProps {
  host: IChorusHost;
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

const STEREO_DOTS = [0, 90, 180, 270, 360];
const STEREO_LABELS = [
  { pos: 0, label: '0' },
  { pos: 90, label: '90' },
  { pos: 180, label: '180' },
  { pos: 270, label: '270' },
  { pos: 360, label: '360' },
];

const VOICE_DOTS = [1, 2, 4, 6, 8];
const VOICE_LABELS = [
  { pos: 1, label: '1' },
  { pos: 2, label: '2' },
  { pos: 3, label: '3' },
  { pos: 4, label: '4' },
  { pos: 5, label: '5' },
  { pos: 6, label: '6' },
  { pos: 7, label: '7' },
  { pos: 8, label: '8' },
];

const OVERLAP_DOTS = [0, 0.25, 0.5, 0.75, 1];
const OVERLAP_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.25, label: '25' },
  { pos: 0.5, label: '50' },
  { pos: 0.75, label: '75' },
  { pos: 1, label: '100' },
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

export function ChorusUI(props: ChorusUIProps) {
  const { host } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });

  return (
    <div className="ChorusUI PluginUI">
      <Header title="Chorus">
        <WithInfo title={chorusInfo.active}>
          <Toggle state$={host.active$} icon="power" className="active" />
        </WithInfo>
      </Header>

      <div className="block modulation">
        <div className="title">Modulation</div>
        <WithInfo title={chorusInfo.modRate}>
          <Knob
            label="Mod Rate"
            value$={host.modRate$}
            min={0.01}
            max={20}
            reset={chorusParamDefault('mod_rate')}
            scale="frequency"
            log_factor={4}
            dots={RATE_DOTS}
            labels={RATE_LABELS}
            size="large"
            {...edit(paramIds.mod_rate)}
          />
        </WithInfo>
        <WithInfo title={chorusInfo.minDelay}>
          <Knob
            label="Min Delay"
            value$={host.minDelay$}
            min={0.1}
            max={10}
            reset={chorusParamDefault('min_delay')}
            scale="frequency"
            log_factor={4}
            dots={DELAY_DOTS}
            labels={DELAY_LABELS}
            {...edit(paramIds.min_delay)}
            {...{ 'value.format': (v: number) => `${v.toFixed(2)} ms` }}
          />
        </WithInfo>
        <WithInfo title={chorusInfo.modDepth}>
          <Knob
            label="Depth"
            value$={host.modDepth$}
            min={0.1}
            max={10}
            reset={chorusParamDefault('mod_depth')}
            scale="frequency"
            log_factor={4}
            dots={DELAY_DOTS}
            labels={DELAY_LABELS}
            {...edit(paramIds.mod_depth)}
            {...{ 'value.format': (v: number) => `${v.toFixed(2)} ms` }}
          />
        </WithInfo>
        <WithInfo title={chorusInfo.overlap}>
          <Knob
            label="Overlap"
            value$={host.overlap$}
            min={0}
            max={1}
            reset={chorusParamDefault('overlap')}
            dots={OVERLAP_DOTS}
            labels={OVERLAP_LABELS}
            {...edit(paramIds.overlap)}
            {...{
              'value.format': (v: number) => `${Math.round(v * 100)}%`,
            }}
          />
        </WithInfo>

        <div className="lfo">
          <WithInfo title={chorusInfo.reset} className="reset">
            <Button label="Reset" onClick={() => host.pulseReset()} />
          </WithInfo>

          <WithInfo title={chorusInfo.lfo}>
            <Toggle state$={host.lfo$} icon="play" />
          </WithInfo>
        </div>
      </div>

      <WithInfo title={chorusInfo.chart}>
        <ChorusChart
          voices$={host.voices$}
          overlap$={host.overlap$}
          vphase$={host.vphase$}
          lfo$={host.chorusLfo$}
          className="chart"
        />
      </WithInfo>

      <div className="block voices">
        <div className="title">Voices</div>
        <WithInfo title={chorusInfo.stereo}>
          <Knob
            label="Stereo Phase"
            value$={host.stereo$}
            min={0}
            max={360}
            reset={chorusParamDefault('stereo')}
            dots={STEREO_DOTS}
            labels={STEREO_LABELS}
            size="large"
            {...edit(paramIds.stereo)}
            {...{ 'value.format': (v: number) => `${Math.round(v)}°` }}
          />
        </WithInfo>

        <WithInfo title={chorusInfo.voices}>
          <Knob
            label="Voices"
            value$={host.voices$}
            min={1}
            max={8}
            snap={1}
            reset={chorusParamDefault('voices')}
            dots={VOICE_DOTS}
            labels={VOICE_LABELS}
            {...edit(paramIds.voices)}
            {...{ 'value.format': (v: number) => `${Math.round(v)}` }}
          />
        </WithInfo>
        <WithInfo title={chorusInfo.vphase}>
          <Knob
            label="VPhase"
            value$={host.vphase$}
            min={0}
            max={360}
            reset={chorusParamDefault('vphase')}
            dots={STEREO_DOTS}
            labels={STEREO_LABELS}
            {...edit(paramIds.vphase)}
            {...{ 'value.format': (v: number) => `${Math.round(v)}°` }}
          />
        </WithInfo>
        <WithInfo title={chorusInfo.amount}>
          <Knob
            label="Amount"
            value$={host.amount$}
            min={-60}
            max={12}
            reset={chorusParamDefault('amount')}
            base={0}
            scale="decibel"
            log_factor={3}
            dots={MIX_DB_DOTS}
            labels={MIX_DB_LABELS}
            {...edit(paramIds.amount)}
          />
        </WithInfo>
        <WithInfo title={chorusInfo.dry}>
          <Knob
            label="Dry"
            value$={host.dry$}
            min={-60}
            max={12}
            reset={chorusParamDefault('dry')}
            base={0}
            scale="decibel"
            log_factor={3}
            dots={MIX_DB_DOTS}
            labels={MIX_DB_LABELS}
            {...edit(paramIds.dry)}
          />
        </WithInfo>
      </div>

      <div className="block post">
        <div className="title">Post Filter</div>
        <WithInfo title={chorusInfo.post}>
          <FrequencyRange
            hipass$={host.hipass$}
            lopass$={host.lopass$}
            hpMode$={host.hpMode$}
            lpMode$={host.lpMode$}
            listen$={host.listen$}
            listenInfo={chorusInfo.listen}
            modeEntries={FREQUENCY_RANGE_LR_MODE_ENTRIES}
            hipassDefault={chorusParamDefault('hipass')}
            lopassDefault={chorusParamDefault('lopass')}
            hipassEdit={edit(paramIds.hipass)}
            lopassEdit={edit(paramIds.lopass)}
            layout="horizontal"
          />
        </WithInfo>
      </div>
    </div>
  );
}
