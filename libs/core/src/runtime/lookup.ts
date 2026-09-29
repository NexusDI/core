import type { Blueprint, TokenKey } from '../blueprint/blueprint.js';
import { isForeign } from '../definitions/brand.js';
import { resolveModuleRef } from '../definitions/define-module.js';
import { describeValue } from '../definitions/describe.js';
import { isToken } from '../definitions/guards.js';
import { HOOK_SITES } from '../definitions/hook-sites.js';
import { MultiToken, displayName } from '../definitions/token.js';
import {
  InvalidModuleError,
  InvalidTokenError,
  LoadedAfterScopeError,
  MissingProviderError,
  NotVisibleError,
  type NexusError,
} from '../errors/index.js';
import { resolveId } from './build.js';
import type { LookupOptions } from './options.js';
import type { ContainerState, TransientOwner } from './state.js';

/**
 * The module a lookup runs in: the root, or the `module` option.
 * `moduleByDefinition` holds every definition the walk visited, replacements
 * included. A definition a compile.module hook replaced is not in it (spec
 * §3.5), so the option falls back to `moduleByReplaced` and gets the module
 * that stands in for it.
 */
export function lookupModule(bp: Blueprint, options?: LookupOptions): string {
  if (options?.module === undefined) return bp.root;
  const definition = resolveModuleRef(options.module);
  const id =
    definition === undefined
      ? undefined
      : (bp.moduleByDefinition.get(definition) ??
        bp.moduleByReplaced.get(definition));
  if (id === undefined) {
    throw new InvalidModuleError({
      received: definition?.name ?? describeValue(options.module),
      path: [],
      otherCopy: isForeign(options.module),
    });
  }
  return id;
}

export function notFound(
  container: ContainerState,
  bp: Blueprint,
  token: TokenKey,
  moduleId: string,
  entry: string | null = null,
): NexusError {
  const current = container.root.blueprint;
  if (container.kind === 'scope' && current !== bp) {
    const [later] = current.visibility.get(current.root)?.get(token) ?? [];
    const record =
      later === undefined ? undefined : current.providers.get(later);
    if (record !== undefined) {
      return new LoadedAfterScopeError({
        token: displayName(token),
        module: current.modules.get(record.module)?.name ?? record.module,
        entry,
      });
    }
  }
  const owners = [
    ...new Set(
      [...bp.providers.values()]
        .filter((r) => r.token === token)
        .map((r) => bp.modules.get(r.module)?.name ?? r.module),
    ),
  ];
  if (owners.length > 0)
    return new NotVisibleError({ token: displayName(token), owners, entry });
  return new MissingProviderError(
    {
      token: displayName(token),
      requester: null,
      module: bp.modules.get(moduleId)?.name ?? moduleId,
      entry,
      nearMisses: [],
    },
    { hidden: { lookup: { token, moduleId } } },
  );
}

/** get() for the root and for a scope. The lookup keys `token` as the compile did. */
export function getFrom(
  container: ContainerState,
  bp: Blueprint,
  token: unknown,
  options: LookupOptions | undefined,
  owner: TransientOwner,
): unknown {
  if (!isToken(token))
    throw new InvalidTokenError({
      received: describeValue(token),
      entry: null,
      module: null,
      index: null,
      reason: null,
      detail: [],
      otherCopy: isForeign(token),
    });
  const moduleId = lookupModule(bp, options);
  const key = HOOK_SITES ? container.root.canon(token) : token;
  const ids = bp.visibility.get(moduleId)?.get(key) ?? [];
  const ctx = { bp, container, owner };
  if (key instanceof MultiToken) return ids.map((id) => resolveId(id, ctx));
  const [id] = ids;
  if (id === undefined) throw notFound(container, bp, key, moduleId);
  return resolveId(id, ctx);
}

/** has(): the lookup get() would run, without building anything. */
export function hasIn(
  container: ContainerState,
  bp: Blueprint,
  token: unknown,
  options: LookupOptions | undefined,
): boolean {
  if (!isToken(token)) return false;
  return (
    (bp.visibility
      .get(lookupModule(bp, options))
      ?.get(HOOK_SITES ? container.root.canon(token) : token)?.length ?? 0) > 0
  );
}
