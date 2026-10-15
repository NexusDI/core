/**
 * Places a twoslash panel beside its button with `position: fixed`, so a
 * signature's `<pre>`, which scrolls and clips, never cuts it off, and keeps it
 * inside the window on a phone. Loaded by `popup.client.tsx` on the first
 * pointer or focus that reaches a hover.
 *
 * A mouse opens the panel on pointer enter and closes it on pointer leave,
 * after `LINGER` milliseconds so a reader can move onto the panel (WCAG
 * 1.4.13). A keyboard opens it on focus and closes it on blur and Escape, and
 * Enter or Space toggles it, as does a screen reader's virtual cursor, whose
 * activation arrives as a click with no pointer behind it. Touch has neither
 * hover nor, on iOS, focus on a tapped button, and a touch pointer leaves the
 * moment the finger lifts, so a tap toggles the panel and pointer enter and
 * leave are ignored for it. Whether the reader is on touch is read per event:
 * a key press ends it, so a reader who taps and then tabs gets the keyboard
 * behaviour. A pointer down anywhere outside the hover closes an open panel.
 * A scroll outside the panel moves it with its button, and closes it once the
 * button has left the window.
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
  // A scroll inside the panel is the reader reading it. Any other scroll,
  // the page scroll that focusing a token causes included, moves the button
  // under a fixed panel, so the panel follows it, once a frame, and closes
  // only when the button has left the window.
  let frame = 0;
  const onScroll = (event: Event) => {
    if (panel.contains(event.target as Node) || frame !== 0) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const at = button.getBoundingClientRect();
      const gone =
        at.bottom < 0 ||
        at.top > window.innerHeight ||
        at.right < 0 ||
        at.left > document.documentElement.clientWidth;
      if (gone) close();
      else place(panel, button);
    });
  };

  const close = (): void => {
    clearTimeout(closing);
    cancelAnimationFrame(frame);
    frame = 0;
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
  root.addEventListener('keydown', () => {
    touch = false;
  });
  // A click from a mouse leaves the panel to hover. A tap, Enter or Space,
  // and a virtual cursor's activation (a click with `detail` 0) toggle it.
  button.addEventListener('click', (event) => {
    if (swallowClick) {
      swallowClick = false;
      return;
    }
    if (!touch && event.detail !== 0) return;
    if (isOpen()) close();
    else open();
  });
  button.addEventListener('focus', () => {
    if (!touch || button.matches(':focus-visible')) open();
  });
  // A tap inside the open panel blurs the token on Android before the tap
  // lands; the panel stays, as it does when focus moves into it.
  let pressingPanel = false;
  panel.addEventListener('pointerdown', () => {
    pressingPanel = true;
    setTimeout(() => {
      pressingPanel = false;
    }, 0);
  });
  button.addEventListener('blur', (event) => {
    if (pressingPanel || root.contains(event.relatedTarget as Node | null))
      return;
    close();
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
