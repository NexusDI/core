'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';

import { ConsoleFrame, Marker } from '@nexusdi/meridian-ui';

import type { BehaviourRow } from './BehaviourCatalogue';
import { LINGER, place, rove } from './type-card';
import './behaviour.css';
import './token-colours.css';

/**
 * The case behind the sentence a reader picked in a catalogue's rail, and the
 * type card over its tokens.
 *
 * `BehaviourCatalogue.tsx` imports this with `import()` when the reader
 * scrolls the block near the window, so its code and both stylesheets reach
 * only a page whose catalogue a reader reaches.
 *
 * The pane shows the case and never a reading of it. Distilling a test into a
 * sentence is this page having an opinion about a suite it did not write, and
 * the docs site design (`specs/2026-09-23-docs-site-design.md`) has the entry
 * report what the suite states and infer nothing. The source is the one answer
 * a sceptic can argue with.
 *
 * The cases arrive from a sidecar. `apps/docs/tools/behaviour-data.mjs`
 * highlights every case during the build and writes
 * `public/behaviour/<library>/<name>.json`, one file per export, and this
 * fetches the entry's own file when it mounts. The pane carries
 * `data-pagefind-ignore`, since the cases are code and the sentences in the
 * rail are what search indexes.
 *
 * A token the compiler knows states its type. Twoslash reads each test file
 * during the build and the sidecar carries what it found, so a reader can ask
 * what a value is without leaving the entry. A type is stored once in the
 * sidecar and every token that holds it carries its number.
 */

export interface BehaviourPaneProps {
  library: string;
  name: string;
  /** The sentence the rail has selected. */
  row: BehaviourRow | undefined;
  /** The id the rail's aria-controls names. */
  paneId: string;
}

/** One case, as `behaviour-data.mjs` wrote it. */
interface Body {
  where: string;
  line: number;
  html: string;
}

interface Sidecar {
  bodies: Record<string, Body>;
  /** The types the cases hover, each stored once and cited by its number. */
  popups: Record<string, string>;
}

/**
 * The fetch for one export's sidecar, shared by every catalogue that asks.
 *
 * Cached per library and name, so a remount asks once. A failed fetch stays
 * failed for the life of the page: the pane says the cases did not load, and
 * a reload asks again.
 */
const sidecars = new Map<string, Promise<Sidecar>>();

function load(library: string, name: string): Promise<Sidecar> {
  const key = `${library}/${name}`;
  const held = sidecars.get(key);
  if (held) return held;

  // Under the base path, because `/next/` serves the sidecars at
  // `/next/behaviour/…`. `next.config.ts` hands the path to the client.
  const asked = fetch(
    `${process.env.NEXUS_BASE_PATH ?? ''}/behaviour/${library}/${encodeURIComponent(name)}.json`,
  ).then((response) => {
    if (!response.ok) throw new Error(String(response.status));
    return response.json() as Promise<Sidecar>;
  });

  sidecars.set(key, asked);
  return asked;
}

/** Every token in a case the compiler gave a type to, in reading order. */
function typed(within: HTMLElement | null): HTMLElement[] {
  return [...(within?.querySelectorAll<HTMLElement>('[data-pop]') ?? [])];
}

