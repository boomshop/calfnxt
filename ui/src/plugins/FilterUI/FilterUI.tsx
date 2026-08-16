import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { Header } from '../../components';
import {
  Buttons,
  EQChart,
  Knob,
  Select,
  Toggle,
  WithInfo,
} from '../../widgets';
import { paramIds } from '../../generated/filterModel';
import {
  FILTER_DETECTION_ENTRIES,
  FILTER_MODE_ENTRIES,
  FILTER_SPECTRUM_ENTRIES,
  filterParamDefault,
  type IFilterHost,
} from '../../host/filterHost';
import { filterInfo } from './filterInfo';
import '../PluginUI.scss';
import './FilterUI.scss';

export interface FilterUIProps {
  host: IFilterHost;
}

const FREQ_DOTS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const FREQ_LABELS = [
  { pos: 20, label: '20' },
  { pos: 100, label: '100' },
  { pos: 1000, label: '1k' },
  { pos: 5000, label: '5k' },
  { pos: 10000, label: '10k' },
  { pos: 20000, label: '20k' },
];

const RES_DOTS = [0.707, 1, 2, 4, 8, 16, 32];
const RES_LABELS = [
  { pos: 0.707, label: '0.7' },
  { pos: 2, label: '2' },
  { pos: 8, label: '8' },
  { pos: 32, label: '32' },
];

const INERTIA_DOTS = [5, 10, 20, 40, 70, 100];
const INERTIA_LABELS = [
  { pos: 5, label: '5' },
  { pos: 20, label: '20' },
  { pos: 50, label: '50' },
  { pos: 100, label: '100' },
];

const MIX_DOTS = [0, 0.25, 0.5, 0.75, 1];
const MIX_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.25, label: '25' },
  { pos: 0.5, label: '50' },
  { pos: 0.75, label: '75' },
  { pos: 1, label: '100' },
];

const SOFT_DOTS = [0, 0.25, 0.5, 0.75, 1];
const SOFT_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.25, label: '25' },
  { pos: 0.5, label: '50' },
  { pos: 0.75, label: '75' },
  { pos: 1, label: '100' },
];

