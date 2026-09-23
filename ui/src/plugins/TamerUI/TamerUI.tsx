import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { Header } from '../../components';
import {
  Buttons,
  Knob,
  Select,
  TamerChart,
  Toggle,
  WithInfo,
} from '../../widgets';
import { paramIds } from '../../generated/tamerModel';
import {
  TAMER_QUALITY_ENTRIES,
  TAMER_SLOPE_ENTRIES,
  TAMER_SPECTRUM_ENTRIES,
  tamerParamDefault,
  type ITamerHost,
} from '../../host/tamerHost';
import { tamerInfo } from './tamerInfo';
import '../PluginUI.scss';
import './TamerUI.scss';

export interface TamerUIProps {
  host: ITamerHost;
}

const DEPTH_DOTS = [0, 1, 2, 3, 6, 9, 12, 18, 24];
const DEPTH_LABELS = [
  { pos: 0, label: '0' },
  { pos: 1, label: '1' },
  { pos: 2, label: '2' },
  { pos: 3, label: '3' },
  { pos: 6, label: '6' },
  { pos: 9, label: '9' },
  { pos: 12, label: '12' },
  { pos: 18, label: '18' },
  { pos: 24, label: '24' },
];

const SHARP_DOTS = [1 / 24, 1 / 12, 1 / 6, 1 / 3, 0.5];
const SHARP_LABELS = [
  { pos: 1 / 24, label: '1/24' },
  { pos: 1 / 12, label: '1/12' },
  { pos: 1 / 6, label: '1/6' },
  { pos: 1 / 3, label: '1/3' },
  { pos: 0.5, label: '½' },
];

const THRESH_DOTS = [0, 6, 12, 18, 24];
const THRESH_LABELS = THRESH_DOTS.map((n) => ({ pos: n, label: String(n) }));

