/**
 * `@nexusdi/node`: the ambient scope for Node. The only package that imports
 * a `node:` module. It needs no core hook, because no core code reads a
 * current scope. It is a plain object that registers with no container.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import type { Scope } from '@nexusdi/core';

/**
 * The scope context `nodeScopes()` returns: one `AsyncLocalStorage` that holds
 * the current scope for a run.
 *
 * `run(scope, fn)` calls `fn` with `scope` as the current scope of its async
 * context and returns what `fn` returns. Code `fn` awaits, and callbacks it
 * schedules, see the same scope. `current()` returns that scope, or undefined
 * outside a run. Two runs in flight at once each see their own scope.
 */
export interface NodeScopes {
  /** Runs `fn` with `scope` as the current scope of its async context. */
  run<R>(scope: Scope, fn: () => R): R;
  /** The scope of the enclosing run, or undefined outside one. */
  current(): Scope | undefined;
}

/**
 * Returns a scope context for Node, backed by its own AsyncLocalStorage, so
 * each call keeps its runs apart.
 */
export function nodeScopes(): NodeScopes {
  const storage = new AsyncLocalStorage<Scope>();
  return {
    run: (scope, fn) => storage.run(scope, fn),
    current: () => storage.getStore(),
  };
}