const ACT_DOTS = [-24, -12, -6, 0, 6, 12, 24];
const ACT_LABELS = [
  { pos: -24, label: '−24' },
  { pos: -12, label: '−12' },
  { pos: 0, label: '0' },
  { pos: 12, label: '+12' },
  { pos: 24, label: '+24' },
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

const RELEASE_DOTS = [1, 10, 50, 100, 200, 500, 1000, 2000];
const RELEASE_LABELS = [
  { pos: 1, label: '1' },
  { pos: 100, label: '100' },
  { pos: 200, label: '200' },
  { pos: 500, label: '500' },
  { pos: 1000, label: '1s' },
  { pos: 2000, label: '2s' },
];

export function FilterUI(props: FilterUIProps) {
  const { host } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });
  const envOn = useDynamicValueReadonly(host.envPower$, false);
  const detection = useDynamicValueReadonly(host.detection$, 0);
  const spectrumMode = useDynamicValueReadonly(host.spectrum$, 0);

  return (
    <div className="FilterUI PluginUI">
      <Header title="Filter">
        <WithInfo title={filterInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
      </Header>

      <div className="block filter">
        <div className="title">Filter</div>
        <div className="filter-top">
          <WithInfo title={filterInfo.mode} className="info-block mode">
            <Select value$={host.mode$} entries={FILTER_MODE_ENTRIES} />
          </WithInfo>
          <WithInfo title={filterInfo.spectrum} className="info-block spectrum">
            <Buttons
              layout="horizontal"
              entries={[...FILTER_SPECTRUM_ENTRIES]}
              value={Math.round(spectrumMode)}
              onChange={(v) => {
                host.beginEdit(paramIds.spectrum);
                host.spectrum$.set(v);
                host.endEdit(paramIds.spectrum);
              }}
            />
          </WithInfo>
        </div>
        <div className="knobs">
          <WithInfo title={filterInfo.frequency}>
            <Knob
              label="Freq"
              value$={host.frequency$}
              min={10}
              max={20000}
              reset={filterParamDefault('frequency')}
              scale="frequency"
              dots={FREQ_DOTS}
              labels={FREQ_LABELS}
              size="large"
              {...edit(paramIds.frequency)}
            />
          </WithInfo>
          <WithInfo title={filterInfo.resonance}>
            <Knob
              label="Res"
              value$={host.resonance$}
              min={0.707}
              max={32}
              reset={filterParamDefault('resonance')}
              scale="log2"
              log_factor={4}
              dots={RES_DOTS}
              labels={RES_LABELS}
              size="medium"
              {...edit(paramIds.resonance)}
            />
          </WithInfo>
          <div className="knobs-row">
            <WithInfo title={filterInfo.inertia}>
              <Knob
                label="Inertia"
                value$={host.inertia$}
                min={5}
                max={100}
                reset={filterParamDefault('inertia')}
                scale="log2"
                log_factor={3}
                dots={INERTIA_DOTS}
                labels={INERTIA_LABELS}
                size="small"
                {...edit(paramIds.inertia)}
              />
            </WithInfo>
            <WithInfo title={filterInfo.softClip}>
              <Knob
                label="Soft"
                value$={host.softClip$}
                min={0}
                max={1}
                reset={filterParamDefault('soft_clip')}
                dots={SOFT_DOTS}
                labels={SOFT_LABELS}
                size="small"
                {...edit(paramIds.soft_clip)}
              />
            </WithInfo>
            <WithInfo title={filterInfo.mix}>
              <Knob
                label="Mix"
                value$={host.mix$}
                min={0}
                max={1}
                reset={filterParamDefault('mix')}
                dots={MIX_DOTS}
                labels={MIX_LABELS}
                size="small"
                {...edit(paramIds.mix)}
              />
            </WithInfo>
          </div>
        </div>
      </div>

      <div className="block chart">
        <div className="title">Response</div>
        <EQChart
          bands={host.filterBands}
          interactive
          showLabels
          yRange={{ min: -60, max: 24 }}
          dbGrid={12}
          spectrum$={host.spectrumData$}
          spectrumMode={Math.round(spectrumMode)}
        />
      </div>

      <div className="block envelope">
        <div className="title">Envelope</div>
        <div className={`top-row${envOn ? '' : ' is-disabled'}`}>
          <WithInfo title={filterInfo.envPower}>
            <Toggle state$={host.envPower$} icon="power" className="power" />
          </WithInfo>
          <WithInfo title={filterInfo.detection} className="info-block mode">
            <Buttons
              entries={FILTER_DETECTION_ENTRIES}
              value={detection}
              onChange={(v) => {
                if (!envOn) return;
                host.beginEdit(paramIds.detection);
                host.detection$.set(v);
                host.endEdit(paramIds.detection);
              }}
            />
          </WithInfo>
        </div>
        <div className="knobs">
          <WithInfo title={filterInfo.target}>
            <Knob
              label="Target"
              value$={host.target$}
              min={10}
              max={20000}
              reset={filterParamDefault('target')}
              enabled$={host.envPower$}
              scale="frequency"
              dots={FREQ_DOTS}
              labels={FREQ_LABELS}
              size="large"
              {...edit(paramIds.target)}
            />
          </WithInfo>
          <WithInfo title={filterInfo.activation}>
            <Knob
              label="Activation"
              value$={host.activation$}
              min={-24}
              max={24}
              reset={filterParamDefault('activation')}
              enabled$={host.envPower$}
              base={0}
              dots={ACT_DOTS}
              labels={ACT_LABELS}
              size="medium"
              {...edit(paramIds.activation)}
            />
          </WithInfo>
          <div className="knobs-row">
            <WithInfo title={filterInfo.attack}>
              <Knob
                label="Attack"
                value$={host.attack$}
                min={0.1}
                max={500}
                reset={filterParamDefault('attack')}
                enabled$={host.envPower$}
                scale="log2"
                log_factor={4}
                dots={ATTACK_DOTS}
                labels={ATTACK_LABELS}
                size="small"
                {...edit(paramIds.attack)}
              />
            </WithInfo>
            <WithInfo title={filterInfo.release}>
              <Knob
                label="Release"
                value$={host.release$}
                min={1}
                max={2000}
                reset={filterParamDefault('release')}
                enabled$={host.envPower$}
                scale="log2"
                log_factor={4}
                dots={RELEASE_DOTS}
                labels={RELEASE_LABELS}
                size="small"
                {...edit(paramIds.release)}
              />
            </WithInfo>
          </div>
        </div>
      </div>
    </div>
  );
}
