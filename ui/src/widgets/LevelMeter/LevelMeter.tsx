import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { LevelMeter as AuxLevelMeter } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import './LevelMeter.scss';

const LevelMeterBindings = {
  value$: { name: 'value' },
};

/**
 * paint_mode=inverse (AUX default):
 * - gradient = visible meter fill
 * - foreground = mask (= page background)
 *
 * WebEditor defaults WebKit HW accel to ALWAYS; set CALFNXT_WEB_NO_GPU=1 for software.
 */
const LevelMeterOptions = {
  'scale.labels': (v: number) => v.toFixed(0),
  gap_labels: 20,
  gap_dots: 5,
  levels: [3, 6, 12],
  show_clip: false,
  label: false,
  min: -96,
  max: 12,
  value: -96,
  falling: 10,
  falling_duration: 1000,
  falling_init: 50,
  segment: 1,
  show_hold: true,
  hold_size: 3,
  auto_hold: 2000,
  layout: 'right',
  show_scale: true,
  show_value: false,
  scale: 'linear',
  foreground: '#000000',
  gradient: [
    { value: -96, color: '#0066ff' },
    { value: 0, color: '#ff0066' },
    { value: 12, color: '#ff6600' },
  ],
};

const LevelMeterWidget = componentFromWidget(
  AuxLevelMeter,
  LevelMeterBindings,
  LevelMeterOptions,
  'LevelMeter',
);

export interface LevelMeterProps {
  size?: 'small' | 'normal';
  value$?: DynamicValue<number>;
  [key: string]: unknown;
}

export function LevelMeter(props: LevelMeterProps) {
  const { size = 'normal', ...rest } = props;

  const options =
    size === 'small'
      ? { show_scale: false, label: false, hold_size: 2, ...rest }
      : { show_scale: rest.show_scale !== false, ...rest };

  return <LevelMeterWidget className={size} {...options} />;
}
