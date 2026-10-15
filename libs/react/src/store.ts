import type { ModuleRef, Nexus, Scope } from '@nexusdi/core';

/** The promise one lazySection handle renders behind. */
export interface SectionEntry {
  /** Resolves when the module is in the container and every live scope is extended. */
  readonly promise: Promise<void>;
  /** For a first load, the module object in the container once load() resolved. */
  module: ModuleRef | undefined;
  /** The marked rejection, once the promise rejected. */
  failure: unknown;
}

/** One section name in one container (react spec 7.1, 12.3). */
export interface SectionSlot {
  /** The handle whose loader put the module in the container. */
  readonly handle: object;
  readonly origin: SectionEntry;
  /** Every other handle of this name, each checked against `origin` once. */
  readonly checks: WeakMap<object, SectionEntry>;
}

type Memo = Map<unknown, Map<unknown, readonly unknown[]>>;

/**
 * What the components of one container share: the MultiToken memo (react
 * spec 4.3), the scopes ScopeProviders hold, and the section cache (react
 * spec 7.1).
 */
export class Store {
  readonly #memos = new WeakMap<Nexus | Scope, Memo>();

  /** The scopes ScopeProviders of this container hold, settled and not disposed. */
  readonly live = new Set<Scope>();
  /** The createScope calls still in flight. */
  readonly pending = new Set<Promise<Scope>>();

  /** Section name to the load its boundaries read (react spec 7.1, 12.3). */
  readonly sections = new Map<string, SectionSlot>();

  constructor(readonly container: Nexus) {}

  /**
   * extend() on every live scope and on every scope still being created
   * once it settles (react spec 6.5), so a token a load() added resolves
   * under every ScopeProvider. Section boundaries call it after a load.
   */
  async extendAll(): Promise<void> {
    await Promise.allSettled([...this.pending]);
    // A ScopeProvider that unmounts while its extend() runs disposes the
    // scope, and core rejects that extend. The scope has left `live` by
    // then, and its error concerns no one: the dialog is gone.
    await Promise.all(
      [...this.live].map((scope) =>
        scope.extend().catch((error: unknown) => {
          if (this.live.has(scope)) throw error;
        }),
      ),
    );
  }

  /** The stored array while `next` holds the same elements by ===, else `next`, frozen and stored. */
  memo(
    resolver: Nexus | Scope,
    token: unknown,
    module: unknown,
    next: readonly unknown[],
  ): readonly unknown[] {
    let byToken = this.#memos.get(resolver);
    if (byToken === undefined) {
      byToken = new Map();
      this.#memos.set(resolver, byToken);
    }
    let byModule = byToken.get(token);
    if (byModule === undefined) {
      byModule = new Map();
      byToken.set(token, byModule);
    }
    const stored = byModule.get(module);
    if (
      stored !== undefined &&
      stored.length === next.length &&
      stored.every((item, i) => item === next[i])
    )
      return stored;
    const frozen = Object.freeze([...next]);
    byModule.set(module, frozen);
    return frozen;
  }
}

const stores = new WeakMap<Nexus, Store>();

/** The one store of `container`. */
export function storeFor(container: Nexus): Store {
  let store = stores.get(container);
  if (store === undefined) {
    store = new Store(container);
    stores.set(container, store);
  }
  return store;
}
