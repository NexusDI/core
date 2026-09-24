import {
  moduleInternals,
  resolveModuleRef,
  type ModuleDefinition,
} from '../definitions/define-module.js';
import { isToken } from '../definitions/guards.js';
import { readProvider } from '../definitions/provide.js';
import { MultiToken, displayName } from '../definitions/token.js';
import { OverrideError, type NexusError } from '../errors/index.js';
import type { ProviderRecord, TokenKey } from './blueprint.js';
import { normalizeProvider } from './records.js';

/** What createTestingContainer() hands the compiler. */
export interface CompileOverrides {
  /** Token → the provide() result that replaces every provider of that token. */
  readonly providers: ReadonlyMap<TokenKey, unknown>;
  /** Module, or configurable base module → the stub walked in its place. */
  readonly modules: ReadonlyMap<ModuleDefinition, ModuleDefinition>;
  /**
   * Module overrides a later load() may be the first to use. create cannot
   * know which modules will load, so these are never reported unused.
   */
  readonly lazyModules?: ReadonlySet<ModuleDefinition>;
}

/** The walk's replace hook. A stub stands in for its module and for every with() instance of it. */
export function moduleReplacer(
  overrides: CompileOverrides,
  used: Set<ModuleDefinition>,
): (definition: ModuleDefinition) => ModuleDefinition {
  return (definition) => {
    for (const key of [definition, moduleInternals(definition)?.base]) {
      if (key === undefined) continue;
      const stub = overrides.modules.get(key);
      if (stub !== undefined) {
        used.add(key);
        return stub;
      }
    }
    return definition;
  };
}

/**
 * Replaces every provider of an overridden plain token in place, keeping its
 * id, module and lifetime unless the override sets a lifetime. For a
 * MultiToken it keeps one contribution, replaced, and pins it: every module
 * then sees exactly that one.
 */
export function applyProviderOverrides(
  records: readonly ProviderRecord[],
  overrides: CompileOverrides,
  errors: NexusError[],
): { records: ProviderRecord[]; pinned: Map<TokenKey, readonly string[]> } {
  let result = [...records];
  const pinned = new Map<TokenKey, readonly string[]>();

  for (const [token, provider] of overrides.providers) {
    const matches = result.filter((r) => r.token === token);
    const [first] = matches;
    if (first === undefined) {
      errors.push(
        new OverrideError({
          code: 'NEXUS_OVERRIDE_UNUSED',
          token: displayName(token),
        }),
      );
      continue;
    }
    const shape = normalizeProvider(
      provider,
      { module: `override(${displayName(token)})`, index: 0 },
      errors,
    );
    if (shape === null) continue;
    // Only an own `lifetime` key counts as the override setting a lifetime.
    // A polluted Object.prototype can supply an inherited one (SEC-003,
    // spec §3.2).
    const options = readProvider(provider)?.options;
    const setsLifetime =
      typeof options === 'object' &&
      options !== null &&
      Object.hasOwn(options, 'lifetime');
    const replace = (match: ProviderRecord): ProviderRecord => ({
      ...shape,
      token: match.token,
      id: match.id,
      index: match.index,
      module: match.module,
      name: match.name,
      lifetime:
        shape.lifetime === null
          ? null
          : setsLifetime
            ? shape.lifetime
            : (match.lifetime ?? shape.lifetime),
    });

    if (token instanceof MultiToken) {
      result = result
        .filter((r) => r.token !== token || r === first)
        .map((r) => (r === first ? replace(r) : r));
      pinned.set(token, [first.id]);
    } else {
      result = result.map((r) => (r.token === token ? replace(r) : r));
    }
  }
  return { records: result, pinned };
}

/** A stub must export every token and module its original exports; an unused module override is an error. */
export function checkModuleOverrides(
  overrides: CompileOverrides,
  used: ReadonlySet<ModuleDefinition>,
  byDefinition: ReadonlyMap<ModuleDefinition, string>,
  exportedTokens: ReadonlyMap<string, ReadonlySet<TokenKey>>,
  errors: NexusError[],
): void {
  for (const [original, stub] of overrides.modules) {
    if (!used.has(original)) {
      if (overrides.lazyModules?.has(original)) continue;
      errors.push(
        new OverrideError({
          code: 'NEXUS_OVERRIDE_UNUSED',
          token: original.name,
        }),
      );
      continue;
    }
    const stubId = byDefinition.get(stub);
    if (stubId === undefined) continue;
    const tokens = exportedTokens.get(stubId) ?? new Set<TokenKey>();
    const modules = new Set(
      stub.exports
        .map((entry) => resolveModuleRef(entry))
        .filter((m) => m !== undefined),
    );
    const missing = original.exports.flatMap((entry) => {
      const module = resolveModuleRef(entry);
      if (module !== undefined) return modules.has(module) ? [] : [module.name];
      return isToken(entry) && !tokens.has(entry) ? [displayName(entry)] : [];
    });
    if (missing.length > 0) {
      errors.push(
        new OverrideError({
          code: 'NEXUS_OVERRIDE_EXPORTS',
          module: original.name,
          missing,
        }),
      );
    }
  }
}
