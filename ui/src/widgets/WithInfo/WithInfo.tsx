import {
  Children,
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';
import './WithInfo.scss';

export interface WithInfoProps {
  /** Hover / accessibility description. */
  title: string;
  children: ReactNode;
  className?: string;
}

const VIEW_PAD = 8;
const GAP = 6;

function singleElementChild(children: ReactNode): ReactElement | null {
  const elements = Children.toArray(children).filter(isValidElement);
  return elements.length === 1 ? (elements[0] as ReactElement) : null;
}

function classNameFromChild(child: ReactElement | null): string {
  if (!child) return '';
  const cn = (child.props as { className?: unknown }).className;
  return typeof cn === 'string' ? cn : '';
}

/** Place the flyout next to `anchor`, flipped/clamped so it stays in the viewport. */
function placeFlyout(fly: HTMLElement, anchor: DOMRect): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const fw = fly.offsetWidth;
  const fh = fly.offsetHeight;

  // Prefer below the icon, right-aligned (icons sit in the control's top-right).
  let left = anchor.right - fw;
  let top = anchor.bottom + GAP;
  if (top + fh > vh - VIEW_PAD && anchor.top - GAP - fh >= VIEW_PAD) {
    top = anchor.top - GAP - fh;
  }

  left = Math.min(Math.max(left, VIEW_PAD), Math.max(VIEW_PAD, vw - VIEW_PAD - fw));
  top = Math.min(Math.max(top, VIEW_PAD), Math.max(VIEW_PAD, vh - VIEW_PAD - fh));

  fly.style.left = `${Math.round(left)}px`;
  fly.style.top = `${Math.round(top)}px`;
  fly.style.visibility = 'visible';
}

/**
 * Wraps a control with a small info icon and an in-page hover flyout.
 * Forwards the child's `className` onto the wrapper so grid/flex layout
 * selectors (e.g. `.subdiv`, `.bypass`) keep matching the outer item.
 *
 * The flyout is `position: fixed` (portaled to `document.body`) and uses
 * `pointer-events: none` so it cannot steal hover from the icon if it
 * lands under the cursor after clamping.
 */
export function WithInfo(props: WithInfoProps) {
  const { title, children, className } = props;
  const child = singleElementChild(children);
  const childClass = classNameFromChild(child);
  const cls = ['WithInfo', className ?? '', childClass].filter(Boolean).join(' ');

  const tipRef = useRef<HTMLSpanElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    if (!open) return;
    const tip = tipRef.current;
    const fly = flyoutRef.current;
    if (!tip || !fly) return;

    const update = () => placeFlyout(fly, tip.getBoundingClientRect());
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [open, title]);

  return (
    <div className={cls}>
      <span
        ref={tipRef}
        className="info-tip"
        role="img"
        aria-label={title}
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
      >
        <Icon icon="info" size={12} />
      </span>
      {open && title
        ? createPortal(
            <div
              ref={flyoutRef}
              className="WithInfo-flyout"
              role="tooltip"
            >
              {title}
            </div>,
            document.body,
          )
        : null}
      {children}
    </div>
  );
}
