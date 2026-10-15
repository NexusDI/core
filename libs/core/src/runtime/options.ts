import type { ModuleRef } from '../definitions/define-module.js';
import type { NexusPlugin } from './plugins.js';

/** The options `Nexus.create` takes. */
export interface CreateOptions {
  /** Plugins, in order (spec §3.10). */
  readonly plugins?: readonly NexusPlugin[];
}

/** The options `get()`, `has()`, `resolve()` and `validate()` take. */
export interface LookupOptions {
  /** Resolve as if called from inside this module. */
  readonly module?: ModuleRef;
}

/** The options `Nexus.check` takes: its plugins, and the modules to compile after the root. */
export interface CheckOptions {
  /** Plugins, in order (spec §3.10). Nexus.check runs their compile hooks, tokenKey, observe and formatError, and no setup. */
  readonly plugins?: readonly NexusPlugin[];
  /** Modules to compile after the root, in order, as load() would. */
  readonly load?: readonly ModuleRef[];
}
