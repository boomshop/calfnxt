import { useEffect, useState } from 'react';
import type { DynamicValue } from '@deutschesoft/awml';
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

function useDynamicValue<T>(dv: DynamicValue<T>): T {
  const [v, setV] = useState(() => dv.value);
  useEffect(() => dv.subscribe(setV), [dv]);
  return v;
}

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

export function StereoUI(props: StereoUIProps) {
  const { host } = props;
  const mode = useDynamicValue(host.mode$);
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
          {...edit(paramIds.level_l)}
        />
        <Knob
          label={bus.beforeMode[1]}
          value$={host.levelR$}
          min={-36}
          max={36}
          base={0}
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
              {...edit(paramIds.mlev)}
            />
            <Knob
              label="M Pan"
              size="small"
              value$={host.mpan$}
              min={-1}
              max={1}
              base={0}
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
              {...edit(paramIds.slev)}
            />
            <Knob
              label="S Bal"
              size="small"
              value$={host.sbal$}
              min={-1}
              max={1}
              base={0}
              {...edit(paramIds.sbal)}
            />
          </div>
          <Toggle state$={host.decorr$} label="Decorr" />
          <Knob
            label="Amount"
            size="small"
            value$={host.decorrAmount$}
            min={0}
            max={1}
            {...edit(paramIds.decorr_amount)}
            disabled={host.decorr$}
          />
          <Knob
            label="Xover"
            size="small"
            value$={host.decorrXover$}
            min={80}
            max={2000}
            scale="frequency"
            {...edit(paramIds.decorr_xover)}
            disabled={host.decorr$}
          />
          <Knob
            label="Slope"
            size="small"
            value$={host.decorrSlope$}
            min={12}
            max={48}
            {...{
              'value.format': (v: number) =>
                v < 18 ? '12' : v >= 36 ? '48' : '24',
            }}
            {...edit(paramIds.decorr_slope)}
            disabled={host.decorr$}
          />
          <Knob
            label="Stages"
            size="small"
            value$={host.decorrStages$}
            min={1}
            max={8}
            {...edit(paramIds.decorr_stages)}
            disabled={host.decorr$}
          />
          <Knob
            label="Spread"
            size="small"
            value$={host.decorrSpread$}
            min={0}
            max={1}
            {...edit(paramIds.decorr_spread)}
            disabled={host.decorr$}
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
          {...edit(paramIds.stereo_base)}
        />
        <Knob
          label="Phase"
          size="small"
          value$={host.stereoPhase$}
          min={0}
          max={360}
          {...edit(paramIds.stereo_phase)}
        />
      </div>

      <Bus pair={bus.afterMode} />

      <div className="block out">
        <div className="title">Out</div>
        <Knob
          label="Balance"
          size="small"
          value$={host.balanceOut$}
          min={-1}
          max={1}
          base={0}
          {...edit(paramIds.balance_out)}
        />
        <Goniometer samples$={host.gonio$} />
        <CorrelationMeter value$={host.corr$} />
      </div>
    </div>
  );
}
