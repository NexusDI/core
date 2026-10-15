/**
 * Where a type card goes, how long it lingers and how the arrow keys walk its
 * tokens, shared by the behaviour
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

/**
 * Moves a roving tab stop among `tokens`, from the one at `from`, for an
 * arrow key, Home or End, and focuses the token it lands on. Up and Down
 * count with `vertical`, as a fence's lines read. Returns false for any other
 * key, which the caller then handles.
 */
export function rove(
  event: { readonly key: string; preventDefault(): void },
  tokens: readonly HTMLElement[],
  from: number,
  vertical = false,
): boolean {
  const steps: Record<string, number | undefined> = {
    ArrowRight: from + 1,
    ArrowLeft: from - 1,
    Home: 0,
    End: tokens.length - 1,
    ...(vertical ? { ArrowDown: from + 1, ArrowUp: from - 1 } : {}),
  };
  const next = steps[event.key];
  if (next === undefined) return false;
  event.preventDefault();
  const going = tokens[Math.min(Math.max(next, 0), tokens.length - 1)];
  if (!going || going === tokens[from]) return true;
  for (const each of tokens) each.tabIndex = each === going ? 0 : -1;
  going.focus();
  return true;
}
