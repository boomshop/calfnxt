import { Header } from '../../components';
import {
  EnvelopeChart,
  FrequencyRange,
  Knob,
  Select,
  Toggle,
} from '../../widgets';
import { paramIds } from '../../generated/transientsModel';
import {
  TRANSIENTS_DISPLAY_MS,
  TRANSIENTS_VIEW_ENTRIES,
  transientsParamDefault,
  type ITransientsHost,
} from '../../host/transientsHost';
import '../PluginUI.scss';
import './TransientsUI.scss';

export interface TransientsUIProps {
  host: ITransientsHost;
}

const formatPercent = (v: number) => `${Math.round(v * 100)} %`;
const formatBipolarPercent = (v: number) =>
  `${v > 0 ? '+' : ''}${Math.round(v * 100)} %`;

const MIX_DOTS = [0, 0.25, 0.5, 0.75, 1];
const PERCENT_LABELS = [
  { pos: 0, label: '0 %' },
  { pos: 0.5, label: '50 %' },
  { pos: 1, label: '100 %' },
];

const BIPOLAR_DOTS = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];
const BIPOLAR_LABELS = [
  { pos: -1, label: '-100 %' },
  { pos: -0.5, label: '-50' },
  { pos: 0, label: '0' },
  { pos: 0.5, label: '+50' },
  { pos: 1, label: '+100 %' },
];

const SUSTAIN_DOTS = [-60, -54, -48, -42, -36, -30, -24, -18, -12, -6, 0];
const SUSTAIN_LABELS = [
  { pos: -60, label: '-60' },
  { pos: -48, label: '-48' },
  { pos: -36, label: '-36' },
  { pos: -24, label: '-24' },
  { pos: -12, label: '-12' },
  { pos: 0, label: '0' },
];

const LOOKAHEAD_DOTS = [0, 25, 50, 75, 100];
const LOOKAHEAD_LABELS = [
  { pos: 0, label: '0' },
  { pos: 25, label: '25' },
  { pos: 50, label: '50' },
  { pos: 75, label: '75' },
  { pos: 100, label: '100' },
];

const ATTACK_MS_DOTS = [
  1, 5, 10, 25, 50, 75, 100, 150, 200, 250, 300, 400, 500,
];
const ATTACK_MS_LABELS = [
  { pos: 1, label: '1' },
  { pos: 10, label: '10' },
  { pos: 25, label: '25' },
  { pos: 50, label: '50' },
  { pos: 100, label: '100' },
  { pos: 250, label: '250' },
  { pos: 500, label: '500' },
];

const RELEASE_MS_DOTS = [
  1, 10, 25, 50, 100, 250, 500, 1000, 1500, 2000, 3000, 4000, 5000,
];
const RELEASE_MS_LABELS = [
  { pos: 1, label: '1' },
  { pos: 50, label: '50' },
  { pos: 100, label: '100' },
  { pos: 250, label: '250' },
  { pos: 500, label: '500' },
  { pos: 1000, label: '1k' },
  { pos: 2000, label: '2k' },
  { pos: 3000, label: '3k' },
  { pos: 4000, label: '4k' },
  { pos: 5000, label: '5k' },
];

const DISPLAY_DOTS = [...TRANSIENTS_DISPLAY_MS];
const DISPLAY_LABELS = [
  { pos: 100, label: '100' },
  { pos: 250, label: '250' },
  { pos: 500, label: '500' },
  { pos: 1000, label: '1s' },
  { pos: 2500, label: '2.5' },
  { pos: 5000, label: '5s' },
];

function formatDisplayMs(v: number): string {
  const ms = TRANSIENTS_DISPLAY_MS.reduce((best, cand) =>
    Math.abs(cand - v) < Math.abs(best - v) ? cand : best,
  );
  return ms >= 1000 ? `${ms / 1000} s` : `${ms} ms`;
}

