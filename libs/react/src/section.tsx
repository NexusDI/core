import {
  loadOnce,
  moduleDefinitionOf,
  type LoadOptions,
  type ModuleRef,
} from '@nexusdi/core';
import {
  Component,
  Suspense,
  use,
  useLayoutEffect,
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode,
} from 'react';

import { useNexusContext } from './context.js';
import { dev } from './dev.js';
import {
  sectionConflict,
  sectionFailed,
  type SectionConflictError,
  type SectionError,
} from './errors.js';
import { useHydrated } from './hydrated.js';
import type { SectionEntry, SectionSlot, Store } from './store.js';

/** The handle `lazySection` returns: the section's name, the loader that imports its module and the options its load takes. */
export interface LazySection {
  readonly name: string;
  readonly loader: () => Promise<ModuleRef>;
  readonly options?: LoadOptions;
}

/**
 * A module-level handle for a section: its name, its loader and the
 * `options` its load takes, such as `imports` for the modules of the host
 * graph the section sees. It runs nothing; a SectionBoundary calls the
 * loader once per container and loads the module with the options.
 */
export function lazySection(
  name: string,
  loader: () => Promise<ModuleRef>,
  options?: LoadOptions,
): LazySection {
  return Object.freeze({ name, loader, options });
}

/** The error an `errorFallback` and `onError` receive: the SectionError of a load failure, with the load error as its `cause`, or the SectionConflictError of a conflict. */
type SectionFailure = SectionError | SectionConflictError;

/** The props of `SectionBoundary`: the section to load, the fallbacks for loading and for a load failure, and a callback for each failure. */
export interface SectionBoundaryProps {
  section: LazySection;
  /** Rendered on the server, during hydration and while the section loads. */
  fallback?: ReactNode;
  /** Rendered for a load failure. It receives the SectionError, with the load error as its `cause`. Without it the boundary rethrows that SectionError. */
  errorFallback?: ComponentType<{ error: SectionFailure; retry(): void }>;
  /** Called once per load failure with the same error `errorFallback` receives. */
  onError?(error: SectionFailure): void;
  children?: ReactNode;
}

/**
 * Each rejection of a section's promise, mapped to the section it belongs
 * to. The boundary hands onError, errorFallback and React the marked error
 * itself: a SectionError that carries the load error as its cause, or a
 * SectionConflictError.
 */
const loadFailures = new WeakMap<Error, { section: string }>();

/**
 * The load failure of `section` that `thrown` is, or undefined. A
 * boundary passes every other error to the app's own boundary, a nested
 * section's failure included.
 */
const failureOf = (thrown: unknown, section: string) => {
  const failure =
    thrown instanceof Error ? loadFailures.get(thrown) : undefined;
  return failure?.section === section ? failure : undefined;
};

const marked = (section: string, error: unknown): Error => {
  if (error instanceof Error && loadFailures.has(error)) return error;
  const failure = sectionFailed(section, error);
  loadFailures.set(failure, { section });
  return failure;
};

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

  constructor(section: string, run: (entry: Entry) => Promise<void>) {
    this.promise = run(this).catch((error: unknown) => {
      this.failure = marked(section, error);
      throw this.failure;
    });
  }
}