const FREQ_DOTS = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
const FREQ_LABELS = [
  { pos: 20, label: '20' },
  { pos: 100, label: '100' },
  { pos: 1000, label: '1k' },
  { pos: 10000, label: '10k' },
  { pos: 20000, label: '20k' },
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

function formatOct(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '—';
  const inv = 1 / v;
  const nearest = [24, 12, 6, 3, 2].find((d) => Math.abs(inv - d) < 0.15 * d);
  if (nearest) return `1/${nearest} oct`;
  return `${v.toFixed(3)} oct`;
}

export function TamerUI(props: TamerUIProps) {
  const { host } = props;
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });

  const quality = Math.round(useDynamicValueReadonly(host.quality$, 1));
  const spectrum = Math.round(useDynamicValueReadonly(host.spectrum$, 1));
  const depth = useDynamicValueReadonly(
    host.depth$,
    tamerParamDefault('depth'),
  );
  const depthDrive = depth > 12;

  return (
    <div className="TamerUI PluginUI">
      <Header title="Tamer">
        <WithInfo title={tamerInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
        <WithInfo title={tamerInfo.diffListen}>
          <Toggle
            state$={host.diffListen$}
            icon="headphones"
            className="warn"
          />
        </WithInfo>
      </Header>

      <TamerChart
        spectrum$={host.spectrumData$}
        gr$={host.grResponse$}
        ladder$={host.ladder$}
        spectrumTilt={spectrum}
        fLo$={host.fLo$}
        fHi$={host.fHi$}
        hpSlope$={host.hpSlope$}
        lpSlope$={host.lpSlope$}
        fLoEdit={edit(paramIds.f_lo)}
        fHiEdit={edit(paramIds.f_hi)}
      />

      <div className="block quality">
        <div className="title">Quality</div>
        <WithInfo title={tamerInfo.quality} className="info-block">
          <Buttons
            layout="horizontal"
            entries={[...TAMER_QUALITY_ENTRIES]}
            value={quality}
            onChange={(v) => {
              host.beginEdit(paramIds.quality);
              host.quality$.set(v as number);
              host.endEdit(paramIds.quality);
            }}
          />
        </WithInfo>
      </div>

      <div className="block tilt">
        <div className="title">Tilt</div>
        <WithInfo title={tamerInfo.spectrum} className="info-block">
          <Buttons
            layout="horizontal"
            entries={[...TAMER_SPECTRUM_ENTRIES]}
            value={spectrum}
            onChange={(v) => {
              host.beginEdit(paramIds.spectrum);
              host.spectrum$.set(v as number);
              host.endEdit(paramIds.spectrum);
            }}
          />
        </WithInfo>
      </div>

      <div className="block search">
        <div className="title">Search</div>
        <WithInfo title={tamerInfo.fLo}>
          <Knob
            label="Low"
            value$={host.fLo$}
            min={20}
            max={20000}
            reset={tamerParamDefault('f_lo')}
            scale="frequency"
            dots={FREQ_DOTS}
            labels={FREQ_LABELS}
            size="small"
            {...edit(paramIds.f_lo)}
          />
        </WithInfo>
        <WithInfo title={tamerInfo.hpSlope}>
          <Select value$={host.hpSlope$} entries={TAMER_SLOPE_ENTRIES} />
        </WithInfo>
        <WithInfo title={tamerInfo.fHi}>
          <Knob
            label="High"
            value$={host.fHi$}
            min={20}
            max={20000}
            reset={tamerParamDefault('f_hi')}
            scale="frequency"
            dots={FREQ_DOTS}
            labels={FREQ_LABELS}
            size="small"
            {...edit(paramIds.f_hi)}
          />
        </WithInfo>
        <WithInfo title={tamerInfo.lpSlope}>
          <Select value$={host.lpSlope$} entries={TAMER_SLOPE_ENTRIES} />
        </WithInfo>
      </div>

      <div className="block process">
        <div className="title">Process</div>
        <div className="thresh-harm">
          <WithInfo title={tamerInfo.threshold}>
            <Knob
              label="Threshold"
              value$={host.threshold$}
              min={0}
              max={24}
              reset={tamerParamDefault('threshold')}
              dots={THRESH_DOTS}
              labels={THRESH_LABELS}
              size="medium"
              scale="log2"
              log_factor={2}
              {...edit(paramIds.threshold)}
            />
          </WithInfo>
          <WithInfo title={tamerInfo.harmonics}>
            <Knob
              label="Harmonics"
              value$={host.harmonics$}
              min={0}
              max={1}
              reset={tamerParamDefault('harmonics')}
              dots={[0, 0.25, 0.5, 0.75, 1]}
              labels={[
                { pos: 0, label: '0' },
                { pos: 0.25, label: '25' },
                { pos: 0.5, label: '50' },
                { pos: 0.75, label: '75' },
                { pos: 1, label: '100' },
              ]}
              size="medium"
              {...{ 'value.format': (v: number) => `${Math.round(v * 100)}` }}
              {...edit(paramIds.harmonics)}
            />
          </WithInfo>
        </div>
        <WithInfo title={tamerInfo.depth}>
          <Knob
            label="Depth"
            value$={host.depth$}
            min={0}
            max={24}
            reset={tamerParamDefault('depth')}
            scale="log2"
            log_factor={4}
            dots={DEPTH_DOTS}
            labels={DEPTH_LABELS}
            size="huge"
            className={depthDrive ? 'warn' : undefined}
            {...edit(paramIds.depth)}
          />
        </WithInfo>
        <WithInfo title={tamerInfo.sharpness}>
          <Knob
            label="Sharpness"
            value$={host.sharpness$}
            min={1 / 24}
            max={0.5}
            reset={tamerParamDefault('sharpness')}
            scale="log2"
            log_factor={3}
            dots={SHARP_DOTS}
            labels={SHARP_LABELS}
            size="large"
            {...{ 'value.format': formatOct }}
            {...edit(paramIds.sharpness)}
          />
        </WithInfo>
      </div>

      <div className="block timing">
        <div className="title">Timing</div>
        <WithInfo title={tamerInfo.attack}>
          <Knob
            label="Attack"
            value$={host.attack$}
            min={0.1}
            max={500}
            reset={tamerParamDefault('attack')}
            scale="log2"
            log_factor={4}
            dots={ATTACK_DOTS}
            labels={ATTACK_LABELS}
            size="medium"
            {...{ 'value.format': (v: number) => `${v.toFixed(1)}` }}
            {...edit(paramIds.attack)}
          />
        </WithInfo>
        <WithInfo title={tamerInfo.release}>
          <Knob
            label="Release"
            value$={host.release$}
            min={1}
            max={2000}
            reset={tamerParamDefault('release')}
            scale="log2"
            log_factor={4}
            dots={RELEASE_DOTS}
            labels={RELEASE_LABELS}
            size="medium"
            {...{ 'value.format': (v: number) => `${v.toFixed(0)}` }}
            {...edit(paramIds.release)}
          />
        </WithInfo>
      </div>
    </div>
  );
}
