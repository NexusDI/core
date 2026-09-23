import type { ModuleRef } from '../definitions/define-module.js';
import type { ScopeContext } from './scope-context.js';
import type { TraceEvent } from './trace.js';

export interface CreateOptions {
  /** Receives typed lifecycle events. */
  readonly trace?: (event: TraceEvent) => void;
  /** Enables runInScope() and currentScope(). Use nodeScopeContext() from '@nexusdi/core/node' on Node. */
  readonly scopeContext?: ScopeContext;
}

export interface LookupOptions {
  /** Resolve as if called from inside this module. */
  readonly module?: ModuleRef;
}
