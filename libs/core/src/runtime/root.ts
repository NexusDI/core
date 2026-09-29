import {
  defineModule,
  resolveModuleRef,
  type ExportEntry,
  type ModuleRef,
  type ProviderEntry,
} from '../definitions/define-module.js';
import { isForeign } from '../definitions/brand.js';
import { pickOwn } from '../definitions/own-keys.js';
import type {
  ProviderEntries,
  UninferredEntry,
} from '../definitions/provider-literal.js';
import { InvalidModuleError } from '../errors/index.js';

/** The object form of a root: a root module without a name. */
export interface RootConfig {
  readonly providers?: readonly ProviderEntry[];
  readonly imports?: readonly ModuleRef[];
  readonly exports?: readonly ExportEntry[];
}

/** Every root Nexus.create and Nexus.check accept (spec §3.5). */
export type RootRef = ModuleRef | readonly ProviderEntry[] | RootConfig;

export type RootKeyMessage =
  'NEXUS_INVALID_MODULE: a root object takes providers, imports and exports only. Give the module a name with defineModule()';

/**
 * An array's elements checked per element. When TypeScript inferred nothing
 * for the root, each element is `unknown` and is checked as UninferredEntry.
 */
type CheckedEntries<V extends readonly unknown[]> = unknown extends V[number]
  ? readonly UninferredEntry[]
  : ProviderEntries<V>;

type CheckedProviders<V> = V extends readonly unknown[]
  ? CheckedEntries<V>
  : V extends undefined
    ? undefined
    : readonly ProviderEntry[];

/** The object form: providers checked per element, any other key refused at that key. */
type CheckedRootConfig<R> = {
  readonly [K in keyof R]: K extends 'providers'
    ? CheckedProviders<R[K]>
    : K extends 'imports'
      ? readonly ModuleRef[]
      : K extends 'exports'
        ? readonly ExportEntry[]
        : RootKeyMessage;
};

/**
 * The root `R` checked the way defineModule checks `providers` (spec §4.6).
 * The parameter is one conditional type, never a union or an overload set,
 * so TypeScript reports a failed check on the element or key that breaks it.
 */
export type CheckedRoot<R> = R extends readonly unknown[]
  ? CheckedEntries<R>
  : R extends ModuleRef
    ? R
    : R extends object
      ? CheckedRootConfig<R>
      : RootConfig;

/**
 * The default of R when TypeScript infers nothing, which happens when a
 * literal holds an unannotated function. Both forms then check each element
 * as UninferredEntry, and the untyped function reports UntypedFunctionMessage.
 * A function that wraps Nexus.check declares `<const R = UninferredRoot>`
 * and takes `CheckedRoot<R>`, as devtools' inspect() does.
 */
export type UninferredRoot =
  readonly unknown[] | { readonly providers: readonly unknown[] };

const ROOT_KEYS = ['providers', 'imports', 'exports'] as const;

/**
 * The module Nexus.create and Nexus.check compile: `root` itself when it is
 * a module, otherwise a module named `root` built from an array of providers
 * or from `{ providers, imports, exports }`. Own keys only (SEC-003).
 */
export function rootModuleOf(root: unknown): unknown {
  if (Array.isArray(root))
    return defineModule({ name: 'root', providers: root as never });
  if (
    typeof root !== 'object' ||
    root === null ||
    resolveModuleRef(root) !== undefined
  )
    return root;
  const extra = Object.keys(root).filter(
    (key) => !(ROOT_KEYS as readonly string[]).includes(key),
  );
  if (extra.length > 0)
    throw new InvalidModuleError({
      received: withKeys(extra),
      path: [],
      otherCopy: isForeign(root),
    });
  return defineModule({ name: 'root', ...pickOwn(root, ROOT_KEYS) } as never);
}

/** `received` for a root object with keys a root does not take, naming them. */
function withKeys(keys: readonly string[]): string {
  const names = keys.map((key) => JSON.stringify(key)).join(', ');
  return `an object with the key${keys.length === 1 ? '' : 's'} ${names}`;
}
