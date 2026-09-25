import { Scale as AuxScale } from '@deutschesoft/aux-widgets/src/index.pure.js';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import './Scale.scss';

const ScaleBindings = {};

const ScaleWidget = componentFromWidget(AuxScale, ScaleBindings, {}, 'Scale');

export interface ScaleProps {
  [key: string]: unknown;
}

export function Scale(props: ScaleProps) {
  return <ScaleWidget {...props} />;
}
