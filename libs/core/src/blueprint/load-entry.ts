import { isForeign } from '../definitions/brand.js';
import {
  resolveModuleRef,
  type ModuleRef,
} from '../definitions/define-module.js';

/** The options load() takes. */
export interface LoadOptions {
  /** Modules of the graph whose exports the modules this load adds see, as if they imported them. */
  readonly imports?: readonly ModuleRef[];
}

/** A module for Nexus.check to load, with its grant. */
export type LoadEntry =
  | ModuleRef
  | {
      readonly module: ModuleRef;
      readonly imports: readonly ModuleRef[];
    };

/** The module of an entry and the modules it grants, in grant order. */
export interface SplitEntry {
  readonly module: unknown;
  readonly imports: readonly unknown[];
}

/**
 * Splits an entry into its module and its grant. A module ref has no grant.
 * A value that is neither form is returned as the module, so the walk
 * reports it as an invalid module.
 */
export function splitEntry(entry: unknown): SplitEntry {
  if (
    resolveModuleRef(entry) === undefined &&
    typeof entry === 'object' &&
    entry !== null &&
    !isForeign(entry) &&
    'module' in entry &&
    'imports' in entry &&
    Array.isArray(entry.imports)
  )
    return { module: entry.module, imports: entry.imports };
  return { module: entry, imports: [] };
}

/**
 * Splits a load entry into its module and the modules it grants. A module ref
 * has no grant. A value that is neither form comes back as the module, so
 * load() reports it as an invalid module. Tools that load entries pass the
 * parts on to load() and keep no copy of this rule.
 */
export function splitLoadEntry(entry: LoadEntry): {
  readonly module: ModuleRef;
  readonly imports: readonly ModuleRef[];
} {
  return splitEntry(entry) as {
    readonly module: ModuleRef;
    readonly imports: readonly ModuleRef[];
  };
}

/** The entry a load of `module` with `options` adds to the blueprint. */
export function entryOf(module: unknown, options?: LoadOptions): LoadEntry {
  const imports = options?.imports;
  return (
    imports === undefined || imports.length === 0 ? module : { module, imports }
  ) as LoadEntry;
}
