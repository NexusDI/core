import { moduleDefinitionOf, type ModuleRef } from '@nexusdi/core';
import {
  Component,
  Suspense,
  use,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';

import { useNexusContext } from './context.js';
import { dev } from './dev.js';
import { sectionConflict } from './errors.js';
import { useHydrated } from './hydrated.js';
import type { SectionEntry, Store } from './store.js';

export interface LazySection {
  readonly name: string;
  readonly loader: () => Promise<ModuleRef>;
}

/**
 * A module-level handle for a section: its name and its loader. It runs
 * nothing; a SectionBoundary calls the loader once per container.
 */
export function lazySection(
  name: string,
  loader: () => Promise<ModuleRef>,
): LazySection {
  return Object.freeze({ name, loader });
}

export interface SectionBoundaryProps {
  section: LazySection;
  /** Rendered on the server, during hydration and while the section loads. */
  fallback?: ReactNode;
  /** Rendered for a load failure. Without it the boundary rethrows the error. */
  errorFallback?: ComponentType<{ error: unknown; retry(): void }>;
  /** Called once per load failure. */
  onError?(error: unknown): void;
  children?: ReactNode;
}

/**
 * The marker on a rejected section promise. The boundary handles what it
 * wraps and passes every other error to the app's own boundary.
 */
class LoadFailure {
  constructor(readonly error: unknown) {}
}

const marked = (error: unknown): LoadFailure =>
  error instanceof LoadFailure ? error : new LoadFailure(error);

/** The loader's promise, with a loader that throws at once read as a rejection. */
const call = (section: LazySection): Promise<ModuleRef> =>
  new Promise((resolve) => resolve(section.loader()));

const RELOAD_KEY = 'nexusdi:section-reload';
const RELOAD_WINDOW_MS = 10_000;

/**
 * The development guard of react spec 12.3. 'conflict' when this section
 * reloaded the page less than 10 seconds ago, so the reload did not clear
 * it, or when storage throws; 'reload' after it records this reload.
 */
function reloadOrConflict(name: string): 'reload' | 'conflict' {
  try {
    const raw = sessionStorage.getItem(RELOAD_KEY);
    const last =
      raw === null
        ? undefined
        : (JSON.parse(raw) as { section?: unknown; at?: unknown });
    if (
      last?.section === name &&
      typeof last.at === 'number' &&
      Date.now() - last.at < RELOAD_WINDOW_MS
    ) {
      sessionStorage.removeItem(RELOAD_KEY);
      return 'conflict';
    }
    sessionStorage.setItem(
      RELOAD_KEY,
      JSON.stringify({ section: name, at: Date.now() }),
    );
    return 'reload';
  } catch {
    return 'conflict';
  }
}

/** An entry whose promise records its marked rejection, so a boundary can tell whose load failed. */
class Entry implements SectionEntry {
  module: ModuleRef | undefined = undefined;
  failure: unknown = undefined;
  readonly promise: Promise<void>;

  constructor(run: (entry: Entry) => Promise<void>) {
    this.promise = run(this).catch((error: unknown) => {
      this.failure = marked(error);
      throw this.failure;
    });
  }
}

/** The loader, then load(), then extend() on every live scope (react spec 7.1, step 2). */
function firstLoad(store: Store, section: LazySection): SectionEntry {
  return new Entry((entry) =>
    call(section).then(async (module) => {
      await store.container.load(module);
      entry.module = module;
      await store.extendAll();
    }),
  );
}

/**
 * Set once this page has asked for a reload. Later rechecks wait for the
 * page to go away, so a second edit before the reload shows no conflict.
 */
let reloading = false;

const pageLeaving = () => new Promise<void>(() => undefined);

/**
 * A second handle for a section name: its module object against the one
 * `origin` loaded (react spec 12.3). The same object means only the file
 * holding lazySection changed.
 */
function recheck(origin: SectionEntry, section: LazySection): SectionEntry {
  const conflict = () => sectionConflict(section.name);
  return new Entry(() =>
    origin.promise
      .then(() => call(section))
      .then((module) => {
        if (module === origin.module) return;
        if (reloading) return pageLeaving();
        const loaded = moduleDefinitionOf(origin.module)?.name;
        if (!dev || moduleDefinitionOf(module)?.name !== loaded)
          throw conflict();
        if (reloadOrConflict(section.name) === 'conflict') throw conflict();
        reloading = true;
        console.info(
          `@nexusdi/react: the module of section '${section.name}' changed. Reloading the page.`,
        );
        globalThis.location.reload();
        return pageLeaving();
      }),
  );
}

/**
 * The entry for this handle. A render may run this more than once, or be
 * discarded: each call for one (container, name, handle) returns the
 * stored entry, so the cache write is idempotent.
 */
function entryFor(store: Store, section: LazySection): SectionEntry {
  const slot = store.sections.get(section.name);
  if (slot === undefined) {
    const origin = firstLoad(store, section);
    store.sections.set(section.name, {
      handle: section,
      origin,
      checks: new WeakMap(),
    });
    return origin;
  }
  if (slot.handle === section) return slot.origin;
  let entry = slot.checks.get(section);
  if (entry === undefined) {
    entry = recheck(slot.origin, section);
    slot.checks.set(section, entry);
  }
  return entry;
}

/**
 * After `failure`, the next render of `section` starts afresh. A failed
 * first load, and every recheck that waited on it, clears the name; a
 * failed recheck clears its own handle and leaves the load it checked.
 */
function forget(store: Store, section: LazySection, failure: LoadFailure) {
  const slot = store.sections.get(section.name);
  if (slot === undefined) return;
  if (slot.origin.failure === failure) store.sections.delete(section.name);
  else if (slot.checks.get(section)?.failure === failure)
    slot.checks.delete(section);
}

function Gate({
  section,
  children,
}: {
  section: LazySection;
  children?: ReactNode;
}): ReactNode {
  const { store } = useNexusContext('SectionBoundary');
  use(entryFor(store, section).promise);
  return children;
}

interface CatcherProps {
  readonly store: Store;
  readonly section: LazySection;
  readonly errorFallback?: ComponentType<{ error: unknown; retry(): void }>;
  readonly onError?: (error: unknown) => void;
  readonly children?: ReactNode;
}

class Catcher extends Component<CatcherProps, { failure: unknown }> {
  override state: { failure: unknown } = { failure: null };

  static getDerivedStateFromError(error: unknown) {
    return { failure: error };
  }

  override componentDidCatch(error: unknown) {
    if (!(error instanceof LoadFailure)) return;
    forget(this.props.store, this.props.section, error);
    this.props.onError?.(error.error);
  }

  override render() {
    const { failure } = this.state;
    if (failure === null) return this.props.children;
    // The section's own components threw: the app's boundary handles it.
    if (!(failure instanceof LoadFailure)) throw failure;
    const Fallback = this.props.errorFallback;
    if (Fallback === undefined) throw failure.error;
    return (
      <Fallback
        error={failure.error}
        retry={() => this.setState({ failure: null })}
      />
    );
  }
}

/**
 * Loads `section` into the container once, extends every live scope, and
 * renders `children` when that is done (react spec 7). Unmounting it leaves
 * the module loaded.
 */
export function SectionBoundary({
  section,
  fallback = null,
  errorFallback,
  onError,
  children,
}: SectionBoundaryProps): ReactElement {
  const { store } = useNexusContext('SectionBoundary');
  const hydrated = useHydrated();
  if (!hydrated) return <>{fallback}</>;
  return (
    // A boundary switched to another section drops the old one's failure.
    <Catcher
      key={section.name}
      store={store}
      section={section}
      errorFallback={errorFallback}
      onError={onError}
    >
      <Suspense fallback={fallback}>
        <Gate section={section}>{children}</Gate>
      </Suspense>
    </Catcher>
  );
}
