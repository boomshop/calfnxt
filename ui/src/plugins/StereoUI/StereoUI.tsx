import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import {
  Knob,
  Buttons,
  Toggle,
  CorrelationMeter,
  Goniometer,
} from '../../widgets';
import {
  STEREO_MODE_ENTRIES,
  stereoBusFormats,
  type IStereoHost,
  type StereoBusPair,
} from '../../host/stereoHost';
import { paramIds } from '../../generated/stereoModel';
import { Header } from '../../components';
import '../PluginUI.scss';
import './StereoUI.scss';

export interface StereoUIProps {
  host: IStereoHost;
}

/** Ring ticks / labels for Stereo knobs (Circular `labels` / `dots`). */
const DB36_DOTS = [-36, -30, -24, -18, -12, -6, 0, 6, 12, 18, 24, 30, 36];
const DB36_LABELS = [
  { pos: -36, label: '−36' },
  { pos: 0, label: '0' },
  { pos: 36, label: '+36' },
];

const UNIT_DOTS = [-1, -0.5, 0, 0.5, 1];
const UNIT_LABELS = [
  { pos: -1, label: '−1' },
  { pos: -0.5, label: '−.5' },
  { pos: 0, label: '0' },
  { pos: 0.5, label: '.5' },
  { pos: 1, label: '+1' },
];

const UNIT01_DOTS = [0, 0.25, 0.5, 0.75, 1];
const UNIT01_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.25, label: '.25' },
  { pos: 0.5, label: '.5' },
  { pos: 0.75, label: '.75' },
  { pos: 1, label: '1' },
];

const BALANCE_LABELS = [
  { pos: -1, label: 'L' },
  { pos: 0, label: 'C' },
  { pos: 1, label: 'R' },
];

const XOVER_DOTS = [80, 200, 400, 800, 2000];
const XOVER_LABELS = [
  { pos: 80, label: '80' },
  { pos: 200, label: '200' },
  { pos: 400, label: '400' },
  { pos: 800, label: '800' },
  { pos: 2000, label: '2k' },
];

const STAGES_DOTS = [1, 2, 3, 4, 5, 6, 7, 8];
const STAGES_LABELS = STAGES_DOTS.map((n) => ({ pos: n, label: String(n) }));

const SLOPE_DOTS = [12, 24, 48];
const SLOPE_LABELS = [
  { pos: 12, label: '12' },
  { pos: 24, label: '24' },
  { pos: 48, label: '48' },
];

const PHASE_DOTS = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360];
const PHASE_LABELS = [
  { pos: 0, label: '0' },
  { pos: 60, label: '60' },
  { pos: 120, label: '120' },
  { pos: 180, label: '180' },
  { pos: 240, label: '240' },
  { pos: 300, label: '300' },
  { pos: 360, label: '360' },
];

const DELAY_DOTS = [-20, -15, -10, -5, 0, 5, 10, 15, 20];
const DELAY_LABELS = [
  { pos: -20, label: '−20' },
  { pos: -10, label: '−10' },
  { pos: 0, label: '0' },
  { pos: 10, label: '10' },
  { pos: 20, label: '+20' },
];


function Bus({ pair }: { pair: StereoBusPair }) {
  return (
    <div className="bus">
      <span>{pair[0]}</span>
      <span>{pair[1]}</span>
    </div>
  );
}

function formatDelayMs(v: number, lanes: StereoBusPair): string {
  if (Math.abs(v) < 0.005) return '0.00';
  // Positive delays the second bus lane (R/S/…), negative the first (L/M/…).
  return v > 0
    ? `${lanes[1]} ${v.toFixed(2)}`
    : `${lanes[0]} ${(-v).toFixed(2)}`;
}

function formatBalance(v: number): string {
  if (Math.abs(v) < 0.005) return 'C';
  return v < 0 ? `L ${(-v).toFixed(2)}` : `R ${v.toFixed(2)}`;
}

function snapSlopeDb(v: number): number {
  if (v < 18) return 12;
  if (v >= 36) return 48;
  return 24;
}

