import type { LoadEntry, LoadOptions } from '../blueprint/load-entry.js';
import type { ModuleRef } from '../definitions/define-module.js';
import type { NexusPlugin } from './plugins.js';

/** The options `Nexus.create` takes. */
export interface CreateOptions {
  /** Plugins, in order. */
  readonly plugins?: readonly NexusPlugin[];
}

/** The options `get()`, `has()`, `resolve()` and `validate()` take. */
export interface LookupOptions {
  /**
   * Resolve as if called from inside this module. The option does not count as
   * a reader of a private contribution, so a contribution only it can see
   * fails NEXUS_UNREAD_CONTRIBUTION.
   */
  readonly module?: ModuleRef;
}

/** The options `Nexus.check` takes: its plugins, and the modules to compile after the root. */
export interface CheckOptions {
  /** Plugins, in order. Nexus.check runs their compile hooks, tokenKey, observe and formatError, and no setup. */
  readonly plugins?: readonly NexusPlugin[];
  /** Modules to compile after the root, in order, as load() would. An entry with `imports` carries the load imports load() would take. */
  readonly load?: readonly LoadEntry[];
}

/** What Nexus.check returns: the modules whose options it could not judge. */
export interface CheckReport {
  /**
   * Each configurable module whose options check could not judge, in compile
   * order. Check still calls the `validate` of an async schema and does not
   * await the result. `reason` is `'async-schema'` when the schema's validate
   * returned a promise, and `'for-root-async'` when the module was imported
   * with forRootAsync(), whose options exist only once its factory ran. A
   * minor release may add a reason; handle one you do not know.
   */
  readonly unchecked: readonly {
    readonly module: string;
    readonly reason: 'async-schema' | 'for-root-async';
  }[];
}

export type { LoadEntry, LoadOptions };
