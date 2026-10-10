import {
  Children,
  isValidElement,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../Icon';
import { openExternalUrl } from './openExternalUrl';
import './WithInfo.scss';

export interface WithInfoProps {
  /** Hover / accessibility description. Plain text, or HTML from `infoDoc`. */
  title: string;
  children: ReactNode;
  className?: string;
}

const VIEW_PAD = 8;
const GAP = 6;
const CLOSE_MS = 220;

const ALLOWED_TAGS = new Set([
  'ARTICLE',
  'H1',
  'H2',
  'P',
  'UL',
  'OL',
  'LI',
  'DL',
  'DT',
  'DD',
  'A',
  'STRONG',
  'EM',
]);

function singleElementChild(children: ReactNode): ReactElement | null {
  const elements = Children.toArray(children).filter(isValidElement);
  return elements.length === 1 ? (elements[0] as ReactElement) : null;
}

function classNameFromChild(child: ReactElement | null): string {
  if (!child) return '';
  const cn = (child.props as { className?: unknown }).className;
  return typeof cn === 'string' ? cn : '';
}

function isInfoHtml(title: string): boolean {
  return title.includes('class="info-doc"');
}

/** Keep the document skeleton and https links. Drop everything else. */
function sanitizeInfoHtml(html: string): HTMLElement | null {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const source = parsed.body.firstElementChild;
  if (!source || source.tagName !== 'ARTICLE')
    return null;

  const copy = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE)
      return document.createTextNode(node.textContent ?? '');
    if (node.nodeType !== Node.ELEMENT_NODE)
      return null;
    const el = node as HTMLElement;
    if (!ALLOWED_TAGS.has(el.tagName)) {
      const frag = document.createDocumentFragment();
      el.childNodes.forEach((child) => {
        const next = copy(child);
        if (next)
          frag.appendChild(next);
      });
      return frag;
    }
    const out = document.createElement(el.tagName.toLowerCase());
    const cls = el.getAttribute('class');
    if (cls && /^info-[a-z-]+$/.test(cls))
      out.setAttribute('class', cls);
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') ?? '';
      if (!/^https:\/\/\S+$/.test(href))
        return document.createTextNode(el.textContent ?? '');
      out.setAttribute('href', href);
      out.setAttribute('rel', 'noopener noreferrer');
    }
    el.childNodes.forEach((child) => {
      const next = copy(child);
      if (next)
        out.appendChild(next);
    });
    return out;
  };

  const article = copy(source);
  return article instanceof HTMLElement ? article : null;
}

function plainLabel(title: string): string {
  if (!isInfoHtml(title))
    return title;
  const node = sanitizeInfoHtml(title);
  const text = (node?.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text || title;
}

/** Place the flyout next to `anchor`, flipped/clamped so it stays in the viewport. */
function placeFlyout(fly: HTMLElement, anchor: DOMRect): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const below = Math.max(0, vh - VIEW_PAD - (anchor.bottom + GAP));
  const above = Math.max(0, anchor.top - GAP - VIEW_PAD);
  // Use the side with more room so a long text is not stuck in a short strip.
  const preferBelow = below >= above;
  const maxH = Math.max(96, Math.floor(preferBelow ? below : above));
  const maxW = Math.max(160, vw - VIEW_PAD * 2);

  fly.style.maxHeight = `${maxH}px`;
  fly.style.maxWidth = `min(24rem, ${maxW}px)`;

  const fw = fly.offsetWidth;
  const fh = fly.offsetHeight;
  let left = anchor.right - fw;
  let top = preferBelow ? anchor.bottom + GAP : anchor.top - GAP - fh;

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
 * The flyout is `position: fixed` (portaled to `document.body`). Hover opens
 * it; click pins it so a long text can be scrolled. https links are handed
 * to the system browser (or a new tab in Vite) and do not navigate the page.
 */
export function WithInfo(props: WithInfoProps) {
  const { title, children, className } = props;
  const child = singleElementChild(children);
  const childClass = classNameFromChild(child);
  const cls = ['WithInfo', className ?? '', childClass].filter(Boolean).join(' ');
  const html = isInfoHtml(title);
  const label = plainLabel(title);

  const tipRef = useRef<HTMLButtonElement>(null);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const pinnedRef = useRef(false);
  const closeTimer = useRef(0);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  const clearClose = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = 0;
    }
  };

  const scheduleClose = () => {
    if (pinnedRef.current)
      return;
    clearClose();
    closeTimer.current = window.setTimeout(() => {
      if (!pinnedRef.current)
        setOpen(false);
    }, CLOSE_MS);
  };

  const setPin = (on: boolean) => {
    pinnedRef.current = on;
    setPinned(on);
    setOpen(on);
  };

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

  useEffect(() => {
    if (!open || !pinned) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (tipRef.current?.contains(target) || flyoutRef.current?.contains(target))
        return;
      setPin(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        setPin(false);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, pinned]);

  useEffect(() => () => clearClose(), []);

  const onFlyoutClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement | null)?.closest?.('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href') ?? '';
    event.preventDefault();
    openExternalUrl(href);
  };

  return (
    <div className={cls}>
      <button
        ref={tipRef}
        type="button"
        className={pinned ? 'info-tip is-pinned' : 'info-tip'}
        aria-label={label}
        aria-expanded={open}
        onPointerEnter={() => {
          clearClose();
          setOpen(true);
        }}
        onPointerLeave={scheduleClose}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setPin(!pinnedRef.current);
        }}
      >
        <Icon icon="info" size={12} />
      </button>
      {open && title
        ? createPortal(
            <div
              ref={flyoutRef}
              className={pinned ? 'WithInfo-flyout is-pinned' : 'WithInfo-flyout'}
              role="dialog"
              aria-label={label}
              onPointerEnter={clearClose}
              onPointerLeave={scheduleClose}
              onClick={onFlyoutClick}
            >
              {html ? <InfoHtml html={title} /> : title}
            </div>,
            document.body,
          )
        : null}
      {children}
    </div>
  );
}

function InfoHtml(props: { html: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    host.replaceChildren();
    const article = sanitizeInfoHtml(props.html);
    if (article)
      host.appendChild(article);
  }, [props.html]);
  return <div ref={ref} className="info-html" />;
}
