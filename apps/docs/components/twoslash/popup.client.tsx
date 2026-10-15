'use client';

import {
  useEffect,
  useId,
  useRef,
  type ComponentProps,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';

/**
 * The client half of a twoslash hover. It links the button to its panel, makes
 * the fence's tokens one tab stop, and loads `popup-position.ts` with
 * `import()` on the first pointer or focus that reaches it. Until then
 * `popup.css` shows the panel on hover and focus.
 *
 * One tab stop per fence, as the behaviour catalogue's rail does it: Tab
 * enters a fence on one token, the arrow keys, Home and End move between its
 * tokens, and Tab leaves it. A signature fence on `/api/` holds hundreds of
 * typed tokens, and a stop for each would put them all between a reader and
 * the next heading.
 */

const BUTTON = ':scope > .nexus-popup__button';

/** Every token button in the fence around `root`, in reading order. */
function tokensOf(root: HTMLElement): HTMLElement[] {
  const fence = root.closest('pre') ?? root.parentElement;
  return [
    ...(fence?.querySelectorAll<HTMLElement>(
      '.nexus-popup > .nexus-popup__button',
    ) ?? []),
  ];
}

export function PopupRoot({ className, ...props }: ComponentProps<'span'>) {
  const root = useRef<HTMLSpanElement>(null);
  const id = useId();
  const asked = useRef(false);

  useEffect(() => {
    const element = root.current;
    const button = element?.querySelector<HTMLElement>(BUTTON);
    const panel = element?.querySelector(':scope > .nexus-popup__panel');
    if (!element || !button || !panel) return;
    panel.id = `${id}-type`;
    panel.setAttribute('role', 'tooltip');
    button.setAttribute('aria-describedby', panel.id);
    // The first token of the fence holds its tab stop.
    button.tabIndex = tokensOf(element)[0] === button ? 0 : -1;
  }, [id]);

  const reach = (event: { type: string; pointerType?: string }) => {
    const element = root.current;
    if (asked.current || !element) return;
    asked.current = true;
    const opening = { type: event.type, pointerType: event.pointerType };
    void import('./popup-position').then(
      ({ attach }) => attach(element, opening),
      // A chunk a deploy replaced stays on the CSS hover, which still works.
      () => undefined,
    );
  };

  // The token a reader last used holds the fence's tab stop, however it was
  // reached, so Tab back into the fence lands on it.
  const hold = () => {
    const element = root.current;
    const button = element?.querySelector<HTMLElement>(BUTTON);
    if (!element || !button) return;
    for (const each of tokensOf(element))
      each.tabIndex = each === button ? 0 : -1;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    const element = root.current;
    if (!element) return;
    const tokens = tokensOf(element);
    const from = tokens.indexOf(event.target as HTMLElement);
    if (from === -1) return;

    const steps: Record<string, number | undefined> = {
      ArrowRight: from + 1,
      ArrowDown: from + 1,
      ArrowLeft: from - 1,
      ArrowUp: from - 1,
      Home: 0,
      End: tokens.length - 1,
    };
    const next = steps[event.key];
    if (next === undefined) return;

    event.preventDefault();
    const going = tokens[Math.min(Math.max(next, 0), tokens.length - 1)];
    if (!going || going === tokens[from]) return;
    for (const each of tokens) each.tabIndex = each === going ? 0 : -1;
    going.focus();
  };

  return (
    <span
      ref={root}
      className={['nexus-popup', className].filter(Boolean).join(' ')}
      onPointerDown={(event: PointerEvent) => {
        hold();
        reach(event);
      }}
      onPointerEnter={(event: PointerEvent) => reach(event)}
      onFocus={(event) => {
        hold();
        reach(event);
      }}
      onKeyDown={onKeyDown}
      {...props}
    />
  );
}
