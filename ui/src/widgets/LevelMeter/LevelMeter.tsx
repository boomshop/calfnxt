import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { LevelMeter as AuxLevelMeter } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import {
  meterGradientForRange,
  useThemeColors,
  type MeterScaleOpts,
} from '../../theme/themeColors';
import './LevelMeter.scss';

const LevelMeterBindings = {
  value$: { name: 'value' },
  base$: { name: 'base' },
  top$: { name: 'top' },
  bottom$: { name: 'bottom' },
};

/**
 * paint_mode=inverse (AUX default):
 * - gradient = visible meter fill
 * - foreground = mask for empty regions (`--background`, page surface)
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

function scaleOptsFromProps(props: {
  scale?: unknown;
  log_factor?: unknown;
}): MeterScaleOpts {
  return {
    scale: typeof props.scale === 'string' ? props.scale : 'linear',
    log_factor:
      typeof props.log_factor === 'number' ? props.log_factor : 1,
  };
}

export function LevelMeter(props: LevelMeterProps) {
  const {
    size = 'normal',
    foreground,
    gradient,
    min,
    max,
    scale,
    log_factor,
    ...rest
  } = props;
  const colors = useThemeColors();

  const lo = typeof min === 'number' ? min : -96;
  const hi = typeof max === 'number' ? max : 12;
  const scaleOpts = scaleOptsFromProps({ scale, log_factor });

  const themed = {
    min: lo,
    max: hi,
    scale: scaleOpts.scale,
    log_factor: scaleOpts.log_factor,
    foreground: (foreground as string | undefined) ?? colors.background,
    gradient:
      (gradient as unknown) ??
      meterGradientForRange(colors, lo, hi, scaleOpts),
  };

  const options =
    size === 'small'
      ? { show_scale: false, label: false, hold_size: 2, ...themed, ...rest }
      : { show_scale: rest.show_scale !== false, ...themed, ...rest };

  return <LevelMeterWidget className={size} {...options} />;
}
