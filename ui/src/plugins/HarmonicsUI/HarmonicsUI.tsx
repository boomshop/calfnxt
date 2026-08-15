import { Header } from '../../components';
import {
  Buttons,
  FrequencyRange,
  FREQUENCY_RANGE_LR_MODE_ENTRIES,
  HarmonicBars,
  Knob,
  Toggle,
  WaveshapeChart,
  WithInfo,
} from '../../widgets';
import { paramIds } from '../../generated/harmonicsModel';
import {
  HARMONICS_PRESET_ENTRIES,
  harmonicsParamDefault,
  type IHarmonicsHost,
} from '../../host/harmonicsHost';
import type { HarmonicsPresetId } from './harmonicsPresets';
import { harmonicsInfo } from './harmonicsInfo';
import '../PluginUI.scss';
import './HarmonicsUI.scss';

export interface HarmonicsUIProps {
  host: IHarmonicsHost;
}

const DRIVE_DOTS = [0.1, 1, 2.5, 5, 7.5, 10];
const DRIVE_LABELS = [
  { pos: 0.1, label: '0.1' },
  { pos: 5, label: '5' },
  { pos: 10, label: '10' },
];

const BLEND_DOTS = [-10, -5, 0, 5, 10];
const BLEND_LABELS = [
  { pos: -10, label: 'Transistor' },
  { pos: 0, label: '0' },
  { pos: 10, label: 'Tube/Tape' },
];

const ASYM_DOTS = [-1, -0.5, 0, 0.5, 1];
const ASYM_LABELS = [
  { pos: -1, label: '−1' },
  { pos: -0.5, label: '−0.5' },
  { pos: 0, label: '0' },
  { pos: 0.5, label: '+0.5' },
  { pos: 1, label: '+1' },
];

const TONE_DOTS = [-12, -6, 0, 6, 12];
const TONE_LABELS = [
  { pos: -12, label: '−12' },
  { pos: -6, label: '−6' },
  { pos: 0, label: '0' },
  { pos: 6, label: '+6' },
  { pos: 12, label: '+12' },
];

const OS_DOTS = [1, 2, 3, 4];
const OS_LABELS = OS_DOTS.map((n) => ({ pos: n, label: `${n}×` }));

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