export function StereoUI(props: StereoUIProps) {
  const { host } = props;
  const mode = useDynamicValueReadonly(host.mode$, 0);
  const bus = stereoBusFormats(mode);
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });

  return (
    <div className="StereoUI PluginUI">
      <Header title="Stereo">
        <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
      </Header>

      <div className="block mode">
        <div className="title">Mode</div>
        <Buttons
          layout="vertical"
          entries={STEREO_MODE_ENTRIES}
          value={mode}
          onChange={(v) => {
            host.beginEdit(paramIds.mode);
            host.mode$.set(v);
            host.endEdit(paramIds.mode);
          }}
        />
      </div>

      {/* Input format expected by the plugin (trim targets for In). */}
      <Bus pair={bus.beforeMode} />

      <div className="block in">
        <div className="title">In</div>
        <Knob
          label={bus.beforeMode[0]}
          value$={host.levelL$}
          min={-36}
          max={36}
          base={0}
          dots={DB36_DOTS}
          labels={DB36_LABELS}
          {...edit(paramIds.level_l)}
        />
        <Knob
          label={bus.beforeMode[1]}
          value$={host.levelR$}
          min={-36}
          max={36}
          base={0}
          dots={DB36_DOTS}
          labels={DB36_LABELS}
          {...edit(paramIds.level_r)}
        />
      </div>

      {/* Format after the mode matrix (DSP: levels → mode → …). */}
      <Bus pair={bus.afterMode} />

      <div className="block ms">
        <div className="title">M/S</div>
        <div className="mid lane">
          <div className="label">M</div>{' '}
          <div className="controls">
            <Knob
              label="M Lev"
              size="small"
              value$={host.mlev$}
              min={-36}
              max={36}
              base={0}
              dots={DB36_DOTS}
              labels={DB36_LABELS}
              {...edit(paramIds.mlev)}
            />
            <Knob
              label="M Pan"
              size="small"
              value$={host.mpan$}
              min={-1}
              max={1}
              base={0}
              dots={UNIT_DOTS}
              labels={BALANCE_LABELS}
              {...{ 'value.format': formatBalance }}
              {...edit(paramIds.mpan)}
            />
          </div>
        </div>
        <div className="side lane">
          <div className="label">S</div>
          <div className="controls">
            <Knob
              label="S Lev"
              size="small"
              value$={host.slev$}
              min={-36}
              max={36}
              base={0}
              dots={DB36_DOTS}
              labels={DB36_LABELS}
              {...edit(paramIds.slev)}
            />
            <Knob
              label="S Bal"
              size="small"
              value$={host.sbal$}
              min={-1}
              max={1}
              base={0}
              dots={UNIT_DOTS}
              labels={BALANCE_LABELS}
              {...{ 'value.format': formatBalance }}
              {...edit(paramIds.sbal)}
            />
          </div>
        </div>
        <div className="decorr">
          <Toggle state$={host.decorr$} label="Decorr" />
          <Knob
            label="Amount"
            size="small"
            value$={host.decorrAmount$}
            min={0}
            max={1}
            dots={UNIT01_DOTS}
            labels={UNIT01_LABELS}
            {...edit(paramIds.decorr_amount)}
            active$={host.decorr$}
          />
          <Knob
            label="Xover"
            size="small"
            value$={host.decorrXover$}
            min={80}
            max={2000}
            scale="frequency"
            dots={XOVER_DOTS}
            labels={XOVER_LABELS}
            {...edit(paramIds.decorr_xover)}
            active$={host.decorr$}
          />
          <Knob
            label="Slope"
            size="small"
            value$={host.decorrSlope$}
            min={12}
            max={48}
            snap={[12, 24, 48]}
            dots={SLOPE_DOTS}
            labels={SLOPE_LABELS}
            {...{
              'value.format': (v: number) => `${snapSlopeDb(v)} dB`,
            }}
            {...edit(paramIds.decorr_slope)}
            active$={host.decorr$}
            scale="log2"
            log_factor={2}
          />
          <Knob
            label="Stages"
            size="small"
            value$={host.decorrStages$}
            min={1}
            max={8}
            snap={1}
            dots={STAGES_DOTS}
            labels={STAGES_LABELS}
            {...{ 'value.format': (v: number) => v.toFixed(0) }}
            {...edit(paramIds.decorr_stages)}
            active$={host.decorr$}
          />
          <Knob
            label="Spread"
            size="small"
            value$={host.decorrSpread$}
            min={0}
            max={1}
            dots={UNIT01_DOTS}
            labels={UNIT01_LABELS}
            {...edit(paramIds.decorr_spread)}
            active$={host.decorr$}
          />
        </div>
      </div>

      <Bus pair={bus.afterMode} />

      <div className="block channels">
        <div className="title">Channels</div>
        <div className="ch">
          <Toggle
            state$={host.muteL$}
            icon="speaker"
            icon_active="mute"
            className="warn"
          />
          <Toggle state$={host.phaseL$} icon="phase" />
        </div>
        <div className="ch">
          <Toggle
            state$={host.muteR$}
            icon="speaker"
            icon_active="mute"
            className="warn"
          />
          <Toggle state$={host.phaseR$} icon="phase" />
        </div>
      </div>

      <Bus pair={bus.afterMode} />

      <div className="block spatial">
        <div className="title">Spatial</div>
        <Knob
          label="Delay"
          size="small"
          value$={host.delay$}
          min={-20}
          max={20}
          base={0}
          dots={DELAY_DOTS}
          labels={DELAY_LABELS}
          {...{
            'value.format': (v: number) => formatDelayMs(v, bus.afterMode),
          }}
          {...edit(paramIds.delay)}
        />
        <Knob
          label="Base"
          size="medium"
          value$={host.stereoBase$}
          min={-1}
          max={1}
          base={0}
          dots={UNIT_DOTS}
          labels={UNIT_LABELS}
          {...edit(paramIds.stereo_base)}
        />
        <Knob
          label="Phase"
          size="small"
          value$={host.stereoPhase$}
          min={0}
          max={360}
          dots={PHASE_DOTS}
          labels={PHASE_LABELS}
          {...edit(paramIds.stereo_phase)}
        />
      </div>

      <Bus pair={bus.afterMode} />

      <div className="block out">
        <div className="title">Out</div>
        <Knob
          label="Balance"
          size="medium"
          value$={host.balanceOut$}
          min={-1}
          max={1}
          base={0}
          dots={UNIT_DOTS}
          labels={BALANCE_LABELS}
          {...{ 'value.format': formatBalance }}
          {...edit(paramIds.balance_out)}
        />
        <Goniometer samples$={host.gonio$} />
        <CorrelationMeter value$={host.corr$} />
      </div>
    </div>
  );
}
