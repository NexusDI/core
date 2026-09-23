import type { ModuleRef } from '../definitions/define-module.js';
import type { TraceEvent } from './trace.js';

export interface CreateOptions {
  /** Receives typed lifecycle events. */
  readonly trace?: (event: TraceEvent) => void;
}

export interface LookupOptions {
  /** Resolve as if called from inside this module. */
  readonly module?: ModuleRef;
}
