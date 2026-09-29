import type { Blueprint } from '../blueprint/blueprint.js';
import { sameToken, type Canonicalizer } from '../blueprint/views.js';
import { DisposedError } from '../errors/index.js';
import type { Nexus } from './nexus.js';
import { Ownership, type OwnedEntry } from './ownership.js';
import { NO_PLUGINS, type PluginSet } from './plugins.js';
import { Slots } from './readiness.js';
import type { Scope } from './scope.js';
import type { Tracer } from './trace.js';

/** Why a built transient has no owner, for the `untracked` trace event. */
export type UntrackedReason = 'root-transient' | 'singleton-thunk';

export interface RootState {
  readonly kind: 'root';
  readonly scopeId: null;
  readonly request: undefined;
  readonly root: RootState;
  /** The Nexus create() returns. Construct hooks receive it before create resolves. */
  readonly handle: Nexus;
  readonly slots: Slots;
  /** Instances the root disposes, in creation order. */
  readonly owned: OwnedEntry[];
  /** The current blueprint. load() replaces it after its build succeeds. */
  blueprint: Blueprint;
  /** The module Nexus.create received. load() recompiles from it. */
  readonly rootRef: unknown;
  readonly ownership: Ownership;
  readonly tracer: Tracer;
  /** Factory provider id → whether its last build returned a thenable. */
  readonly asyncFlags: Map<string, boolean>;
  /** The plugins registered at create(). */
  readonly plugins: PluginSet;
  /**
   * The canonicalizer of the plugins' tokenKey hooks, for the container's
   * life, so load(), get() and the views key a token as create did.
   */
  readonly canon: Canonicalizer;
  /**
   * How many plugins, from the start of the array, finished their setup
   * step. Disposal runs the dispose hooks of these plugins only.
   */
  pluginsStarted: number;
  /** False when a plugin sets `onInit: false`. */
  readonly initEnabled: boolean;
  /** Set when disposal starts. Every public method checks it. */
  disposing: boolean;
  /** Set by the first [Symbol.asyncDispose]() call; later calls return it. */
  disposal: Promise<void> | undefined;
  /** load() calls run one at a time, in call order, on this chain. */
  loadQueue: Promise<void>;
  /** The create or load building right now. load() calls run one at a time. */
  run: Run | undefined;
  /**
   * Settles when create's build settles; undefined after that. createScope()
   * waits for it, so a construct hook that opens a scope during create gets
   * one built on every singleton.
   */
  building: Promise<void> | undefined;
  /** load(), createScope() and extend() operations still running. Disposal awaits them. */
  readonly inflight: Set<Promise<unknown>>;
  /**
   * Disposer errors from rolling back a load, createScope or extend() that
   * root disposal aborted mid-build. disposeRoot prepends these to its own
   * disposal errors before chaining them into its rejection.
   */
  readonly abortErrors: unknown[];
  /** Open scopes, oldest first. Disposal closes them newest first. */
  readonly scopes: Set<ScopeState>;
  /** The number the next scope id uses. */
  nextScope: number;
}

/** A child of the root. Scopes do not nest in 0.4. */
export interface ScopeState {
  readonly kind: 'scope';
  /** `s0`, `s1`, ... */
  readonly scopeId: string;
  /** What createScope({ request }) received; REQUEST resolves to it. */
  readonly request: unknown;
  readonly root: RootState;
  /** The Scope createScope() returns. Construct hooks receive it before createScope resolves. */
  readonly handle: Scope;
  readonly slots: Slots;
  /** Scoped and transient instances this scope disposes, in creation order. */
  readonly owned: OwnedEntry[];
  /** The blueprint the scope resolves against: the root's at creation, then extend()'s. */
  blueprint: Blueprint;
  /** Set by the first [Symbol.asyncDispose]() call; later calls return it. */
  disposal: Promise<void> | undefined;
  /** extend() calls run one at a time on this chain. */
  extendQueue: Promise<void>;
  /** The extend() building right now. */
  run: Run | undefined;
  /** The extend() in flight, and the blueprint it pins to. */
  pendingExtend:
    { readonly target: Blueprint; readonly promise: Promise<void> } | undefined;
  /**
   * Disposer errors from rolling back an extend() that the scope's own
   * disposal aborted. disposeScope reports them ahead of its own errors.
   */
  readonly abortErrors: unknown[];
}