export function HarmonicsUI(props: HarmonicsUIProps) {
  const { host } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });

  return (
    <div className="HarmonicsUI PluginUI">
      <Header title="Harmonics">
        <WithInfo title={harmonicsInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
      </Header>

      <div className="block pre">
        <div className="title">Feed</div>
        <WithInfo title={harmonicsInfo.pre}>
          <FrequencyRange
            hipass$={host.preHipass$}
            lopass$={host.preLopass$}
            hpMode$={host.preHpMode$}
            lpMode$={host.preLpMode$}
            listen$={host.preListen$}
            listenInfo={harmonicsInfo.preListen}
            modeEntries={FREQUENCY_RANGE_LR_MODE_ENTRIES}
            hipassDefault={harmonicsParamDefault('pre_hipass')}
            lopassDefault={harmonicsParamDefault('pre_lopass')}
            hipassEdit={edit(paramIds.pre_hipass)}
            lopassEdit={edit(paramIds.pre_lopass)}
          />
        </WithInfo>
      </div>

      <div className="block wave">
        <div className="title">Shape</div>
        <WithInfo title={harmonicsInfo.curve} className="wave">
          <WaveshapeChart
            drive$={host.drive$}
            blend$={host.blend$}
            asymmetry$={host.asymmetry$}
            viz$={host.shapePoint$}
          />
        </WithInfo>
      </div>

      <div className="block harmonics">
        <div className="title">Harmonics</div>
        <WithInfo title={harmonicsInfo.bars} className="harmonics">
          <HarmonicBars
            drive$={host.drive$}
            blend$={host.blend$}
            asymmetry$={host.asymmetry$}
            count={5}
          />
        </WithInfo>
      </div>

      <div className="block drive">
        <div className="title">Drive</div>

        <div className="controls2">
          <WithInfo title={harmonicsInfo.oversample}>
            <Knob
              label="Oversampling"
              value$={host.oversample$}
              min={1}
              max={4}
              snap={1}
              reset={harmonicsParamDefault('oversample')}
              dots={OS_DOTS}
              labels={OS_LABELS}
              {...{ 'value.format': (v: number) => `${Math.round(v)}×` }}
              {...edit(paramIds.oversample)}
              start={225}
              angle={90}
            />
          </WithInfo>
          <WithInfo title={harmonicsInfo.asymmetry}>
            <Knob
              value$={host.asymmetry$}
              base={0}
              label="Asym"
              min={-1}
              max={1}
              dots={ASYM_DOTS}
              labels={ASYM_LABELS}
              reset={harmonicsParamDefault('asymmetry')}
              {...edit(paramIds.asymmetry)}
              size="medium"
              className="asym"
            />
          </WithInfo>
          <WithInfo title={harmonicsInfo.tone}>
            <Knob
              value$={host.tone$}
              base={0}
              label="Tone"
              min={-12}
              max={12}
              unit="dB"
              dots={TONE_DOTS}
              labels={TONE_LABELS}
              reset={harmonicsParamDefault('tone')}
              {...edit(paramIds.tone)}
              size="medium"
            />
          </WithInfo>
        </div>

        <div className="controls1">
          <WithInfo title={harmonicsInfo.drive}>
            <Knob
              value$={host.drive$}
              label="Drive"
              min={0.1}
              max={10}
              dots={DRIVE_DOTS}
              labels={DRIVE_LABELS}
              reset={harmonicsParamDefault('drive')}
              {...edit(paramIds.drive)}
              size="large"
            />
          </WithInfo>
          <WithInfo title={harmonicsInfo.blend}>
            <Knob
              value$={host.blend$}
              base={0}
              label="Blend"
              min={-10}
              max={10}
              dots={BLEND_DOTS}
              labels={BLEND_LABELS}
              reset={harmonicsParamDefault('blend')}
              {...edit(paramIds.blend)}
              size="large"
            />
          </WithInfo>
        </div>

        <div className="controls3">
          <WithInfo title={harmonicsInfo.dry}>
            <Knob
              value$={host.dry$}
              label="Dry"
              min={-60}
              max={12}
              unit="dB"
              dots={DB_DOTS}
              labels={DB_LABELS}
              reset={harmonicsParamDefault('dry')}
              scale="decibel"
              log_factor={2}
              base={0}
              size="medium"
              {...edit(paramIds.dry)}
            />
          </WithInfo>
          <WithInfo title={harmonicsInfo.wet}>
            <Knob
              value$={host.wet$}
              label="Wet"
              min={-60}
              max={12}
              unit="dB"
              dots={DB_DOTS}
              labels={DB_LABELS}
              reset={harmonicsParamDefault('wet')}
              scale="decibel"
              log_factor={2}
              base={0}
              size="medium"
              {...edit(paramIds.wet)}
            />
          </WithInfo>
        </div>

        <WithInfo title={harmonicsInfo.presets}>
          <Buttons
            entries={HARMONICS_PRESET_ENTRIES}
            value={'' as HarmonicsPresetId}
            onChange={(id) => host.applyPreset(id as HarmonicsPresetId)}
            className="presets"
          />
        </WithInfo>
      </div>

      <div className="block post">
        <div className="title">Post</div>
        <WithInfo title={harmonicsInfo.post}>
          <FrequencyRange
            hipass$={host.postHipass$}
            lopass$={host.postLopass$}
            hpMode$={host.postHpMode$}
            lpMode$={host.postLpMode$}
            listen$={host.listen$}
            listenInfo={harmonicsInfo.listen}
            modeEntries={FREQUENCY_RANGE_LR_MODE_ENTRIES}
            hipassDefault={harmonicsParamDefault('post_hipass')}
            lopassDefault={harmonicsParamDefault('post_lopass')}
            hipassEdit={edit(paramIds.post_hipass)}
            lopassEdit={edit(paramIds.post_lopass)}
          />
        </WithInfo>
      </div>
    </div>
  );
}