/** The loader, then load(), then extend() on every live scope (react spec 7.1, step 2). */
function firstLoad(store: Store, section: LazySection): SectionEntry {
  return new Entry(section.name, (entry) =>
    call(section).then(async (module) => {
      await loadOnce(store.container)(module, section.options);
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

/** Whether two handles import the same modules, compared by identity with order and repeats ignored, as loadOnce keys them. */
function sameLoadImports(
  a: { readonly options?: LoadOptions },
  b: { readonly options?: LoadOptions },
): boolean {
  const first = new Set(a.options?.imports);
  const second = new Set(b.options?.imports);
  return first.size === second.size && [...first].every((m) => second.has(m));
}

/**
 * A second handle for a section name: its module object and load imports against
 * the ones `handle` and `origin` loaded (react spec 12.3). The same module
 * object and load imports mean only the file holding lazySection changed.
 */
function recheck(
  handle: SectionSlot['handle'],
  origin: SectionEntry,
  section: LazySection,
): SectionEntry {
  const conflict = () => {
    const error = sectionConflict(section.name);
    loadFailures.set(error, { section: section.name });
    return error;
  };
  return new Entry(section.name, () =>
    origin.promise
      .then(() => call(section))
      .then((module) => {
        if (module === origin.module && sameLoadImports(handle, section))
          return;
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
    entry = recheck(slot.handle, slot.origin, section);
    slot.checks.set(section, entry);
  }
  return entry;
}

/**
 * After `failure`, the next render of `section` starts afresh. A failed
 * first load, and every recheck that waited on it, clears the name; a
 * failed recheck clears its own handle and leaves the load it checked.
 */
function forget(store: Store, section: LazySection, failure: Error) {
  const slot = store.sections.get(section.name);
  if (slot === undefined) return;
  if (slot.origin.failure === failure) store.sections.delete(section.name);
  else if (slot.checks.get(section)?.failure === failure)
    slot.checks.delete(section);
}

/**
 * Commits, then reports `failure` and throws it on its next render. A
 * failure reaches React only after a commit, so a render React retries or
 * discards reports and clears nothing, and every failure clears its entry.
 */
function Deliver({
  failure,
  report,
}: {
  failure: Error;
  report(failure: Error): void;
}): ReactNode {
  const [thrown, setThrown] = useState(false);
  useLayoutEffect(() => {
    report(failure);
    // The commit is the point: the next render throws the failure to React.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the throw must follow a commit
    setThrown(true);
  }, [failure, report]);
  if (thrown) throw failure;
  return null;
}

function Gate({
  section,
  report,
  children,
}: {
  section: LazySection;
  report(failure: Error): void;
  children?: ReactNode;
}): ReactNode {
  const { store } = useNexusContext('SectionBoundary');
  const entry = entryFor(store, section);
  if (entry.failure === undefined) use(entry.promise);
  if (entry.failure !== undefined)
    return <Deliver failure={entry.failure as Error} report={report} />;
  return children;
}

interface CatcherProps {
  readonly store: Store;
  readonly section: LazySection;
  readonly errorFallback?: SectionBoundaryProps['errorFallback'];
  readonly onError?: SectionBoundaryProps['onError'];
  readonly fallback: ReactNode;
  readonly children?: ReactNode;
}

class Catcher extends Component<CatcherProps, { failure: unknown }> {
  override state: { failure: unknown } = { failure: null };

  /** The failures this boundary has reported to onError and cleared from the store. */
  private readonly reported = new WeakSet<Error>();

  /** The load promises this boundary watches for a failure after it unmounts. */
  private readonly watched = new WeakSet<Promise<void>>();

  private mounted = false;

  static getDerivedStateFromError(error: unknown) {
    return { failure: error };
  }

  /** Clears the store entry and calls onError, once per failure of this boundary. */
  private readonly report = (
    failure: Error,
    section: LazySection = this.props.section,
  ) => {
    if (this.reported.has(failure)) return;
    this.reported.add(failure);
    forget(this.props.store, section, failure);
    this.props.onError?.(failure as SectionFailure);
  };

  /**
   * Watches the entry Gate rendered last. A boundary unmounted before that
   * load fails reports at once, so the entry clears and a later boundary
   * loads again. A retry or a new handle gives Gate a new entry, and the
   * next commit watches that one too.
   */
  private watch() {
    const { store, section } = this.props;
    const slot = store.sections.get(section.name);
    const entry =
      slot?.handle === section ? slot.origin : slot?.checks.get(section);
    if (entry === undefined || this.watched.has(entry.promise)) return;
    this.watched.add(entry.promise);
    entry.promise.catch((thrown: unknown) => {
      if (!this.mounted && failureOf(thrown, section.name) !== undefined)
        this.report(thrown as Error, section);
    });
  }

  override componentDidMount() {
    this.mounted = true;
    this.watch();
  }

  override componentDidUpdate() {
    this.watch();
  }

  override componentWillUnmount() {
    this.mounted = false;
  }

  override render() {
    const { failure } = this.state;
    if (failure === null)
      return (
        <Suspense fallback={this.props.fallback}>
          <Gate section={this.props.section} report={this.report}>
            {this.props.children}
          </Gate>
        </Suspense>
      );
    const Fallback = this.props.errorFallback;
    // The section's own components threw, or no errorFallback: the app's boundary handles it.
    if (
      failureOf(failure, this.props.section.name) === undefined ||
      Fallback === undefined
    )
      throw failure;
    return (
      <Fallback
        error={failure as SectionFailure}
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
      fallback={fallback}
    >
      {children}
    </Catcher>
  );
}
