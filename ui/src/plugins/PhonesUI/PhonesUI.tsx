import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import { Header } from '../../components';
import { Knob, PhonesPlan, Toggle, WithInfo } from '../../widgets';
import { paramIds } from '../../generated/phonesModel';
import { phonesParamDefault, type IPhonesHost } from '../../host/phonesHost';
import { phonesInfo } from './phonesInfo';
import '../PluginUI.scss';
import './PhonesUI.scss';

export interface PhonesUIProps {
  host: IPhonesHost;
}

const MIX_DOTS = [0, 0.25, 0.5, 0.75, 1];
const MIX_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.25, label: '25' },
  { pos: 0.5, label: '50' },
  { pos: 0.75, label: '75' },
  { pos: 1, label: '100' },
];

const ANGLE_DOTS = [20, 25, 30, 35, 40, 45];
const ANGLE_LABELS = [
  { pos: 20, label: '±20' },
  { pos: 25, label: '±25' },
  { pos: 30, label: '±30' },
  { pos: 35, label: '±35' },
  { pos: 40, label: '±40' },
  { pos: 45, label: '±45' },
];

const DISTANCE_DOTS = [0.5, 1.2, 2, 3, 4];
const DISTANCE_LABELS = [
  { pos: 0.5, label: '0.5' },
  { pos: 1.2, label: '1.2' },
  { pos: 2, label: '2' },
  { pos: 3, label: '3' },
  { pos: 4, label: '4' },
];

function formatMix(v: number): string {
  return `${Math.round(v * 100)}`;
}

function formatAngle(v: number): string {
  return `±${v.toFixed(0)}`;
}

function formatDistance(v: number): string {
  return v.toFixed(2);
}

export function PhonesUI({ host }: PhonesUIProps) {
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });
  const angle = useDynamicValueReadonly(
    host.angle$,
    phonesParamDefault('angle', 30),
  );
  const distance = useDynamicValueReadonly(
    host.distance$,
    phonesParamDefault('distance', 1.2),
  );
  const live = useDynamicValueReadonly(
    host.live$,
    phonesParamDefault('live', 0.25),
  );
  const room = useDynamicValueReadonly(
    host.room$,
    phonesParamDefault('room', 0.5),
  );
  const scatter = useDynamicValueReadonly(
    host.scatter$,
    phonesParamDefault('scatter', 0.4),
  );

  return (
    <div className="PhonesUI PluginUI">
      <Header title="Phones">
        <WithInfo title={phonesInfo.mono}>
          <Toggle state$={host.mono$} icon="stereo" icon_active="mono" />
        </WithInfo>
        <WithInfo title={phonesInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
      </Header>

      <div className="block plan">
        <div className="title">Plan</div>
        <WithInfo title={phonesInfo.plan} className="plan">
          <PhonesPlan
            angle={angle}
            distance={distance}
            live={live}
            room={room}
            scatter={scatter}
            onAngle={(v) => host.angle$.set(v)}
            onDistance={(v) => host.distance$.set(v)}
            beginAngle={() => host.beginEdit(paramIds.angle)}
            endAngle={() => host.endEdit(paramIds.angle)}
            beginDistance={() => host.beginEdit(paramIds.distance)}
            endDistance={() => host.endEdit(paramIds.distance)}
          />
        </WithInfo>
      </div>

      <div className="block triangle">
        <div className="title">Triangle</div>
        <WithInfo title={phonesInfo.amount}>
          <Knob
            label="Amount"
            value$={host.amount$}
            min={0}
            max={1}
            reset={phonesParamDefault('amount', 1)}
            dots={MIX_DOTS}
            labels={MIX_LABELS}
            size="huge"
            {...{ 'value.format': formatMix }}
            {...edit(paramIds.amount)}
          />
        </WithInfo>
        <div className="container">
          <WithInfo title={phonesInfo.angle}>
            <Knob
              label="Angle"
              value$={host.angle$}
              min={20}
              max={45}
              reset={phonesParamDefault('angle', 30)}
              dots={ANGLE_DOTS}
              labels={ANGLE_LABELS}
              size="medium"
              {...{ 'value.format': formatAngle }}
              {...edit(paramIds.angle)}
            />
          </WithInfo>
          <WithInfo title={phonesInfo.distance}>
            <Knob
              label="Distance"
              value$={host.distance$}
              min={0.5}
              max={4}
              reset={phonesParamDefault('distance', 1.2)}
              dots={DISTANCE_DOTS}
              labels={DISTANCE_LABELS}
              size="medium"
              {...{ 'value.format': formatDistance }}
              {...edit(paramIds.distance)}
            />
          </WithInfo>
        </div>
      </div>
      <div className="block room">
        <div className="title">Room</div>
        <WithInfo title={phonesInfo.room}>
          <Knob
            label="Room"
            value$={host.room$}
            min={0}
            max={1}
            reset={phonesParamDefault('room', 0.5)}
            dots={MIX_DOTS}
            labels={MIX_LABELS}
            size="medium"
            {...{ 'value.format': formatMix }}
            {...edit(paramIds.room)}
          />
        </WithInfo>
        <WithInfo title={phonesInfo.live}>
          <Knob
            label="Live"
            value$={host.live$}
            min={0}
            max={1}
            reset={phonesParamDefault('live', 0.25)}
            dots={MIX_DOTS}
            labels={MIX_LABELS}
            size="medium"
            {...{ 'value.format': formatMix }}
            {...edit(paramIds.live)}
          />
        </WithInfo>
        <WithInfo title={phonesInfo.scatter}>
          <Knob
            label="Scatter"
            value$={host.scatter$}
            min={0}
            max={1}
            reset={phonesParamDefault('scatter', 0.4)}
            dots={MIX_DOTS}
            labels={MIX_LABELS}
            size="medium"
            {...{ 'value.format': formatMix }}
            {...edit(paramIds.scatter)}
          />
        </WithInfo>
      </div>
    </div>
  );
}