/** A container that builds and owns instances. */
export type ContainerState = RootState | ScopeState;

export function createScopeState(
  root: RootState,
  request: unknown,
  wrap: (state: ScopeState) => Scope,
): ScopeState {
  const state: ScopeState = {
    kind: 'scope',
    scopeId: `s${root.nextScope++}`,
    request,
    root,
    get handle(): Scope {
      return handle;
    },
    slots: new Slots(),
    owned: [],
    blueprint: root.blueprint,
    disposal: undefined,
    extendQueue: Promise.resolve(),
    run: undefined,
    pendingExtend: undefined,
    abortErrors: [],
  };
  const handle = wrap(state);
  return state;
}

/**
 * What takes ownership of a built instance: a container, or the list an
 * extend() collects its builds in until they all settle.
 */
export interface Owner {
  readonly root: RootState;
  readonly owned: OwnedEntry[];
}

/**
 * A create, load or extend() in flight. A provider new in it that a request
 * builds on first use while it runs (an eager: false singleton or scoped
 * factory, a scoped class) joins `owner` and `touched`, so a failed run
 * disposes and forgets it with the rest of its builds.
 */
export interface Run {
  /** Whether the run's blueprint added this provider id. */
  readonly isNew: (id: string) => boolean;
  /** What the run built, in creation order, until it commits. */
  readonly owner: Owner;
  /** The slot ids the run filled, which its rollback abandons. */
  readonly touched: string[];
}

/** Who owns a transient built now: an owner, or nobody and why. */
export type TransientOwner = Owner | UntrackedReason;

/** Everything a resolution needs: the blueprint, the container, the transient owner. */
export interface Ctx {
  readonly bp: Blueprint;
  readonly container: ContainerState;
  readonly owner: TransientOwner;
}

export interface RootInit {
  readonly blueprint: Blueprint;
  readonly rootRef: unknown;
  readonly tracer: Tracer;
  readonly initEnabled: boolean;
  readonly plugins?: PluginSet;
  readonly canon?: Canonicalizer;
  /** Makes the Nexus that wraps the state. */
  readonly wrap: (state: RootState) => Nexus;
}

export function createRootState(init: RootInit): RootState {
  const fields: Omit<RootState, 'root' | 'handle'> = {
    kind: 'root',
    scopeId: null,
    request: undefined,
    slots: new Slots(),
    owned: [],
    blueprint: init.blueprint,
    rootRef: init.rootRef,
    ownership: new Ownership(),
    tracer: init.tracer,
    asyncFlags: new Map(),
    plugins: init.plugins ?? NO_PLUGINS,
    canon: init.canon ?? sameToken,
    pluginsStarted: 0,
    initEnabled: init.initEnabled,
    disposing: false,
    disposal: undefined,
    loadQueue: Promise.resolve(),
    run: undefined,
    building: undefined,
    inflight: new Set(),
    abortErrors: [],
    scopes: new Set(),
    nextScope: 0,
  };
  // Data properties, set once the object exists. get() reads
  // container.root on every lookup, and a getter there is a call per get.
  const state = fields as { -readonly [K in keyof RootState]: RootState[K] };
  state.root = state;
  state.handle = init.wrap(state);
  return state;
}

/**
 * Public methods call this first (regression R17). startBlueprint,
 * buildScope and runInit also call it after each build level, so a
 * disposal that starts mid-run stops the next level from starting.
 */
export function assertOpen(root: RootState): void {
  if (root.disposing) throw new DisposedError({ target: 'container' });
}

/** Keeps `work` in `set` until it settles, without creating an unhandled rejection. */
export function track(
  set: Set<Promise<unknown>>,
  work: Promise<unknown>,
): void {
  set.add(work);
  const done = (): void => {
    set.delete(work);
  };
  work.then(done, done);
}
