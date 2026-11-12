import { useDynamicValueReadonly } from '@deutschesoft/use-aux-widgets';
import {
  Buttons,
  CorrelationMeter,
  GonioMeter,
  Knob,
  Toggle,
  WithInfo,
} from '../../widgets';
import {
  ELLIPTIC_SLOPE_ENTRIES,
  ellipticParamDefault,
  type IEllipticHost,
} from '../../host/ellipticHost';
import { paramIds } from '../../generated/ellipticModel';
import { Header } from '../../components';
import { ellipticInfo } from './ellipticInfo';
import '../PluginUI.scss';
import './EllipticUI.scss';

export interface EllipticUIProps {
  host: IEllipticHost;
}

const FREQ_DOTS = [30, 40, 50, 60, 80, 100, 120, 150, 200];
const FREQ_LABELS = [
  { pos: 30, label: '30' },
  { pos: 40, label: '40' },
  { pos: 50, label: '50' },
  { pos: 60, label: '60' },
  { pos: 80, label: '80' },
  { pos: 100, label: '100' },
  { pos: 120, label: '120' },
  { pos: 150, label: '150' },
  { pos: 200, label: '200' },
];

const AMOUNT_DOTS = [0, 0.25, 0.5, 0.75, 1];
const AMOUNT_LABELS = [
  { pos: 0, label: '0' },
  { pos: 0.25, label: '25' },
  { pos: 0.5, label: '50' },
  { pos: 0.75, label: '75' },
  { pos: 1, label: '100' },
];

function formatAmount(v: number): string {
  return `${Math.round(v * 100)}`;
}

export function EllipticUI(props: EllipticUIProps) {
  const { host } = props;
  const slope = useDynamicValueReadonly(
    host.slope$,
    ellipticParamDefault('slope', 12),
  );
  const edit = (id: number) => ({
    beginEdit: () => host.beginEdit(id),
    endEdit: () => host.endEdit(id),
  });

  return (
    <div className="EllipticUI PluginUI">
      <Header title="Elliptic">
        <WithInfo title={ellipticInfo.bypass}>
          <Toggle state$={host.bypass$} icon="bypass" className="bypass" />
        </WithInfo>
        <WithInfo title={ellipticInfo.listen}>
          <Toggle state$={host.listen$} icon="headphones" className="warn" />
        </WithInfo>
      </Header>

      <div className="block controls">
        <div className="title">Bass</div>
        <WithInfo title={ellipticInfo.freq}>
          <Knob
            label="Frequency"
            size="huge"
            value$={host.freq$}
            min={30}
            max={200}
            reset={ellipticParamDefault('freq')}
            scale="frequency"
            dots={FREQ_DOTS}
            labels={FREQ_LABELS}
            {...edit(paramIds.freq)}
          />
        </WithInfo>
        <WithInfo title={ellipticInfo.slope} className="slope">
          <Buttons
            layout="vertical"
            entries={ELLIPTIC_SLOPE_ENTRIES}
            value={slope}
            onChange={(v) => {
              host.beginEdit(paramIds.slope);
              host.slope$.set(v);
              host.endEdit(paramIds.slope);
            }}
          />
        </WithInfo>
        <WithInfo title={ellipticInfo.amount}>
          <Knob
            label="Amount"
            size="huge"
            value$={host.amount$}
            min={0}
            max={1}
            reset={ellipticParamDefault('amount')}
            dots={AMOUNT_DOTS}
            labels={AMOUNT_LABELS}
            {...{ 'value.format': formatAmount }}
            {...edit(paramIds.amount)}
          />
        </WithInfo>
      </div>

      <div className="block field">
        <div className="title">Field</div>
        <WithInfo title={ellipticInfo.gonio}>
          <GonioMeter samples$={host.gonio$} />
        </WithInfo>
        <WithInfo title={ellipticInfo.corr}>
          <CorrelationMeter value$={host.corr$} />
        </WithInfo>
      </div>
    </div>
  );
}
