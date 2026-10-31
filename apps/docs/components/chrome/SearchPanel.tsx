'use client';

import { addBasePath } from 'next/dist/client/add-base-path';
import NextLink from 'next/link';
import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
} from 'react';

import { bands } from '../../app/navigation';
import {
  bandRow,
  flatten,
  group,
  type BandCount,
  type Group,
  type PagefindResponse,
} from './search-model';
import './search-panel.css';

interface Pagefind {
  options(options: { baseUrl: string }): Promise<void>;
  debouncedSearch(
    term: string,
    options?: { filters?: Record<string, string> },
  ): Promise<
    (PagefindResponse & { totalFilters?: PagefindResponse['filters'] }) | null
  >;
}

declare global {
  interface Window {
    pagefind?: Pagefind;
  }
}

/**
 * Loads the index Pagefind wrote next to the export. The path goes through
 * `addBasePath`, and the index holds root-relative addresses, which
 * `next/link` resolves under the base path again (spec 15.4).
 */
async function loadPagefind(): Promise<void> {
  window.pagefind = (await import(
    /* webpackIgnore: true */
    addBasePath('/_pagefind/pagefind.js')
  )) as Pagefind;
  await window.pagefind.options({ baseUrl: '/' });
}

export interface SearchPanelProps {
  query: string;
  /** Whether the panel shows: the search has focus and the query has text. */
  open: boolean;
  listId: string;
  /** The id of the option the arrow keys reached, for the input's `aria-activedescendant`. */
  onActive: (id: string | undefined) => void;
  /** The panel puts its arrow and Enter handler here for the input to call. */
  keysRef: MutableRefObject<
    ((event: KeyboardEvent<HTMLInputElement>) => void) | null
  >;
  /** The reader followed a result. */
  onNavigate: () => void;
}

/**
 * The results half of the docs search (site UX spec 13.5). `Search.tsx` loads
 * it with `import()` on the first focus or keystroke, so a page nobody
 * searches never fetches this code, its model or its stylesheet.
 */
