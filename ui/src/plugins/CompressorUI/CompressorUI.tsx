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
import { paramIds } from '../../generated/compressorModel';
import {
  COMPRESSOR_LINK_ENTRIES,
  COMPRESSOR_MODE_ENTRIES,
  compressorParamDefault,
  type ICompressorHost,
} from '../../host/compressorHost';
import '../PluginUI.scss';
import './CompressorUI.scss';
import { compressorInfo } from './compressorInfo';

export interface CompressorUIProps {
  host: ICompressorHost;
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

const RELEASE_DOTS = [1, 10, 50, 100, 200, 500, 1000, 2000];
const RELEASE_LABELS = [
  { pos: 1, label: '1' },
  { pos: 100, label: '100' },
  { pos: 200, label: '200' },
  { pos: 500, label: '500' },
  { pos: 1000, label: '1s' },
  { pos: 2000, label: '2s' },
];

const MAKEUP_DOTS = [0, 6, 12, 18, 24];
const MAKEUP_LABELS = [
  { pos: 0, label: '0' },
  { pos: 6, label: '6' },
  { pos: 12, label: '12' },
  { pos: 18, label: '18' },
  { pos: 24, label: '24' },
];

const MIX_DOTS = [0, 0.25, 0.5, 0.75, 1];
const MIX_LABELS = [
  { pos: 0, label: '0 %' },
  { pos: 0.25, label: '25' },
  { pos: 0.5, label: '50' },
  { pos: 0.75, label: '75' },
  { pos: 1, label: '100 %' },
];

const PDR_DOTS = [0, 0.25, 0.5, 0.75, 1];
const PDR_LABELS = [
  { pos: 0, label: '0 %' },
  { pos: 0.25, label: '25' },
  { pos: 0.5, label: '50' },
  { pos: 0.75, label: '75' },
  { pos: 1, label: '100 %' },
];

/** Presentational stub — layout/styling TBD. */
export function CompressorUI(props: CompressorUIProps) {
  const { host } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });
  const mode = useDynamicValueReadonly(host.mode$, 1);
  const link = useDynamicValueReadonly(host.link$, 0);

  return (
    <div className="CompressorUI PluginUI">
      <Header title="Compressor">
        <WithInfo title={compressorInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
      </Header>

      <div className="history">
        <HistoryChart
          data$={host.historyData$}
          vizId="comp"
          graphs={[
            { className: 'hist-audio', mode: 'bottom' },
            { className: 'hist-audio-filtered', mode: 'bottom' },
            { className: 'hist-gr', mode: 'line', toFront: true, gradient: true },
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
          hipassDefault={compressorParamDefault('hipass')}
          lopassDefault={compressorParamDefault('lopass')}
          hipassEdit={edit(paramIds.hipass)}
          lopassEdit={edit(paramIds.lopass)}
        />
        <div className="selects">
          <WithInfo title={compressorInfo.mode} className="info-block">
            <Buttons
              entries={COMPRESSOR_MODE_ENTRIES}
              value={mode}
              onChange={(v) => {
                host.beginEdit(paramIds.mode);
                host.mode$.set(v);
                host.endEdit(paramIds.mode);
              }}
            />
          </WithInfo>
          <WithInfo title={compressorInfo.link} className="info-block">
            <Buttons
              entries={COMPRESSOR_LINK_ENTRIES}
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

      <div className="block compressor">
        <div className="title">Compressor</div>

        <div className="upper">
          <WithInfo title={compressorInfo.threshold}>
            <Knob
              label="Thresh"
              value$={host.threshold$}
              min={-60}
              max={0}
              reset={compressorParamDefault('threshold')}
              base={0}
              dots={THRESH_DOTS}
              labels={THRESH_LABELS}
              {...edit(paramIds.threshold)}
              size="large"
              scale="decibel"
              log_factor={3}
            />
          </WithInfo>
          <WithInfo title={compressorInfo.ratio}>
            <Knob
              label="Ratio"
              value$={host.ratio$}
              min={1}
              max={20}
              reset={compressorParamDefault('ratio')}
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
          <WithInfo title={compressorInfo.attack}>
            <Knob
              label="Attack"
              value$={host.attack$}
              min={0.1}
              max={500}
              reset={compressorParamDefault('attack')}
              scale="log2"
              log_factor={4}
              dots={ATTACK_DOTS}
              labels={ATTACK_LABELS}
              size="small"
              {...{ 'value.format': (v: number) => `${v.toFixed(1)}` }}
              {...edit(paramIds.attack)}
            />
          </WithInfo>
          <WithInfo title={compressorInfo.release}>
            <Knob
              label="Release"
              value$={host.release$}
              min={1}
              max={2000}
              reset={compressorParamDefault('release')}
              scale="log2"
              log_factor={4}
              dots={RELEASE_DOTS}
              labels={RELEASE_LABELS}
              size="small"
              {...{ 'value.format': (v: number) => `${v.toFixed(0)}` }}
              {...edit(paramIds.release)}
            />
          </WithInfo>
          <WithInfo title={compressorInfo.pdr}>
            <Knob
              label="PDR"
              value$={host.pdr$}
              min={0}
              max={1}
              reset={compressorParamDefault('pdr')}
              dots={PDR_DOTS}
              labels={PDR_LABELS}
              size="small"
              {...{ 'value.format': (v: number) => `${Math.round(v * 100)} %` }}
              {...edit(paramIds.pdr)}
            />
          </WithInfo>
        </div>
        <div className="lower">
          <WithInfo title={compressorInfo.knee}>
            <Knob
              label="Knee"
              value$={host.knee$}
              min={0}
              max={24}
              reset={compressorParamDefault('knee')}
              dots={KNEE_DOTS}
              labels={KNEE_LABELS}
              {...edit(paramIds.knee)}
              size="small"
            />
          </WithInfo>
          <WithInfo title={compressorInfo.makeup}>
            <Knob
              label="Makeup"
              value$={host.makeup$}
              min={0}
              max={24}
              reset={compressorParamDefault('makeup')}
              base={0}
              dots={MAKEUP_DOTS}
              labels={MAKEUP_LABELS}
              size="small"
              {...edit(paramIds.makeup)}
            />
          </WithInfo>
          <WithInfo title={compressorInfo.mix}>
            <Knob
              label="Mix"
              size="small"
              value$={host.mix$}
              min={0}
              max={1}
              reset={compressorParamDefault('mix')}
              dots={MIX_DOTS}
              labels={MIX_LABELS}
              {...{ 'value.format': (v: number) => `${Math.round(v * 100)} %` }}
              {...edit(paramIds.mix)}
            />
          </WithInfo>
        </div>
      </div>

      <div className="block chart">
        <div className="title">Transfer</div>
        <WithInfo title={compressorInfo.gr}>
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
        </WithInfo>
        <DynamicsChart
          threshold$={host.threshold$}
          ratio$={host.ratio$}
          makeup$={host.makeup$}
          knee$={host.knee$}
          point$={host.point$}
          beginEdit={() => {
            host.beginEdit(paramIds.threshold);
            host.beginEdit(paramIds.ratio);
          }}
          endEdit={() => {
            host.endEdit(paramIds.threshold);
            host.endEdit(paramIds.ratio);
          }}
        />
      </div>
    </div>
  );
}
