import React from 'react';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { Fader as AuxFader } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import { composeInteractingOnSet, type AuxOnSet } from '../editGesture';
import './Fader.scss';

const FaderBindings = {
  value$: { name: 'value', sync: true },
  active$: { name: 'active' },
};

const FaderOptions = {
  'scale.labels': (v: number) => v.toFixed(0),
  gap_labels: 20,
  gap_dots: 20,
  levels: [1, 2, 6],
  show_value: true,
  'value.format': (v: number) => v.toFixed(1),
};

const FaderWidget = componentFromWidget(
  AuxFader,
  FaderBindings,
  FaderOptions,
  'Fader',
);

export interface FaderProps {
  size?: 'small' | 'normal';
  value$?: DynamicValue<number>;
  /** VST3 beginEdit — called when the user starts interacting. */
  beginEdit?: () => void;
  /** VST3 endEdit — called when the user stops interacting. */
  endEdit?: () => void;
  onSet?: AuxOnSet;
  [key: string]: unknown;
}

export function Fader(props: FaderProps) {
  const { size = 'normal', beginEdit, endEdit, onSet, ...rest } = props;

  const composedOnSet = React.useMemo(
    () => composeInteractingOnSet({ beginEdit, endEdit }, onSet),
    [beginEdit, endEdit, onSet],
  );

  // Never pass onSet=undefined — use-aux-widgets treats any `on*` prop as an event.
  const options =
    size === 'small'
      ? {
          show_value: false,
          label: false,
          ...rest,
          ...(composedOnSet ? { onSet: composedOnSet } : {}),
        }
      : {
          show_value: rest.show_value,
          label: rest.label,
          ...rest,
          ...(composedOnSet ? { onSet: composedOnSet } : {}),
        };

  const className = React.useMemo(() => {
    const cls: string[] = [size];
    return cls.join(' ');
  }, [size]);

  return <FaderWidget className={className} {...options} />;
}