export default function SearchPanel({
  query,
  open,
  listId,
  onActive,
  keysRef,
  onNavigate,
}: SearchPanelProps) {
  const term = useDeferredValue(query);
  // The band the reader picked, for the query they picked it on.
  const [picked, setPicked] = useState<{ term: string; band: string } | null>(
    null,
  );
  const band = picked && picked.term === term ? picked.band : null;
  // What the last finished search found, keyed by the query and band it ran
  // for, so "loading" is the key the reader asks for being ahead of it.
  const [found, setFound] = useState<{
    key: string;
    groups: Group[];
    error: string;
  } | null>(null);
  const [row, setRow] = useState<BandCount[]>([]);
  const [active, setActive] = useState(-1);
  const list = useRef<HTMLDivElement>(null);

  const key = `${term}\u0000${band ?? ''}`;

  useEffect(() => {
    if (!term.trim()) return;
    let current = true;
    const run = async () => {
      if (!window.pagefind) {
        try {
          await loadPagefind();
        } catch (thrown) {
          if (!current) return;
          setFound({
            key,
            groups: [],
            error:
              thrown instanceof Error &&
              thrown.message.includes('Failed to fetch')
                ? 'The search index is built with the site, so it is missing in development. Run next build and start the export.'
                : String(thrown),
          });
          return;
        }
      }
      const response = await window.pagefind?.debouncedSearch(
        term,
        band ? { filters: { band } } : undefined,
      );
      if (!response || !current) return;
      const data = await Promise.all(response.results.map((r) => r.data()));
      if (!current) return;
      setFound({ key, groups: data.map(group), error: '' });
      // The row is measured on the unfiltered query and stays while a band is on.
      if (!band)
        setRow(
          bandRow(
            { results: response.results, filters: response.filters },
            bands,
          ),
        );
      setActive(-1);
    };
    void run();
    return () => {
      current = false;
    };
  }, [term, band, key]);

  const ready = found?.key === key;
  const loading = term.trim() !== '' && !ready;
  const error = ready ? found.error : '';
  const groups = term.trim() !== '' && found ? found.groups : [];
  const hits = flatten(groups);
  const optionId = (at: number) => `${listId}-option-${at}`;

  useEffect(() => {
    keysRef.current = (event) => {
      if (event.key === 'ArrowDown' && hits.length > 0) {
        event.preventDefault();
        setActive((at) => (at + 1) % hits.length);
      } else if (event.key === 'ArrowUp' && hits.length > 0) {
        event.preventDefault();
        setActive((at) => (at <= 0 ? hits.length - 1 : at - 1));
      } else if (event.key === 'Enter' && active >= 0) {
        event.preventDefault();
        document.getElementById(`${listId}-option-${active}`)?.click();
      }
    };
    return () => {
      keysRef.current = null;
    };
  }, [keysRef, hits.length, active, listId]);

  useEffect(() => {
    onActive(active >= 0 ? `${listId}-option-${active}` : undefined);
    if (active >= 0)
      document
        .getElementById(`${listId}-option-${active}`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [active, listId, onActive]);

  // Where each group's first option sits in the flat order the arrows walk.
  const offsets = groups.map((_, under) =>
    groups.slice(0, under).reduce((sum, each) => sum + each.hits.length, 0),
  );

  return (
    <div
      className="nexus-search__panel"
      hidden={!open}
      // A pointer in the panel keeps focus where it is, buttons included:
      // Safari gives a button no focus on click, so the input's blur would
      // close the panel before the click lands.
      onMouseDown={(event) => event.preventDefault()}
    >
      {row.length > 0 ? (
        <div
          className="nexus-search__bands"
          role="group"
          aria-label="Filter by band"
        >
          <button
            type="button"
            aria-pressed={band === null}
            onClick={() => setPicked(null)}
          >
            All
          </button>
          {row.map((each) => (
            <button
              key={each.band}
              type="button"
              aria-pressed={band === each.band}
              onClick={() => setPicked({ term, band: each.band })}
            >
              {each.band} <span>{each.count}</span>
            </button>
          ))}
        </div>
      ) : null}
      {error ? (
        <p
          className="nexus-search__note nexus-search__note--error"
          role="alert"
        >
          <svg
            viewBox="0 0 10 10"
            width="10"
            height="10"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M5 .8 9.2 5 5 9.2.8 5Z" fill="currentColor" />
          </svg>
          {error}
        </p>
      ) : loading && groups.length === 0 ? (
        <p className="nexus-search__note" role="status">
          Loading…
        </p>
      ) : groups.length === 0 ? (
        <p className="nexus-search__note" role="status">
          No results found.
        </p>
      ) : null}
      <div
        id={listId}
        ref={list}
        className="nexus-search__list"
        role="listbox"
        aria-label="Search results"
      >
        {groups.map((each, under) => (
          <div
            key={each.url}
            role="group"
            aria-label={each.title}
            className="nexus-search__group"
          >
            <p className="nexus-search__page" aria-hidden="true">
              <span>{each.title}</span>
              {each.band ? (
                <span className="nexus-search__band">{each.band}</span>
              ) : null}
            </p>
            {each.hits.map((hit, within) => {
              const index = (offsets[under] ?? 0) + within;
              return (
                <NextLink
                  key={hit.url}
                  id={optionId(index)}
                  role="option"
                  // Tab goes to the band buttons and out; the arrow keys walk
                  // the options.
                  tabIndex={-1}
                  aria-selected={index === active}
                  href={hit.url}
                  prefetch={false}
                  className="nexus-search__hit"
                  data-active={index === active || undefined}
                  onClick={onNavigate}
                >
                  <span className="nexus-search__title">{hit.title}</span>
                  <span
                    className="nexus-search__excerpt"
                    dangerouslySetInnerHTML={{ __html: hit.excerpt }}
                  />
                </NextLink>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
