'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { LINGER, place } from '../api/type-card';
import './popup.css';
import '../api/token-colours.css';

/**
 * The one type card a page shows for the typed tokens of its fences.
 *
 * `tools/popup-fold.mjs` leaves each hover as a `<button data-pop="<key>">`
 * and writes the page's panels to `public/popups/<page>.json`. This fetches
 * that table when the browser is idle, or at once when a reader first
 * reaches a token, and renders one card, only while a token is open, with
 * the token's `aria-describedby` naming it. `TypeCards.tsx` mounts it inside
 * the page, so each page reads its own table. A polite live region says the
 * type when a keyboard or a virtual cursor opens the card.
 *
 * Every listener is delegated from the document, so a page with thousands of
 * tokens hydrates no component per token. A mouse opens the card on pointer
 * over and closes it on pointer out after `LINGER`, so a reader can move onto
 * it (WCAG 1.4.13). A keyboard opens it on focus and closes it on blur and
 * Escape, and Enter or Space toggles it, as does a screen reader's virtual
 * cursor, whose activation is a click with no pointer behind it. Touch has
 * no hover and, on iOS, no focus on a tapped button, so a tap toggles it; a
 * key press ends touch mode. A pointer down outside closes it. A scroll
 * outside the card moves it with its token, once a frame, and closes it once
 * the token has left the window.
 *
 * A fence is one tab stop, as the behaviour catalogue's rail is: the fold
 * gives its first token `tabindex="0"`, and the arrow keys, Home and End move
 * the stop between the fence's tokens.
 */

const TOKEN = 'button[data-pop]';
const CARD_ID = 'nexus-type-card';

type Table = Record<string, string>;

/**
 * The table's path for this page: its route under the base path, as
 * `tools/mdx-nextra-loader.mjs` names it, and `index` for the home page.
 */
export function tablePath(): string {
  const base = process.env.NEXUS_BASE_PATH ?? '';
  const page = window.location.pathname
    .slice(base.length)
    .replace(/^\/+|\/+$/g, '');
  return `${base}/popups/${page === '' ? 'index' : page}.json`;
}

async function fetchTable(): Promise<Table> {
  const response = await fetch(tablePath());
  if (!response.ok) throw new Error(`${tablePath()}: ${response.status}`);
  return (await response.json()) as Table;
}

