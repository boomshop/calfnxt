import { ConfirmButton as AuxConfirmButton } from '@deutschesoft/aux-widgets/src/index.pure.js';
import { componentFromWidget } from '@deutschesoft/use-aux-widgets';
import './ConfirmButton.scss';

const ConfirmButtonWidget = componentFromWidget(
  AuxConfirmButton,
  {},
  {
    icon: false,
    icon_confirm: 'questionmark',
    label: false,
    label_confirm: 'Sure?',
    confirm: true,
    timeout: 2500,
    interrupt: 80,
  },
  'ConfirmButton',
);

export interface ConfirmButtonProps {
  className?: string;
  /** Fired after second confirm click. */
  onConfirmed?: () => void;
  [key: string]: unknown;
}

export function ConfirmButton(props: ConfirmButtonProps) {
  return <ConfirmButtonWidget {...props} />;
}
