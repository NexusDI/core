import type { Scope } from './scope.js';

/**
 * Binds a scope to the current async context, so code deep in a call chain
 * finds its request's scope. `@nexusdi/core/node` implements it with
 * AsyncLocalStorage; a later adapter can wrap AsyncContext.Variable.
 */
export interface ScopeContext {
  run<R>(scope: Scope, fn: () => R): R;
  current(): Scope | undefined;
}
