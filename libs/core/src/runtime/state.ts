import type { Blueprint } from '../blueprint/blueprint.js';
import { DisposedError } from '../errors/index.js';
import { Ownership, type OwnedEntry } from './ownership.js';
import { Slots } from './readiness.js';
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
}

/** A container that builds and owns instances. Task 22 adds scopes. */
export type ContainerState = RootState;

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
  };
  return state;
}

/** Public methods call this first (regression R17). */
export function assertOpen(root: RootState): void {
  if (root.disposing) throw new DisposedError({ target: 'container' });
}
