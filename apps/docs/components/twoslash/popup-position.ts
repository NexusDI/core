/**
 * Places a twoslash panel beside its button with `position: fixed`, so a
 * signature's `<pre>`, which scrolls and clips, never cuts it off, and keeps it
 * inside the window on a phone. Loaded by `popup.client.tsx` on the first
 * pointer or focus that reaches a hover.
 *
 * The panel opens on pointer enter and focus and closes on pointer leave,
 * blur and Escape. Leaving the token or the panel waits `LINGER` milliseconds,
 * so a reader can move onto the panel (WCAG 1.4.13).
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

export function attach(root: HTMLElement, opening: string): void {
  const button = root.querySelector<HTMLElement>(
    ':scope > .nexus-popup__button',
  );
  const panel = root.querySelector<HTMLElement>(':scope > .nexus-popup__panel');
  if (!button || !panel) return;

  let closing: ReturnType<typeof setTimeout> | undefined;
  root.dataset.positioned = '';

  const open = () => {
    clearTimeout(closing);
    panel.hidden = false;
    place(panel, button);
  };
  const close = () => {
    clearTimeout(closing);
    panel.hidden = true;
  };
  const leave = () => {
    clearTimeout(closing);
    closing = setTimeout(() => {
      if (!root.contains(document.activeElement)) close();
    }, LINGER);
  };

  root.addEventListener('pointerenter', open);
  root.addEventListener('pointerleave', leave);
  button.addEventListener('focus', open);
  button.addEventListener('blur', close);
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  if (
    opening === 'focus'
      ? root.contains(document.activeElement)
      : root.matches(':hover')
  )
    open();
}