/** A panel's words, for the live region to speak. */
function wordsOf(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  return (template.content.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const tokenOf = (target: EventTarget | null): HTMLElement | null =>
  target instanceof Element ? target.closest<HTMLElement>(TOKEN) : null;

/** Every token of the fence around `token`, in reading order. */
const fenceOf = (token: HTMLElement): HTMLElement[] => [
  ...(
    token.closest('pre') ??
    token.parentElement ??
    document
  ).querySelectorAll<HTMLElement>(TOKEN),
];

/** Moves the fence's tab stop to `token`. */
function hold(token: HTMLElement): void {
  for (const each of fenceOf(token)) each.tabIndex = each === token ? 0 : -1;
}

export function PagePopover() {
  const [open, setOpen] = useState<{ token: HTMLElement; html: string } | null>(
    null,
  );
  const [spoken, setSpoken] = useState('');
  const card = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // This page's table, fetched once per mount. A failed fetch is not kept,
    // so the next token a reader reaches asks again.
    let table: Promise<Table> | null = null;
    const load = (): Promise<Table> => {
      table ??= fetchTable().catch((error: unknown) => {
        table = null;
        throw error;
      });
      return table;
    };

    let touch = false;
    let pressingCard = false;
    let closing: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;

    const close = () => {
      clearTimeout(closing);
      cancelAnimationFrame(frame);
      frame = 0;
      current.current?.removeAttribute('aria-describedby');
      current.current = null;
      setOpen(null);
      setSpoken('');
    };
    /**
     * Opens the card on `token` once the table is in. `speak` is for a
     * keyboard or a virtual cursor: the live region says the type, since
     * the token had no description when focus reached it.
     */
    const show = (token: HTMLElement, speak: boolean) => {
      clearTimeout(closing);
      if (current.current === token) return;
      current.current?.removeAttribute('aria-describedby');
      current.current = token;
      load().then(
        (loaded) => {
          const html = loaded[token.dataset.pop ?? ''];
          if (current.current !== token) return;
          if (html === undefined) return close();
          token.setAttribute('aria-describedby', CARD_ID);
          setOpen({ token, html });
          if (speak) setSpoken(wordsOf(html));
        },
        () => {
          if (current.current === token) close();
        },
      );
    };
    const leave = () => {
      clearTimeout(closing);
      closing = setTimeout(() => {
        if (!current.current?.contains(document.activeElement)) close();
      }, LINGER);
    };
    const inCard = (target: EventTarget | null) =>
      target instanceof Node && card.current?.contains(target) === true;

    const onPointerDown = (event: PointerEvent) => {
      touch = event.pointerType === 'touch';
      const token = tokenOf(event.target);
      if (token) hold(token);
      if (inCard(event.target)) {
        // A tap inside the card blurs the token on Android before it lands.
        pressingCard = true;
        setTimeout(() => {
          pressingCard = false;
        }, 0);
        return;
      }
      if (current.current && token !== current.current) close();
    };
    const onPointerOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const token = tokenOf(event.target);
      if (token) show(token, false);
      else if (inCard(event.target)) clearTimeout(closing);
    };
    const onPointerOut = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || !current.current) return;
      const from =
        tokenOf(event.target) === current.current || inCard(event.target);
      const to =
        tokenOf(event.relatedTarget) === current.current ||
        inCard(event.relatedTarget);
      if (from && !to) leave();
    };
    const onFocusIn = (event: FocusEvent) => {
      const token = tokenOf(event.target);
      if (!token) return;
      hold(token);
      const keyboard = token.matches(':focus-visible');
      if (!touch || keyboard) show(token, keyboard);
    };
    const onFocusOut = (event: FocusEvent) => {
      if (tokenOf(event.target) !== current.current) return;
      if (pressingCard || inCard(event.relatedTarget)) return;
      close();
    };
    const onClick = (event: MouseEvent) => {
      const token = tokenOf(event.target);
      if (!token) return;
      // A mouse click leaves the card to hover; a tap, Enter or Space, and a
      // virtual cursor's activation toggle it.
      if (!touch && event.detail !== 0) return;
      if (current.current === token) close();
      else show(token, event.detail === 0);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      touch = false;
      // Escape closes an open card wherever focus is: a card the pointer
      // opened has focus on the page, not on its token (WCAG 1.4.13).
      if (event.key === 'Escape') {
        if (current.current) close();
        return;
      }
      const token = tokenOf(event.target);
      if (!token) return;
      const tokens = fenceOf(token);
      const from = tokens.indexOf(token);
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
      if (!going || going === token) return;
      hold(going);
      going.focus();
    };
    const onScroll = (event: Event) => {
      if (!current.current || inCard(event.target) || frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const token = current.current;
        if (!token || !card.current) return;
        const at = token.getBoundingClientRect();
        const gone =
          at.bottom < 0 ||
          at.top > window.innerHeight ||
          at.right < 0 ||
          at.left > document.documentElement.clientWidth;
        if (gone) close();
        else place(card.current, token);
      });
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);

    // The table, while the browser is idle, so the first card shows at once.
    const prefetch = () => void load().catch(() => undefined);
    const idle =
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback(prefetch, { timeout: 3000 })
        : window.setTimeout(prefetch, 500);

    return () => {
      close();
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerover', onPointerOver);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      if (typeof window.cancelIdleCallback === 'function')
        window.cancelIdleCallback(idle);
      else window.clearTimeout(idle);
    };
  }, []);

  useEffect(() => {
    if (open && card.current) place(card.current, open.token);
  }, [open]);

  return (
    <>
      {/* Portalled to the body: Nextra's article has a backdrop-filter,
          which would make it the box a fixed card is placed in, and
          `place()` measures from the window. */}
      {open &&
        createPortal(
          <div
            className="nexus-type-card twoslash-popup-container x:max-w-2xl!"
            id={CARD_ID}
            ref={card}
            role="tooltip"
            // The build sanitized this HTML from the compiler's own output
            // (`tools/popup-fold.mjs`); nothing a reader supplies reaches it.
            dangerouslySetInnerHTML={{ __html: open.html }}
          />,
          document.body,
        )}
      <div className="nexus-type-card__spoken" role="status" aria-live="polite">
        {spoken}
      </div>
    </>
  );
}
