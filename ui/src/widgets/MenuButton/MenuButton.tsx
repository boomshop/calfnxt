import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
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
  /**
   * How the menu attaches under/over the button (LTR):
   * - `top*` = below the button; `bottom*` = above
   * - `*-left` = align left edges; `*-right` = align right edges; bare = center
   */
  anchor?: MenuAnchor;
  /** Inset from the clip edges when clamping. */
  viewportPadding?: number;
  children?: ReactNode;
}

/** Fixed coords: prefer `right` for *-right so width need not be known yet. */
type MenuPos = {
  top: number;
  left?: number;
  right?: number;
};

const VIEW_PAD_DEFAULT = 8;

type ClipRect = { left: number; top: number; right: number; bottom: number };

/** Prefer the plugin chrome (DevShell frame / PluginUI / #root) over the browser. */
function clipRectFor(el: HTMLElement | null): ClipRect {
  const vv = window.visualViewport;
  const originX = vv?.offsetLeft ?? 0;
  const originY = vv?.offsetTop ?? 0;
  const vw = vv?.width ?? window.innerWidth;
  const vh = vv?.height ?? window.innerHeight;
  let clip: ClipRect = {
    left: originX,
    top: originY,
    right: originX + vw,
    bottom: originY + vh,
  };

  let node: HTMLElement | null = el;
  while (node) {
    if (
      node.classList?.contains('DevShell__frame') ||
      node.classList?.contains('PluginUI') ||
      node.id === 'root'
    ) {
      const r = node.getBoundingClientRect();
      clip = {
        left: Math.max(clip.left, r.left),
        top: Math.max(clip.top, r.top),
        right: Math.min(clip.right, r.right),
        bottom: Math.min(clip.bottom, r.bottom),
      };
      break;
    }
    node = node.parentElement;
  }
  return clip;
}

function idealPlace(
  anchor: MenuAnchor,
  btn: DOMRect,
  mw: number,
  mh: number,
  viewW: number,
): MenuPos {
  const topBelow = btn.bottom;
  const topAbove = btn.top - mh;
  switch (anchor) {
    case 'top-left':
      return { top: topBelow, left: btn.left };
    case 'top-right':
      // Pin menu’s right edge to the button’s right edge (width-independent).
      return { top: topBelow, right: viewW - btn.right };
    case 'bottom':
      return {
        top: topAbove,
        left: btn.left + (btn.width - mw) / 2,
      };
    case 'bottom-left':
      return { top: topAbove, left: btn.left };
    case 'bottom-right':
      return { top: topAbove, right: viewW - btn.right };
    case 'top':
    default:
      return {
        top: topBelow,
        left: btn.left + (btn.width - mw) / 2,
      };
  }
}

function posToBox(
  pos: MenuPos,
  mw: number,
  mh: number,
  viewW: number,
): { left: number; top: number; right: number; bottom: number } {
  const left =
    pos.left != null ? pos.left : viewW - (pos.right ?? 0) - mw;
  return {
    left,
    top: pos.top,
    right: left + mw,
    bottom: pos.top + mh,
  };
}

function clampToClip(
  preferred: MenuPos,
  anchor: MenuAnchor,
  btn: DOMRect,
  mw: number,
  mh: number,
  pad: number,
  clip: ClipRect,
  viewW: number,
): MenuPos {
  let pos = { ...preferred };
  const opensBelow = anchor.startsWith('top');

  // Flip vertically when the preferred side does not fit.
  if (opensBelow) {
    if (pos.top + mh > clip.bottom - pad && btn.top - mh >= clip.top + pad) {
      pos = { ...pos, top: btn.top - mh };
    }
  } else if (pos.top < clip.top + pad && btn.bottom + mh <= clip.bottom - pad) {
    pos = { ...pos, top: btn.bottom };
  }

  let box = posToBox(pos, mw, mh, viewW);

  // Horizontal: shift into clip; keep using the same edge mode (left vs right).
  if (box.right > clip.right - pad) {
    const shift = box.right - (clip.right - pad);
    if (pos.right != null) pos = { ...pos, right: (pos.right ?? 0) + shift };
    else pos = { ...pos, left: (pos.left ?? 0) - shift };
    box = posToBox(pos, mw, mh, viewW);
  }
  if (box.left < clip.left + pad) {
    const shift = clip.left + pad - box.left;
    if (pos.right != null) pos = { ...pos, right: Math.max(0, (pos.right ?? 0) - shift) };
    else pos = { ...pos, left: (pos.left ?? 0) + shift };
    box = posToBox(pos, mw, mh, viewW);
  }

  // Vertical clamp (after possible flip).
  if (box.bottom > clip.bottom - pad) {
    pos = { ...pos, top: Math.max(clip.top + pad, clip.bottom - pad - mh) };
  }
  if (pos.top < clip.top + pad) {
    pos = { ...pos, top: clip.top + pad };
  }

  return pos;
}

function placeMenu(
  anchor: MenuAnchor,
  btn: DOMRect,
  mw: number,
  mh: number,
  pad: number,
  clip: ClipRect,
): MenuPos {
  const viewW = window.innerWidth;
  const ideal = idealPlace(anchor, btn, mw, mh, viewW);
  return clampToClip(ideal, anchor, btn, mw, mh, pad, clip, viewW);
}

/**
 * AUX Button that toggles a portaled `position:fixed` menu. Outside click or a
 * click inside the menu closes it. Placement is clamped to the plugin frame.
 */
export function MenuButton(props: MenuButtonProps) {
  const {
    className,
    label = false,
    icon = false,
    anchor = 'top',
    viewportPadding = VIEW_PAD_DEFAULT,
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
    const btnEl = btnWrapRef.current?.querySelector(
      'button, .aux-button',
    ) as HTMLElement | null;
    const menuEl = menuRef.current;
    if (!btnEl || !menuEl) return;

    const update = () => {
      const btn = btnEl.getBoundingClientRect();
      // offsetWidth/Height ignore transform and work while visibility:hidden.
      const mw = Math.max(menuEl.offsetWidth, menuEl.scrollWidth);
      const mh = Math.max(menuEl.offsetHeight, menuEl.scrollHeight);
      const clip = clipRectFor(rootRef.current);
      setPos(placeMenu(anchor, btn, mw, mh, viewportPadding, clip));
    };

    update();
    // AUX widgets often size one frame late — re-place when the menu resizes.
    const ro = new ResizeObserver(update);
    ro.observe(menuEl);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
    };
  }, [open, anchor, children, viewportPadding]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (rootRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () =>
      document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open, close]);

  const cls = ['MenuButton', className ?? '', open ? 'open' : '']
    .filter(Boolean)
    .join(' ');

  const menuStyle: CSSProperties = pos
    ? {
        top: pos.top,
        left: pos.left ?? 'auto',
        right: pos.right ?? 'auto',
        visibility: 'visible',
      }
    : {
        top: 0,
        left: 0,
        right: 'auto',
        visibility: 'hidden',
        pointerEvents: 'none',
      };

  const menu = open ? (
    <div
      ref={menuRef}
      className="MenuButton-menu"
      style={menuStyle}
      onClick={close}
    >
      {children}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={cls}>
      <div ref={btnWrapRef} className="trigger">
        <Button icon={icon} label={label} onClick={toggle} />
      </div>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
