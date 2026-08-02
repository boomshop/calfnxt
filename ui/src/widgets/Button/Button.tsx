import { Button as AuxButton } from '@deutschesoft/aux-widgets/src/index.pure.js';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import './Button.scss';

const ButtonWidget = componentFromWidget(AuxButton, {}, {}, 'Button');

export interface ButtonProps {
  className?: string;
  label?: string | false;
  icon?: string | false;
  /** AUX Button emits native `click` via DOM delegation. */
  onClick?: (...args: unknown[]) => void;
  [key: string]: unknown;
}

export function Button(props: ButtonProps) {
  // use-aux-widgets updateClassName() calls className.split — never pass undefined.
  return <ButtonWidget {...props} className={props.className ?? ''} />;
}
