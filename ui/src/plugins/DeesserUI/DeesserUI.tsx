import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { Header } from '../../components';
import {
  Buttons,
  EQChart,
  HistoryChart,
  Knob,
  LevelMeter,
  Toggle,
} from '../../widgets';
import { paramIds } from '../../generated/deesserModel';
import {
  DEESSER_DETECTION_ENTRIES,
  DEESSER_MODE_ENTRIES,
  DEESSER_SLOPE_ENTRIES,
  deesserParamDefault,
  type IDeesserHost,
} from '../../host/deesserHost';
import '../PluginUI.scss';
import './DeesserUI.scss';

export interface DeesserUIProps {
  host: IDeesserHost;
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

const LAXITY_DOTS = [1, 10, 25, 50, 75, 100];
const LAXITY_LABELS = [
  { pos: 1, label: '1' },
  { pos: 25, label: '25' },
  { pos: 50, label: '50' },
  { pos: 75, label: '75' },
  { pos: 100, label: '100' },
];

const MAKEUP_DOTS = [0, 6, 12, 18, 24];
const MAKEUP_LABELS = [
  { pos: 0, label: '0' },
  { pos: 6, label: '6' },
  { pos: 12, label: '12' },
  { pos: 18, label: '18' },
  { pos: 24, label: '24' },
];

const FREQ_DOTS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const FREQ_LABELS = [
  { pos: 20, label: '20' },
  { pos: 100, label: '100' },
  { pos: 1000, label: '1k' },
  { pos: 5000, label: '5k' },
  { pos: 10000, label: '10k' },
  { pos: 20000, label: '20k' },
];

const GAIN_DOTS = [-24, -18, -12, -6, 0, 6, 12, 18, 24];
const GAIN_LABELS = [
  { pos: -24, label: '−24' },
  { pos: -12, label: '−12' },
  { pos: 0, label: '0' },
  { pos: 12, label: '+12' },
  { pos: 24, label: '+24' },
];

const Q_DOTS = [0.1, 0.5, 0.707, 1, 2, 5, 10, 20];
const Q_LABELS = [
  { pos: 0.1, label: '0.1' },
  { pos: 0.7, label: '0.7' },
  { pos: 2, label: '2' },
  { pos: 5, label: '5' },
  { pos: 10, label: '10' },
  { pos: 20, label: '20' },
];

/** Presentational stub — layout/styling TBD. */
export function DeesserUI(props: DeesserUIProps) {
  const { host } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });
  const mode = useDynamicValueReadonly(host.mode$, 0);
  const detection = useDynamicValueReadonly(host.detection$, 1);
  const slope = useDynamicValueReadonly(host.slope$, 24);

  return (
    <div className="DeesserUI PluginUI">
      <Header title="DeEsser">
        <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
      </Header>

      <HistoryChart
        data$={host.historyData$}
        vizId="deess"
        graphs={[
          { className: 'hist-audio', mode: 'bottom' },
          { className: 'hist-audio-filtered', mode: 'bottom' },
          { className: 'hist-gr', mode: 'line', toFront: true, gradient: true },
        ]}
      />

      <div className="block dynamics">
        <div className="title">Dynamics</div>
        <div className="top">
          <Knob
            label="Thresh"
            value$={host.threshold$}
            min={-60}
            max={0}
            reset={deesserParamDefault('threshold')}
            base={0}
            dots={THRESH_DOTS}
            labels={THRESH_LABELS}
            size="large"
            {...edit(paramIds.threshold)}
          />
          <Knob
            label="Ratio"
            value$={host.ratio$}
            min={1}
            max={20}
            reset={deesserParamDefault('ratio')}
            scale="log2"
            log_factor={4}
            dots={RATIO_DOTS}
            labels={RATIO_LABELS}
            size="large"
            {...{ 'value.format': (v: number) => `${v.toFixed(1)}:1` }}
            {...edit(paramIds.ratio)}
          />
        </div>
        <div className="bottom">
          <Knob
            label="Laxity"
            value$={host.laxity$}
            min={1}
            max={100}
            reset={deesserParamDefault('laxity')}
            dots={LAXITY_DOTS}
            labels={LAXITY_LABELS}
            size="small"
            {...{ 'value.format': (v: number) => `${Math.round(v)}` }}
            {...edit(paramIds.laxity)}
          />
          <Knob
            label="Split"
            value$={host.splitFreq$}
            min={20}
            max={20000}
            reset={deesserParamDefault('split_freq')}
            scale="frequency"
            dots={FREQ_DOTS}
            labels={FREQ_LABELS}
            {...edit(paramIds.split_freq)}
          />
          <Knob
            label="Makeup"
            value$={host.makeup$}
            min={0}
            max={24}
            reset={deesserParamDefault('makeup')}
            base={0}
            dots={MAKEUP_DOTS}
            labels={MAKEUP_LABELS}
            size="small"
            {...edit(paramIds.makeup)}
          />
        </div>
        <div className="buttons">
          <Buttons
            entries={DEESSER_DETECTION_ENTRIES}
            value={detection}
            onChange={(v) => {
              host.beginEdit(paramIds.detection);
              host.detection$.set(v);
              host.endEdit(paramIds.detection);
            }}
          />
          <Buttons
            entries={DEESSER_MODE_ENTRIES}
            value={mode}
            onChange={(v) => {
              host.beginEdit(paramIds.mode);
              host.mode$.set(v);
              host.endEdit(paramIds.mode);
            }}
          />
          <Buttons
            entries={DEESSER_SLOPE_ENTRIES}
            value={slope}
            onChange={(v) => {
              host.beginEdit(paramIds.slope);
              host.slope$.set(v);
              host.endEdit(paramIds.slope);
            }}
          />
        </div>
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
          gradient={[
            { value: 0, color: '#0066ff' },
            { value: 60, color: '#ff0066' },
          ]}
        />
      </div>

      <div className="block filters">
        <div className="title">Detection</div>
        <EQChart
          bands={host.filterBands}
          interactive
          showLabels={false}
          yRange={{ min: -60, max: 24 }}
          dbGrid={12}
        />
        <div className="knobs">
          <Knob
            label="HP Q"
            value$={host.hpQ$}
            min={0.1}
            max={20}
            reset={deesserParamDefault('hp_q')}
            scale="log2"
            log_factor={4}
            dots={Q_DOTS}
            labels={Q_LABELS}
            size="small"
            {...edit(paramIds.hp_q)}
          />
          <Knob
            label="Peak"
            value$={host.peakFreq$}
            min={20}
            max={20000}
            reset={deesserParamDefault('peak_freq')}
            scale="frequency"
            dots={FREQ_DOTS}
            labels={FREQ_LABELS}
            size="small"
            {...edit(paramIds.peak_freq)}
          />
          <Knob
            label="Gain"
            value$={host.peakGain$}
            min={-24}
            max={24}
            reset={deesserParamDefault('peak_gain')}
            base={0}
            dots={GAIN_DOTS}
            labels={GAIN_LABELS}
            size="small"
            {...edit(paramIds.peak_gain)}
          />
          <Knob
            label="Q"
            value$={host.peakQ$}
            min={0.1}
            max={20}
            reset={deesserParamDefault('peak_q')}
            scale="log2"
            log_factor={4}
            dots={Q_DOTS}
            labels={Q_LABELS}
            size="small"
            {...edit(paramIds.peak_q)}
          />
        </div>

        <Toggle state$={host.listen$} icon="headphones" className="warn" />
      </div>
    </div>
  );
}
