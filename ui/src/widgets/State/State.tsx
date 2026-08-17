import { State as AuxState } from '@deutschesoft/aux-widgets/src/index.pure.js';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import type { DynamicValue } from '@deutschesoft/awml';
import './State.scss';

const StateBindings = {
  // Same pattern as LevelMeter: default two-way receive from DynamicValue.
  // Do NOT set IBindingDescription.writeonly — that maps to a readonly widget
  // binding and never applies host values (LED stuck at 0 / black).
  state$: { name: 'state', ignoreInteraction: true },
  color$: { name: 'color', ignoreInteraction: true },
};

const StateWidget = componentFromWidget(
  AuxState,
  StateBindings,
  {},
  'State',
);

export interface StateProps {
  /** On/off (`0`/`1` or boolean) or brightness `0…1`. */
  state$?: DynamicValue<number | boolean>;
  state?: number | boolean;
  color$?: DynamicValue<string | false>;
  color?: string | false;
  className?: string;
  [key: string]: unknown;
}

export function State(props: StateProps) {
  // use-aux-widgets updateClassName() calls className.split — never pass undefined.
  return <StateWidget {...props} className={props.className ?? ''} />;
}
