/**
 * Where a type card goes and how long it lingers, shared by the behaviour
 * pane's card (`BehaviourPane.tsx`) and the page fences' card
 * (`components/twoslash/PagePopover.tsx`).
 */

/** How far the card sits from the token, and from the edge of the window. */
const GAP = 6;
const EDGE = 8;

/**
 * How long the card stays up after the pointer leaves the code or the card,
 * so a reader can cross the gap between a token and its card (WCAG 1.4.13).
 */
export const LINGER = 150;

/**
 * Puts the card beside the token it describes, inside the window.
 *
 * The card is `position: fixed` and placed from JavaScript, because a token
 * sits inside a block that scrolls and clips: a catalogue's 26rem frame, or a
 * fence's `<pre>`. A card laid out in the flow would be cut off by the first
 * ancestor it grew past, and a card on a phone would open past the right
 * edge. With fixed placement the only box it has to fit in is the window.
 */
export function place(card: HTMLElement, token: HTMLElement): void {
  const room = document.documentElement.clientWidth;
  const frame = card.getBoundingClientRect();
  const at = token.getBoundingClientRect();
  const above = at.top - frame.height - GAP;

  card.style.left = `${Math.round(
    Math.min(
      Math.max(at.left, EDGE),
      Math.max(room - frame.width - EDGE, EDGE),
    ),
  )}px`;
  card.style.top = `${Math.round(above >= EDGE ? above : at.bottom + GAP)}px`;
  card.style.visibility = 'visible';
}