export function TransientsUI(props: TransientsUIProps) {
  const { host } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });

  return (
    <div className="TransientsUI PluginUI">
      <Header title="Transients">
        <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        <Knob
          label="Mix"
          value$={host.mix$}
          min={0}
          max={1}
          reset={transientsParamDefault('mix')}
          dots={MIX_DOTS}
          labels={PERCENT_LABELS}
          {...{ 'value.format': formatPercent }}
          {...edit(paramIds.mix)}
          size="tiny"
        />
      </Header>

      <div className="block envelope">
        <div className="title">Envelope Filter</div>

        <FrequencyRange
          hipass$={host.hipass$}
          lopass$={host.lopass$}
          hpMode$={host.hpMode$}
          lpMode$={host.lpMode$}
          listen$={host.listen$}
          hipassDefault={transientsParamDefault('hipass')}
          lopassDefault={transientsParamDefault('lopass')}
          hipassEdit={edit(paramIds.hipass)}
          lopassEdit={edit(paramIds.lopass)}
        />
      </div>

      <div className="block shape">
        <div className="title">Shape</div>
        <div className="upper">
          <Knob
            label="Attack"
            value$={host.attackBoost$}
            min={-1}
            max={1}
            base={0}
            reset={transientsParamDefault('attack_boost')}
            dots={BIPOLAR_DOTS}
            labels={BIPOLAR_LABELS}
            {...{ 'value.format': formatBipolarPercent }}
            size="large"
            {...edit(paramIds.attack_boost)}
          />
          <Knob
            label="Look"
            className="look"
            value$={host.lookahead$}
            min={0}
            max={100}
            reset={transientsParamDefault('lookahead')}
            size="small"
            dots={LOOKAHEAD_DOTS}
            labels={LOOKAHEAD_LABELS}
            {...{ 'value.format': (v: number) => v.toFixed(0) }}
            {...edit(paramIds.lookahead)}
          />
          <Knob
            label="Release"
            value$={host.releaseBoost$}
            min={-1}
            max={1}
            base={0}
            reset={transientsParamDefault('release_boost')}
            dots={BIPOLAR_DOTS}
            labels={BIPOLAR_LABELS}
            {...{ 'value.format': formatBipolarPercent }}
            {...edit(paramIds.release_boost)}
            size="large"
          />
        </div>
        <div className="lower">
          <Knob
            label="Attack ms"
            value$={host.attackTime$}
            min={1}
            max={500}
            reset={transientsParamDefault('attack_time')}
            scale="log2"
            log_factor={4}
            dots={ATTACK_MS_DOTS}
            labels={ATTACK_MS_LABELS}
            {...edit(paramIds.attack_time)}
          />
          <Knob
            label="Sustain"
            value$={host.sustainThreshold$}
            min={-60}
            max={0}
            reset={transientsParamDefault('sustain_threshold')}
            scale="decibel"
            dots={SUSTAIN_DOTS}
            labels={SUSTAIN_LABELS}
            {...edit(paramIds.sustain_threshold)}
          />
          <Knob
            label="Release ms"
            value$={host.releaseTime$}
            min={1}
            max={5000}
            reset={transientsParamDefault('release_time')}
            scale="log2"
            log_factor={6}
            dots={RELEASE_MS_DOTS}
            labels={RELEASE_MS_LABELS}
            {...edit(paramIds.release_time)}
          />
        </div>
      </div>

      <div className="block display">
        <div className="title">Display</div>

        <EnvelopeChart
          data$={host.envelopeData$}
          view$={host.view$}
          display$={host.display$}
        />

        <div className="controls">
          <Select value$={host.view$} entries={TRANSIENTS_VIEW_ENTRIES} />
          <Knob
            label="Window"
            size="small"
            value$={host.display$}
            min={100}
            max={5000}
            reset={transientsParamDefault('display')}
            scale="frequency"
            snap={[...TRANSIENTS_DISPLAY_MS]}
            dots={DISPLAY_DOTS}
            labels={DISPLAY_LABELS}
            {...{ 'value.format': formatDisplayMs }}
            {...edit(paramIds.display)}
          />
        </div>
      </div>
    </div>
  );
}
