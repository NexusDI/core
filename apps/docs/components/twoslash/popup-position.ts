/**
 * Places a twoslash panel beside its button with `position: fixed`, so a
 * signature's `<pre>`, which scrolls and clips, never cuts it off, and keeps it
 * inside the window on a phone. Loaded by `popup.client.tsx` on the first
 * pointer or focus that reaches a hover.
 *
 * A mouse opens the panel on pointer enter and closes it on pointer leave,
 * after `LINGER` milliseconds so a reader can move onto the panel (WCAG
 * 1.4.13). A keyboard opens it on focus and closes it on blur and Escape.
 * Touch has neither hover nor, on iOS, focus on a tapped button, and a touch
 * pointer leaves the moment the finger lifts, so a tap toggles the panel and
 * pointer enter and leave are ignored for it. A pointer down anywhere outside
 * the hover and any scroll close an open panel, since a fixed panel would
 * otherwise hang over the page while it moves.
 */

const GAP = 6;
const EDGE = 8;
const LINGER = 150;

function place(panel: HTMLElement, button: HTMLElement): void {
  const room = document.documentElement.clientWidth;
  const at = button.getBoundingClientRect();
  const frame = panel.getBoundingClientRect();
  const below = at.bottom + GAP;
  const fits = below + frame.height <= window.innerHeight - EDGE;

  panel.style.left = `${Math.round(
    Math.min(
      Math.max(at.left, EDGE),
      Math.max(room - frame.width - EDGE, EDGE),
    ),
  )}px`;
  panel.style.top = `${Math.round(
    fits ? below : Math.max(at.top - frame.height - GAP, EDGE),
  )}px`;
}

export interface Opening {
  type: string;
  pointerType?: string;
}

export function attach(root: HTMLElement, opening: Opening): void {
  const button = root.querySelector<HTMLElement>(
    ':scope > .nexus-popup__button',
  );
  const panel = root.querySelector<HTMLElement>(':scope > .nexus-popup__panel');
  if (!button || !panel) return;

  let closing: ReturnType<typeof setTimeout> | undefined;
  let touch = opening.pointerType === 'touch';
  // The tap that loaded this module opened the panel. Its click may land
  // after this runs, and must not close it again; a new pointer down means
  // that click is gone, landed before this module or never fired.
  let swallowClick = false;
  root.dataset.positioned = '';

  const isOpen = () => !panel.hidden;

  const onOutside = (event: Event) => {
    if (!root.contains(event.target as Node)) close();
  };
  const onScroll = () => close();

  const close = (): void => {
    clearTimeout(closing);
    panel.hidden = true;
    document.removeEventListener('pointerdown', onOutside, true);
    window.removeEventListener('scroll', onScroll, true);
  };
  const open = () => {
    clearTimeout(closing);
    if (isOpen()) return;
    panel.hidden = false;
    place(panel, button);
    document.addEventListener('pointerdown', onOutside, true);
    window.addEventListener('scroll', onScroll, true);
  };

  const leave = () => {
    clearTimeout(closing);
    closing = setTimeout(() => {
      if (!root.contains(document.activeElement)) close();
    }, LINGER);
  };

  root.addEventListener('pointerdown', (event) => {
    touch = event.pointerType === 'touch';
    swallowClick = false;
  });
  root.addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'touch') open();
  });
  root.addEventListener('pointerleave', (event) => {
    if (event.pointerType !== 'touch') leave();
  });
  button.addEventListener('click', () => {
    if (!touch) return;
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    if (isOpen()) close();
    else open();
  });
  button.addEventListener('focus', () => {
    if (!touch) open();
  });
  button.addEventListener('blur', () => {
    if (!touch) close();
  });
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  if (touch) {
    swallowClick = true;
    open();
  } else if (
    opening.type === 'focus'
      ? root.contains(document.activeElement)
      : root.matches(':hover')
  )
    open();
}
