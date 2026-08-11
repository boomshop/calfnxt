import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { Icon } from '../Icon';
import './WithInfo.scss';

export interface WithInfoProps {
  /** Hover / accessibility description. */
  title: string;
  children: ReactNode;
  className?: string;
}

function singleElementChild(children: ReactNode): ReactElement | null {
  const elements = Children.toArray(children).filter(isValidElement);
  return elements.length === 1 ? (elements[0] as ReactElement) : null;
}

function classNameFromChild(child: ReactElement | null): string {
  if (!child) return '';
  const cn = (child.props as { className?: unknown }).className;
  return typeof cn === 'string' ? cn : '';
}

/**
 * Wraps a control with a small info icon; native `title` tooltip on hover.
 * Forwards the child's `className` onto the wrapper so grid/flex layout
 * selectors (e.g. `.subdiv`, `.bypass`) keep matching the outer item.
 */
export function WithInfo(props: WithInfoProps) {
  const { title, children, className } = props;
  const child = singleElementChild(children);
  const childClass = classNameFromChild(child);
  const cls = ['WithInfo', className ?? '', childClass].filter(Boolean).join(' ');

  return (
    <div className={cls}>
      <span className="info-tip" title={title} role="img" aria-label={title}>
        <Icon icon="info" size={12} />
      </span>
      {children}
    </div>
  );
}
