/**
 * `@nexusdi/node`: the ambient scope for Node. The only package that imports
 * a `node:` module. It needs no core hook, because no core code reads a
 * current scope. It is a plain object that registers with no container.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import type { Scope } from '@nexusdi/core';

export interface NodeScopes {
  /** Runs `fn` with `scope` as the current scope of its async context. */
  run<R>(scope: Scope, fn: () => R): R;
  /** The scope of the enclosing run, or undefined outside one. */
  current(): Scope | undefined;
}

/** One AsyncLocalStorage per call. */
export function nodeScopes(): NodeScopes {
  const storage = new AsyncLocalStorage<Scope>();
  return {
    run: (scope, fn) => storage.run(scope, fn),
    current: () => storage.getStore(),
  };
}
