/// <reference lib="esnext.disposable" preserve="true" />
/**
 * `@nexusdi/core/node`: the ScopeContext for Node. The only file in
 * @nexusdi/core that imports a `node:` module.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

import type { Scope, ScopeContext } from '../index.js';

/**
 * A ScopeContext backed by one AsyncLocalStorage. Create one per container:
 *
 *     const ship = await Nexus.create(Meridian, { scopeContext: nodeScopeContext() });
 */
export function nodeScopeContext(): ScopeContext {
  const storage = new AsyncLocalStorage<Scope>();
  return {
    run: (scope, fn) => storage.run(scope, fn),
    current: () => storage.getStore(),
  };
}
