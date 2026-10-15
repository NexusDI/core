import type { Nexus, Scope } from '@nexusdi/core';

type Memo = Map<unknown, Map<unknown, readonly unknown[]>>;

/**
 * What the components of one container share: the MultiToken memo (react
 * spec 4.3). Tasks 13 and 14 add the scope set and the section cache.
 */
export class Store {
  readonly #memos = new WeakMap<Nexus | Scope, Memo>();

  constructor(readonly container: Nexus) {}

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
