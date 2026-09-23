import type { Blueprint, TokenKey } from '../blueprint/blueprint.js';
import { findNearMisses } from '../blueprint/near-misses.js';
import { resolveModuleRef } from '../definitions/define-module.js';
import { describeValue } from '../definitions/describe.js';
import { isToken } from '../definitions/guards.js';
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

/** The module a lookup runs in: the root, or the `module` option. */
export function lookupModule(bp: Blueprint, options?: LookupOptions): string {
  if (options?.module === undefined) return bp.root;
  const definition = resolveModuleRef(options.module);
  const id =
    definition === undefined
      ? undefined
      : bp.moduleByDefinition.get(definition);
  if (id === undefined) {
    throw new InvalidModuleError({
      received: definition?.name ?? describeValue(options.module),
      path: [],
    });
  }
  return id;
}

function notFound(
  container: ContainerState,
  bp: Blueprint,
  token: TokenKey,
  moduleId: string,
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
    return new NotVisibleError({ token: displayName(token), owners });
  return new MissingProviderError({
    token: displayName(token),
    requester: null,
    module: bp.modules.get(moduleId)?.name ?? moduleId,
    nearMisses: findNearMisses(token, moduleId, {
      modules: bp.modules.values(),
      records: bp.providers.values(),
      exportedTokens: bp.exportedTokens,
    }),
  });
}

/** get() for the root and for a scope. */
export function getFrom(
  container: ContainerState,
  bp: Blueprint,
  token: unknown,
  options: LookupOptions | undefined,
  owner: TransientOwner,
): unknown {
  if (!isToken(token))
    throw new InvalidTokenError({ received: describeValue(token) });
  const moduleId = lookupModule(bp, options);
  const ids = bp.visibility.get(moduleId)?.get(token) ?? [];
  const ctx = { bp, container, owner };
  if (token instanceof MultiToken) return ids.map((id) => resolveId(id, ctx));
  const [id] = ids;
  if (id === undefined) throw notFound(container, bp, token, moduleId);
  return resolveId(id, ctx);
}

/** has(): the lookup get() would run, without building anything. */
export function hasIn(
  bp: Blueprint,
  token: unknown,
  options: LookupOptions | undefined,
): boolean {
  if (!isToken(token)) return false;
  return (
    (bp.visibility.get(lookupModule(bp, options))?.get(token)?.length ?? 0) > 0
  );
}
