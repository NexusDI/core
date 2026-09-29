import {
  defineModule,
  resolveModuleRef,
  type ExportEntry,
  type ModuleRef,
} from '../definitions/define-module.js';
import { describeValue } from '../definitions/describe.js';
import { pickOwn } from '../definitions/own-keys.js';
import type { ProviderEntries } from '../definitions/provider-literal.js';
import { InvalidModuleError } from '../errors/index.js';

/** The object form of a root: a root module without a name. */
export interface RootConfig<P extends readonly unknown[] = readonly unknown[]> {
  readonly providers?: ProviderEntries<P>;
  readonly imports?: readonly ModuleRef[];
  readonly exports?: readonly ExportEntry[];
}

export type RootRef<P extends readonly unknown[] = readonly unknown[]> =
  ModuleRef | ProviderEntries<P> | RootConfig<P>;

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
    throw new InvalidModuleError({ received: describeValue(root), path: [] });
  return defineModule({ name: 'root', ...pickOwn(root, ROOT_KEYS) } as never);
}
