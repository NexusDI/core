'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type KeyboardEvent,
} from 'react';

import type { SearchPanelProps } from './SearchPanel';
import './search.css';

const noSubscription = () => () => undefined;

const FIELDS = new Set(['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA']);

/**
 * The docs search (site UX spec 13.5). It reads the same Pagefind index as
 * Nextra's component and replaces it, because the band placard and the filter
 * row need markup that component does not render.
 *
 * This file is the shell every page carries: the input, the shortcut hint and
 * the `/` and Ctrl-K or Cmd-K shortcuts. The results panel, its model and its
 * stylesheet load with `import()` on the first focus or keystroke
 * (`SearchPanel.tsx`), so a page nobody searches never fetches them.
 */
export default function Search({
  placeholder = 'Search documentation',
}: {
  placeholder?: string;
}) {
  const id = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const keysRef = useRef<
    ((event: KeyboardEvent<HTMLInputElement>) => void) | null
  >(null);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [activeId, setActiveId] = useState<string | undefined>();
  const [Panel, setPanel] = useState<ComponentType<SearchPanelProps> | null>(
    null,
  );
  const asked = useRef(false);
  const mac = useSyncExternalStore(
    noSubscription,
    () => navigator.userAgent.includes('Mac'),
    () => false,
  );

  const load = useCallback(() => {
    if (asked.current) return;
    asked.current = true;
    import('./SearchPanel').then(
      (loaded) => setPanel(() => loaded.default),
      () => {
        asked.current = false;
      },
    );
  }, []);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
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

  // A reader can type before the page hydrates, and the browser keeps the
  // text in the field. Read it back once, after the first render.
  useEffect(() => {
    const pending = window.setTimeout(() => {
      const typed = input.current?.value ?? '';
      if (typed) {
        setQuery(typed);
        load();
      }
      if (document.activeElement === input.current) setFocused(true);
    }, 0);
    return () => window.clearTimeout(pending);
  }, [load]);

  const close = useCallback(() => {
    setQuery('');
    input.current?.blur();
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (query) setQuery('');
      else input.current?.blur();
    } else keysRef.current?.(event);
  };

  const open = focused && query.trim() !== '';
  const listId = `${id}-list`;

  return (
    <div
      ref={wrapper}
      className="nextra-search nexus-search"
      onFocus={() => {
        setFocused(true);
        load();
      }}
      // The panel stays open while focus moves inside the search, so Tab
      // reaches the band buttons.
      onBlur={(event) => {
        if (!wrapper.current?.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <input
        ref={input}
        className="nexus-search__input"
        type="search"
        role="combobox"
        spellCheck={false}
        autoComplete="off"
        aria-label="Search the documentation"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        placeholder={`${placeholder}…`}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          load();
        }}
        onKeyDown={onKeyDown}
      />
      <kbd className="nexus-search__hint" aria-hidden="true" hidden={focused}>
        {mac ? '⌘K' : 'Ctrl K'}
      </kbd>
      {Panel ? (
        <Panel
          query={query}
          open={open}
          listId={listId}
          onActive={setActiveId}
          keysRef={keysRef}
          onNavigate={close}
        />
      ) : null}
    </div>
  );
}
