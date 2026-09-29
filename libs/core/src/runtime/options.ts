import type { ModuleRef } from '../definitions/define-module.js';
import type { NexusPlugin } from './plugins.js';
import type { TraceEvent } from './trace.js';

export interface CreateOptions {
  /** Receives typed lifecycle events. */
  readonly trace?: (event: TraceEvent) => void;
  /** Plugins, in order (spec §3.10). */
  readonly plugins?: readonly NexusPlugin[];
}

export interface LookupOptions {
  /** Resolve as if called from inside this module. */
  readonly module?: ModuleRef;
}

export interface CheckOptions {
  /** Plugins, in order (spec §3.10). Nexus.check runs their compile hooks, observe and formatError, and no setup. */
  readonly plugins?: readonly NexusPlugin[];
  /** Modules to compile after the root, in order, as load() would. */
  readonly load?: readonly ModuleRef[];
}
