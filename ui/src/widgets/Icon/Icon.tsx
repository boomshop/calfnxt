import { Icon as AuxIcon } from '@deutschesoft/aux-widgets/src/widgets/icon.js';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import type { CSSProperties } from 'react';
import './Icon.scss';

const IconWidget = componentFromWidget(AuxIcon, {}, { auto_size: true }, 'Icon');

export interface IconProps {
  /** AUX icon id (e.g. `parametric`, `highpass`). */
  icon?: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
  [key: string]: unknown;
}

export function Icon(props: IconProps) {
  const { size = 24, style, ...rest } = props;
  return (
    <IconWidget
      {...rest}
      style={{ ['--aux-icon-size' as string]: `${size}px`, ...style }}
    />
  );
}
