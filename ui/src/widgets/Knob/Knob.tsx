import { useCallback, useEffect, useMemo, useRef } from 'react';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import { ValueKnob as AuxKnob } from '@deutschesoft/aux-widgets/src/index.pure.js';
import type { DynamicValue } from '@deutschesoft/awml';
import { composeInteractingOnSet, type AuxOnSet } from '../editGesture';
import './Knob.scss';

/** AUX Knob size presets (from `@deutschesoft/aux-widgets` Knob options). */
export type KnobPreset = 'tiny' | 'small' | 'medium' | 'large' | 'huge';

const KnobBindings = {
  value$: { name: 'value' },
  active$: { name: 'active' },
  disabled$: { name: 'disabled' },
};

const ringsize = 3;
const handwidth = 3;
const handadd = 4;
const handlength = ringsize + handadd;
const handcorr = 1;

/** Full AUX preset set — local copy so we can tweak without forking AUX. */
const KnobOptions = {
  'value.format': (v: number) => v.toFixed(2),
  show_value: true,
  presets: {
    tiny: {
      margin: 0,
      thickness: ringsize,
      hand: {
        width: handwidth,
        length: handlength,
        margin: 0 - handadd + handcorr,
      },
      dots_defaults: { length: ringsize + handcorr * 2, margin: 0, width: 1 },
      markers_defaults: { thickness: 2, margin: 0 },
      show_labels: false,
    },
    small: {
      margin: 8,
      thickness: ringsize,
      hand: {
        width: handwidth,
        length: handlength,
        margin: 8 - handadd + handcorr,
      },
      dots_defaults: { length: ringsize + handcorr * 2, margin: 8, width: 1 },
      markers_defaults: { thickness: 2, margin: 8 },
      labels_defaults: { margin: 9 },
      show_labels: true,
    },
    medium: {
      margin: 13,
      thickness: ringsize,
      hand: {
        width: handwidth,
        length: handlength,
        margin: 13 - handadd + handcorr,
      },
      dots_defaults: {
        length: ringsize + handcorr * 2,
        margin: 13,
        width: 1,
      },
      markers_defaults: { thickness: 2, margin: 11 },
      show_labels: true,
    },
    large: {
      margin: 13,
      thickness: ringsize,
      hand: {
        width: handwidth,
        length: handlength,
        margin: 13 - handadd + handcorr,
      },
      dots_defaults: {
        length: ringsize + handcorr * 2,
        margin: 13,
        width: 1,
      },
      markers_defaults: { thickness: 2, margin: 11 },
      show_labels: true,
    },
    huge: {
      margin: 13,
      thickness: ringsize,
      hand: {
        width: handwidth,
        length: handlength,
        margin: 13 - handadd + handcorr,
      },
      dots_defaults: {
        length: ringsize + handcorr * 2,
        margin: 13,
        width: 1,
      },
      markers_defaults: { thickness: 2, margin: 11 },
      show_labels: true,
    },
  },
};

const KnobWidget = componentFromWidget(
  AuxKnob,
  KnobBindings,
  KnobOptions,
  'Knob',
);

type AuxKnobInstance = {
  get: (key: string) => unknown;
  subscribe: (event: string, cb: (...args: unknown[]) => void) => () => void;
  isDestructed: () => boolean;
  element: Element;
};

/** base=0 and value above base → CSS hook for boost styling. */
function syncOverClass(knob: AuxKnobInstance) {
  if (knob.isDestructed()) return;
  const base = knob.get('base');
  const value = knob.get('value');
  const over =
    typeof base === 'number' &&
    base === 0 &&
    typeof value === 'number' &&
    value > base;
  knob.element.classList.toggle('over', over);
}

export interface KnobProps {
  size?: KnobPreset;
  className?: string;
  value$?: DynamicValue<number>;
  /** VST3 beginEdit — called when the user starts interacting. */
  beginEdit?: () => void;
  /** VST3 endEdit — called when the user stops interacting. */
  endEdit?: () => void;
  onSet?: AuxOnSet;
  [key: string]: unknown;
}

export function Knob(props: KnobProps) {
  const {
    size = 'medium',
    className,
    beginEdit,
    endEdit,
    onSet,
    ...rest
  } = props;

  const composedOnSet = useMemo(
    () => composeInteractingOnSet({ beginEdit, endEdit }, onSet),
    [beginEdit, endEdit, onSet],
  );

  const cls = useMemo(() => {
    const parts = [`aux-preset-${size}`];
    if (className) parts.push(className);
    return parts.join(' ');
  }, [size, className]);

  const unsubsRef = useRef<(() => void)[]>([]);

  const detach = useCallback(() => {
    for (const off of unsubsRef.current) off();
    unsubsRef.current = [];
  }, []);

  const attach = useCallback(
    (knob: AuxKnobInstance) => {
      detach();
      if (knob.isDestructed()) return;
      unsubsRef.current = [
        knob.subscribe('set_value', () => syncOverClass(knob)),
        knob.subscribe('set_base', () => syncOverClass(knob)),
      ];
      syncOverClass(knob);
    },
    [detach],
  );

  const widgetRef = useCallback(
    (w: AuxKnobInstance | null) => {
      if (!w) {
        detach();
        return;
      }
      attach(w);
    },
    [attach, detach],
  );

  useEffect(() => () => detach(), [detach]);

  return (
    <KnobWidget
      {...rest}
      className={cls}
      widgetRef={widgetRef}
      {...(composedOnSet ? { onSet: composedOnSet } : {})}
      {...{ 'knob.preset': size }}
    />
  );
}
