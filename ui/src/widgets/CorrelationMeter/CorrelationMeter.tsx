import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { PhaseMeter as AuxPhaseMeter } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import { useThemeColors } from '../../theme/themeColors';
import './CorrelationMeter.scss';

const CorrelationMeterBindings = {
  value$: { name: 'value' },
};

const CorrelationMeterOptions = {
  gap_labels: 20,
  gap_dots: 10,
  levels: [0.1, 0.5, 1],
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
  const colors = useThemeColors();
  const cls = ['CorrelationMeter', className ?? ''].filter(Boolean).join(' ');
  return (
    <CorrelationMeterWidget
      className={cls}
      foreground={colors.background}
      gradient={[
        { value: -1, color: colors.hot },
        { value: 0, color: colors.warn },
        { value: 0, color: colors.accent },
        { value: 1, color: colors.accent },
      ]}
      {...rest}
    />
  );
}