export default function BehaviourPane({
  library,
  name,
  row,
  paneId,
}: BehaviourPaneProps) {
  const prefix = useId();
  const [sidecar, setSidecar] = useState<Sidecar | null>(null);
  const [unread, setUnread] = useState(false);
  const code = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [token, setToken] = useState<HTMLElement | null>(null);

  const cardId = `${prefix}-type`;

  useEffect(() => {
    let live = true;
    load(library, name).then(
      (read) => {
        if (live) setSidecar(read);
      },
      () => {
        if (live) setUnread(true);
      },
    );
    return () => {
      live = false;
    };
  }, [library, name]);

  const body = sidecar?.bodies[String(row?.id)];

  // Picking another sentence replaces the pane's markup whole, so the tab stop
  // goes back on the first typed token of whatever now stands in it. A layout
  // effect, so the tokens never paint without a stop for Tab to reach.
  useLayoutEffect(() => {
    typed(code.current).forEach((each, index) => {
      each.tabIndex = index === 0 ? 0 : -1;
    });
  }, [body?.html]);

  // The token the card belongs to, where it is still in the pane and the
  // sidecar holds its type. The one the reader reached left the document when
  // the case under it was replaced, and a token whose number the sidecar does
  // not hold has no card to show.
  const popup =
    token?.isConnected === true
      ? sidecar?.popups[token.dataset.pop ?? '']
      : undefined;
  const open = popup === undefined ? null : token;

  useEffect(() => {
    const shown = card.current;
    if (!open || !shown) return;

    open.setAttribute('aria-describedby', cardId);
    place(shown, open);
    return () => {
      open.removeAttribute('aria-describedby');
      shown.style.visibility = 'hidden';
    };
  }, [cardId, open]);

  useEffect(() => () => clearTimeout(closing.current), []);

  const stay = () => clearTimeout(closing.current);

  // Leaving the code or the card takes the card down after a moment, unless
  // the pointer reaches the other one first or focus is still on a token.
  const leave = () => {
    stay();
    closing.current = setTimeout(() => {
      if (!code.current?.contains(document.activeElement)) setToken(null);
    }, LINGER);
  };

  // The token a pointer or a focus reached. A pointer crossing the space
  // between tokens keeps the card it has, so the card stays reachable.
  const reach = (event: { target: EventTarget | null; type: string }) => {
    const found = (event.target as Element | null)?.closest?.('[data-pop]');
    if (found instanceof HTMLElement) {
      stay();
      setToken(found);
    } else if (event.type === 'focus') setToken(null);
  };

  /**
   * The typed tokens as one tab stop with the arrows walking them.
   *
   * A reference page mounts dozens of these catalogues, so a tab stop per
   * token would put thousands of them between a reader and the next heading.
   * One stop per pane and Left and Right inside it is the roving pattern the
   * rail beside it already uses, and the card opens on focus, which is also
   * what a tap on a phone produces.
   */
  const onCodeKeyDown = (event: KeyboardEvent<HTMLPreElement>) => {
    if (event.key === 'Escape') {
      setToken(null);
      return;
    }

    const tokens = typed(code.current);
    const from = tokens.indexOf(document.activeElement as HTMLElement);
    if (from === -1) return;
    rove(event, tokens, from);
  };

  const pane = (
    <div
      className="nexus-behaviours__pane"
      data-pagefind-ignore="all"
      id={paneId}
    >
      <ConsoleFrame title={body ? `${body.where}:${body.line}` : 'Test case'}>
        <p className="nexus-behaviours__title">
          <Marker shape="corner" />
          {row?.title}
        </p>
        {body ? (
          <>
            {/* The markup is Shiki's, produced during this build from this
              repository's own test sources. Nothing a reader supplies reaches
              it, and the only tags in it are the highlighter's spans. */}
            <pre
              className="nexus-behaviours__body twoslash"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                  setToken(null);
              }}
              onFocus={reach}
              onKeyDown={onCodeKeyDown}
              onPointerLeave={leave}
              onPointerOver={reach}
            >
              <code
                dangerouslySetInnerHTML={{ __html: body.html }}
                ref={code}
              />
            </pre>
            {/* The type the build read off the compiler, stored once in the
              sidecar and cited here by the number the token carries. Always
              in the document, so the id a token's aria-describedby names
              exists before the token takes focus. Portalled to the body:
              Nextra's article has a backdrop-filter, which would make it the
              box a fixed card is placed in, and `place()` measures from the
              window. */}
            {createPortal(
              <div
                className="nexus-behaviours__type twoslash-popup-container"
                dangerouslySetInnerHTML={{ __html: popup ?? '' }}
                hidden={!open}
                id={cardId}
                onPointerEnter={stay}
                onPointerLeave={leave}
                ref={card}
                role="tooltip"
              />,
              document.body,
            )}
          </>
        ) : (
          <p className="nexus-behaviours__waiting">
            {unread
              ? `The cases for ${name} did not load. Reload the page to ask again.`
              : 'Reading the case from the package.'}
          </p>
        )}
      </ConsoleFrame>
    </div>
  );

  return pane;
}
