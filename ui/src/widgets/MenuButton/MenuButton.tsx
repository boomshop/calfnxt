import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Button } from '../Button';
import './MenuButton.scss';

export type MenuAnchor =
  | 'top'
  | 'top-left'
  | 'top-right'
  | 'bottom'
  | 'bottom-left'
  | 'bottom-right';

export interface MenuButtonProps {
  className?: string;
  label?: string | false;
  icon?: string | false;
  /** How the fixed menu attaches to the button. Default `top`. */
  anchor?: MenuAnchor;
  children?: ReactNode;
}

type MenuPos = { top: number; left: number };

function placeMenu(
  anchor: MenuAnchor,
  btn: DOMRect,
  menu: DOMRect,
): MenuPos {
  switch (anchor) {
    case 'top-left':
      return { top: btn.bottom, left: btn.left };
    case 'top-right':
      return { top: btn.bottom, left: btn.right - menu.width };
    case 'bottom':
      return {
        top: btn.top - menu.height,
        left: btn.left + (btn.width - menu.width) / 2,
      };
    case 'bottom-left':
      return { top: btn.top - menu.height, left: btn.left };
    case 'bottom-right':
      return { top: btn.top - menu.height, left: btn.right - menu.width };
    case 'top':
    default:
      return {
        top: btn.bottom,
        left: btn.left + (btn.width - menu.width) / 2,
      };
  }
}

/**
 * AUX Button that toggles a `position:fixed` menu. `anchor` controls how the
 * menu attaches to the button (e.g. `top-right` = menu top-right at button
 * bottom-right). Outside click or a click inside the menu closes it.
 */
export function MenuButton(props: MenuButtonProps) {
  const {
    className,
    label = false,
    icon = false,
    anchor = 'top',
    children,
  } = props;

  const rootRef = useRef<HTMLDivElement>(null);
  const btnWrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<MenuPos | null>(null);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const btnEl = btnWrapRef.current?.querySelector('button, .aux-button');
    const menuEl = menuRef.current;
    if (!btnEl || !menuEl) return;

    const update = () => {
      const btn = (btnEl as HTMLElement).getBoundingClientRect();
      const menu = menuEl.getBoundingClientRect();
      setPos(placeMenu(anchor, btn, menu));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, anchor, children]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (rootRef.current?.contains(t)) return;
      close();
    };
    // Capture so we close before other handlers steal the event.
    document.addEventListener('pointerdown', onPointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, close]);

  const cls = ['MenuButton', className ?? '', open ? 'open' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={rootRef} className={cls}>
      <div ref={btnWrapRef} className="trigger">
        <Button icon={icon} label={label} onClick={toggle} />
      </div>
      {open ? (
        <div
          ref={menuRef}
          className="menu"
          style={
            pos
              ? { top: pos.top, left: pos.left, visibility: 'visible' }
              : { visibility: 'hidden' }
          }
          onClick={close}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
