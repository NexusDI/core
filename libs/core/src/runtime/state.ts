import type { Blueprint } from '../blueprint/blueprint.js';
import { DisposedError } from '../errors/index.js';
import { Ownership, type OwnedEntry } from './ownership.js';
import { Slots } from './readiness.js';
import type { ScopeContext } from './scope-context.js';
import type { Tracer } from './trace.js';

/** Why a built transient has no owner, for the `untracked` trace event. */
export type UntrackedReason = 'root-transient' | 'singleton-thunk';

export interface RootState {
  readonly kind: 'root';
  readonly scopeId: null;
  readonly request: undefined;
  readonly root: RootState;
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
  /** False only for createTestingContainer().create({ onInit: false }). */
  readonly initEnabled: boolean;
  /** Set when disposal starts. Every public method checks it. */
  disposing: boolean;
  /** load() calls run one at a time, in call order, on this chain. */
  loadQueue: Promise<void>;
  /** load() and createScope() operations still running. Disposal awaits them. */
  readonly inflight: Set<Promise<unknown>>;
  /** Open scopes, oldest first. Disposal closes them newest first. */
  readonly scopes: Set<ScopeState>;
  /** The number the next scope id uses. */
  nextScope: number;
  /** Binds a scope to the current async context for runInScope()/currentScope(). */
  readonly scopeContext: ScopeContext | undefined;
}

/** A child of the root. Scopes do not nest in 0.4. */
export interface ScopeState {
  readonly kind: 'scope';
  /** `s0`, `s1`, ... */
  readonly scopeId: string;
  /** What createScope({ request }) received; REQUEST resolves to it. */
  readonly request: unknown;
  readonly root: RootState;
  readonly slots: Slots;
  /** Scoped and transient instances this scope disposes, in creation order. */
  readonly owned: OwnedEntry[];
  /** The blueprint current when the scope was created. */
  readonly blueprint: Blueprint;
  /** Set by the first [Symbol.asyncDispose]() call; later calls return it. */
  disposal: Promise<void> | undefined;
}

/** A container that builds and owns instances. */
export type ContainerState = RootState | ScopeState;

export function createScopeState(
  root: RootState,
  request: unknown,
): ScopeState {
  return {
    kind: 'scope',
    scopeId: `s${root.nextScope++}`,
    request,
    root,
    slots: new Slots(),
    owned: [],
    blueprint: root.blueprint,
    disposal: undefined,
  };
}

/** Who owns a transient built now: a container, or nobody and why. */
export type TransientOwner = ContainerState | UntrackedReason;

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
  readonly scopeContext: ScopeContext | undefined;
}

export function createRootState(init: RootInit): RootState {
  const state: RootState = {
    kind: 'root',
    scopeId: null,
    request: undefined,
    get root(): RootState {
      return state;
    },
    slots: new Slots(),
    owned: [],
    blueprint: init.blueprint,
    rootRef: init.rootRef,
    ownership: new Ownership(),
    tracer: init.tracer,
    asyncFlags: new Map(),
    initEnabled: init.initEnabled,
    disposing: false,
    loadQueue: Promise.resolve(),
    inflight: new Set(),
    scopes: new Set(),
    nextScope: 0,
    scopeContext: init.scopeContext,
  };
  return state;
}

/** Public methods call this first (regression R17). */
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
