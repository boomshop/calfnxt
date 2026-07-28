import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { PhaseMeter as AuxPhaseMeter } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import './CorrelationMeter.scss';

const CorrelationMeterBindings = {
  value$: { name: 'value' },
};

const CorrelationMeterOptions = {
  min: -1,
  max: 1,
  base: 0,
  value: 0,
  show_clip: false,
  show_hold: false,
  label: false,
  show_value: false,
  layout: 'top',
  falling: 0,
  foreground: '#000000',
  gradient: [
    { value: -1, color: '#ff0066' },
    { value: 0, color: '#ff0066' },
    { value: 0, color: '#0066ff' },
    { value: 1, color: '#0066ff' },
  ],
};

const CorrelationMeterWidget = componentFromWidget(
  AuxPhaseMeter,
  CorrelationMeterBindings,
  CorrelationMeterOptions,
  'CorrelationMeter',
);

export interface CorrelationMeterProps {
  value$?: DynamicValue<number>;
  className?: string;
  [key: string]: unknown;
}

export function CorrelationMeter(props: CorrelationMeterProps) {
  const { className, ...rest } = props;
  const cls = ['CorrelationMeter', className ?? ''].filter(Boolean).join(' ');
  return <CorrelationMeterWidget className={cls} {...rest} />;
}
