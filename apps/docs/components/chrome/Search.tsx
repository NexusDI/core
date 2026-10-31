'use client';

import { addBasePath } from 'next/dist/client/add-base-path';
import NextLink from 'next/link';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
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
import './search.css';

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

const noSubscription = () => () => undefined;

const FIELDS = new Set(['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA']);

/**
 * The docs search (site UX spec 13.5). It reads the same Pagefind index as
 * Nextra's component and replaces it, because the band placard and the filter
 * row need markup that component does not render. It keeps the `/` and
 * Ctrl-K or Cmd-K shortcuts and the base-path handling.
 */
export default function Search({
  placeholder = 'Search documentation',
}: {
  placeholder?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const term = useDeferredValue(query);
  const [focused, setFocused] = useState(false);
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
  const mac = useSyncExternalStore(
    noSubscription,
    () => navigator.userAgent.includes('Mac'),
    () => false,
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = document.activeElement;
      if (
        !el ||
        FIELDS.has(el.tagName) ||
        (el as HTMLElement).isContentEditable
      )
        return;
      const mod = navigator.userAgent.includes('Mac')
        ? event.metaKey
        : event.ctrlKey;
      if (event.key === '/' || (event.key === 'k' && !event.shiftKey && mod)) {
        event.preventDefault();
        input.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
  const open = focused && query.trim() !== '';
  const optionId = (at: number) => `${id}-option-${at}`;

  const close = useCallback(() => {
    setQuery('');
    input.current?.blur();
  }, []);

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (query) setQuery('');
      else input.current?.blur();
    } else if (event.key === 'ArrowDown' && hits.length > 0) {
      event.preventDefault();
      setActive((at) => (at + 1) % hits.length);
    } else if (event.key === 'ArrowUp' && hits.length > 0) {
      event.preventDefault();
      setActive((at) => (at <= 0 ? hits.length - 1 : at - 1));
    } else if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      document.getElementById(optionId(active))?.click();
    }
  };

  let at = -1;

  return (
    <div className="nextra-search nexus-search">
      <input
        ref={input}
        className="nexus-search__input"
        type="search"
        role="combobox"
        spellCheck={false}
        autoComplete="off"
        aria-label="Search the documentation"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        placeholder={`${placeholder}…`}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={onKeyDown}
      />
      <kbd className="nexus-search__hint" aria-hidden="true" hidden={focused}>
        {mac ? '⌘K' : 'Ctrl K'}
      </kbd>
      {/* The panel keeps focus in the input while a pointer works in it. */}
      <div
        className="nexus-search__panel"
        hidden={!open}
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
        <div
          id={`${id}-list`}
          className="nexus-search__list"
          role="listbox"
          aria-label="Search results"
        >
          {error ? (
            <p className="nexus-search__note nexus-search__note--error">
              {error}
            </p>
          ) : loading && groups.length === 0 ? (
            <p className="nexus-search__note">Loading…</p>
          ) : groups.length === 0 ? (
            <p className="nexus-search__note" role="status">
              No results found.
            </p>
          ) : (
            groups.map((each) => (
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
                {each.hits.map((hit) => {
                  at += 1;
                  const index = at;
                  return (
                    <NextLink
                      key={hit.url}
                      id={optionId(index)}
                      role="option"
                      aria-selected={index === active}
                      href={hit.url}
                      prefetch={false}
                      className="nexus-search__hit"
                      data-active={index === active || undefined}
                      onClick={close}
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
            ))
          )}
        </div>
      </div>
    </div>
  );
}
