'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent,
} from 'react';

import type { BehaviourPaneProps } from './BehaviourPane';
// The frame and the rail, which the server renders, so the rail is styled
// before the pane loads and with JavaScript off.
import './catalogue.css';

/**
 * What a package's tests state about one export: the names in a rail, the case
 * behind the selected name beside it.
 *
 * A flat list answers half the question. A reader sees that an export states
 * 26 sentences and cannot see what any of them checks, and 26 lines of prose
 * under a signature push the next entry off the screen. So the rail and the
 * pane divide the block: the rail is the catalogue, the pane is one case, and
 * the block is the same height whether the export states 3 sentences or 32.
 *
 * This file is the shell every page carries. Nextra 4 serves every MDX page
 * from one catch-all route, so each client component reachable from
 * `mdx-components.js` ships with every page, a guide included. The shell holds
 * the rail, which the server renders because Pagefind indexes its sentences,
 * and the rail's selection and arrow keys, so focus on the rail survives the
 * load. `BehaviourPane.tsx` holds the pane, the type card, the token keyboard
 * walk, the sidecar fetch and both stylesheets, and the shell imports it with
 * `import()` when the reader scrolls the block near the window. A page with
 * no catalogue never fetches it.
 *
 * It is a listbox, since a tab strip puts the labels in a row and needs them
 * short, and these are sentences. The rail is a single-select list, arrow keys
 * move the selection, and `aria-activedescendant` keeps focus on the rail
 * while the pane follows. The pane sits after the listbox in both layouts,
 * never inside it, since a listbox holds options only; the rail names it with
 * `aria-controls`. On a phone the pane goes under the rail.
 */

/** One sentence a test carries, with the case the sidecar keys by that number. */
export interface BehaviourRow {
  title: string;
  id: number;
}

/** The sentences under one `describe` the suite wrote. */
export interface BehaviourGroup {
  label: string;
  rows: BehaviourRow[];
}

export interface BehaviourCatalogueProps {
  /** The package's own directory, which its sidecars sit under. */
  library: string;
  /** The export this catalogue belongs to, which names its sidecar. */
  name: string;
  groups: BehaviourGroup[];
}

/** Every row the rail holds, in the order the arrow keys walk them. */
function rowsOf(groups: readonly BehaviourGroup[]): BehaviourRow[] {
  return groups.flatMap((group) => group.rows);
}

/** Keeps the selected row inside the rail's own scroll, never the page's. */
function reveal(rail: HTMLElement | null, option: string): void {
  const row = rail?.querySelector<HTMLElement>(`#${CSS.escape(option)}`);
  if (!rail || !row) return;

  const inside = row.getBoundingClientRect();
  const frame = rail.getBoundingClientRect();
  if (inside.top < frame.top) rail.scrollTop += inside.top - frame.top;
  else if (inside.bottom > frame.bottom)
    rail.scrollTop += inside.bottom - frame.bottom;
}

export default function BehaviourCatalogue({
  library,
  name,
  groups,
}: BehaviourCatalogueProps) {
  const prefix = useId();
  const rows = rowsOf(groups);
  const [at, setAt] = useState(0);
  const [Pane, setPane] = useState<ComponentType<BehaviourPaneProps> | null>(
    null,
  );
  const [unloaded, setUnloaded] = useState(false);
  const block = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const moved = useRef(false);

  const paneId = `${prefix}-pane`;

  const optionId = useCallback(
    (index: number) => `${prefix}-case-${index}`,
    [prefix],
  );

  // The pane's code and styles are asked for when the reader reaches the
  // block, and never on a page the reader does not scroll to one.
  useEffect(() => {
    const element = block.current;
    if (!element) return;

    let live = true;
    const watch = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        watch.disconnect();
        // A chunk a deploy has replaced fails to load; the slot says so in
        // the words the pane uses for a sidecar that did not load.
        import('./BehaviourPane').then(
          (loaded) => {
            if (live) setPane(() => loaded.default);
          },
          () => {
            if (live) setUnloaded(true);
          },
        );
      },
      { rootMargin: '200px' },
    );

    watch.observe(element);
    return () => {
      live = false;
      watch.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!moved.current) return;
    reveal(rail.current, optionId(at));
  }, [at, optionId]);

  const select = (index: number) => {
    moved.current = true;
    setAt(Math.min(Math.max(index, 0), rows.length - 1));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const steps: Record<string, number | undefined> = {
      ArrowDown: at + 1,
      ArrowUp: at - 1,
      Home: 0,
      End: rows.length - 1,
      PageDown: at + 8,
      PageUp: at - 8,
    };
    const next = steps[event.key];
    if (next === undefined) return;

    event.preventDefault();
    select(next);
  };

  // Where each group's first row sits in the flat order the arrow keys walk, so
  // a row knows its own index without a counter the render mutates.
  const offsets = groups.map((_, under) =>
    groups.slice(0, under).reduce((sum, each) => sum + each.rows.length, 0),
  );

  return (
    <div className="nexus-behaviours" ref={block}>
      <div
        className="nexus-behaviours__rail"
        ref={rail}
        role="listbox"
        tabIndex={0}
        aria-label={`What ${name}'s tests state`}
        aria-activedescendant={optionId(at)}
        aria-controls={paneId}
        onKeyDown={onKeyDown}
      >
        {groups.map((group, under) => (
          <div
            className="nexus-behaviours__group"
            key={group.label}
            role="group"
            aria-labelledby={`${prefix}-group-${under}`}
          >
            <p
              className="nexus-behaviours__label"
              id={`${prefix}-group-${under}`}
              role="presentation"
            >
              {group.label}
            </p>
            {group.rows.map((each, within) => {
              const index = (offsets[under] ?? 0) + within;

              return (
                <div
                  className="nexus-behaviours__row"
                  id={optionId(index)}
                  key={each.id}
                  role="option"
                  aria-selected={index === at}
                  onClick={() => select(index)}
                >
                  {each.title}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {Pane ? (
        <Pane library={library} name={name} row={rows[at]} paneId={paneId} />
      ) : (
        // Where the pane mounts, so the rail's aria-controls names an element
        // from the first render.
        <div
          className="nexus-behaviours__pane"
          data-pagefind-ignore="all"
          id={paneId}
        >
          {unloaded ? (
            <p className="nexus-behaviours__waiting">
              The cases for {name} did not load. Reload the page to ask again.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
