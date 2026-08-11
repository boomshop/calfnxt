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
  enabled$: { name: 'disabled', transformReceive: (v: boolean) => !v },
};

const ringsize = 3;
const handwidth = 3;
const handadd = 3;
const handlength = ringsize + handadd;
const handcorr = 1;

/** Full AUX preset set — local copy so we can tweak without forking AUX. */
const KnobOptions = {
  'value.format': (v: number) => v.toFixed(2),
  show_value: true,
  /** Select-all on focus (middle-click edit + AUX value click). */
  auto_select: true,
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
      labels_defaults: { margin: 7 },
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
      labels_defaults: { margin: 11 },
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

type AuxValueWidget = {
  _input: HTMLInputElement;
  _value_clicked: () => unknown;
  __editing?: boolean;
  isDestructed?: () => boolean;
};

type AuxKnobInstance = {
  get: (key: string) => unknown;
  subscribe: (event: string, cb: (...args: unknown[]) => void) => () => void;
  isDestructed: () => boolean;
  element: Element;
  value?: AuxValueWidget;
};

/** base=0 and value above base → CSS hook for boost styling. */
function syncOverClass(knob: AuxKnobInstance) {
  if (knob.isDestructed()) return;
  const base = knob.get('base');
  const value = knob.get('value');
  const min = knob.get('min');
  const over =
    typeof base === 'number' &&
    typeof min === 'number' &&
    typeof value === 'number' &&
    base > min &&
    value > base;
  knob.element.classList.toggle('over', over);
}

/** Middle-click: enter numeric edit (Value sits under the SVG for drag clarity). */
function beginNumericEdit(knob: AuxKnobInstance) {
  if (knob.isDestructed()) return;
  const value = knob.value;
  if (!value || value.isDestructed?.()) return;
  if (value.__editing) {
    value._input.select();
    return;
  }
  value._value_clicked();
}

/**
 * Focus after middle-button release. Focusing on mousedown lets Linux paste the
 * primary selection into the newly focused input on mouseup.
 */
function beginNumericEditFromMiddle(knob: AuxKnobInstance) {
  if (knob.isDestructed()) return;
  const value = knob.value;
  if (!value || value.isDestructed?.()) return;
  const input = value._input;
  const blockPrimaryPaste = (e: Event) => {
    e.preventDefault();
  };
  // Catch any paste that still races past preventDefault on the mouse events.
  input.addEventListener('paste', blockPrimaryPaste, true);
  beginNumericEdit(knob);
  window.setTimeout(() => {
    input.removeEventListener('paste', blockPrimaryPaste, true);
  }, 0);
}

function isMiddleButton(e: Event): boolean {
  return 'button' in e && (e as MouseEvent).button === 1;
}

function suppressMiddleDefault(e: Event) {
  if (!isMiddleButton(e)) return false;
  e.preventDefault();
  e.stopPropagation();
  return true;
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

      // Capture phase: stop Linux primary-paste / autoscroll before the browser acts.
      const onMiddleDown = (e: Event) => {
        suppressMiddleDefault(e);
      };
      const onMiddleUp = (e: Event) => {
        if (!suppressMiddleDefault(e)) return;
        beginNumericEditFromMiddle(knob);
      };
      const onMiddleClick = (e: Event) => {
        suppressMiddleDefault(e);
      };

      const el = knob.element;
      const opts: AddEventListenerOptions = { capture: true };
      el.addEventListener('pointerdown', onMiddleDown, opts);
      el.addEventListener('mousedown', onMiddleDown, opts);
      el.addEventListener('pointerup', onMiddleUp, opts);
      el.addEventListener('mouseup', onMiddleUp, opts);
      el.addEventListener('auxclick', onMiddleClick, opts);

      unsubsRef.current = [
        knob.subscribe('set_value', () => syncOverClass(knob)),
        knob.subscribe('set_base', () => syncOverClass(knob)),
        () => {
          el.removeEventListener('pointerdown', onMiddleDown, opts);
          el.removeEventListener('mousedown', onMiddleDown, opts);
          el.removeEventListener('pointerup', onMiddleUp, opts);
          el.removeEventListener('mouseup', onMiddleUp, opts);
          el.removeEventListener('auxclick', onMiddleClick, opts);
        },
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
