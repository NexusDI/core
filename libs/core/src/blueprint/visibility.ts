import {
  resolveModuleRef,
  type ModuleDefinition,
} from '../definitions/define-module.js';
import { describeValue } from '../definitions/describe.js';
import { isToken } from '../definitions/guards.js';
import { MultiToken, displayName } from '../definitions/token.js';
import {
  AmbiguousProviderError,
  InvalidExportError,
  type NexusError,
} from '../errors/index.js';
import type { ModuleNode, ProviderRecord, TokenKey } from './blueprint.js';

export interface VisibilityInput {
  readonly modules: readonly ModuleNode[];
  readonly records: readonly ProviderRecord[];
  readonly byDefinition: ReadonlyMap<ModuleDefinition, string>;
  /** Tokens bound to fixed providers in every module: REQUEST, and MultiTokens a test overrides. */
  readonly pinned: ReadonlyMap<TokenKey, readonly string[]>;
  readonly replace?: (definition: ModuleDefinition) => ModuleDefinition;
}

export interface Visibility {
  /** module id → token → provider ids the module sees. */
  readonly visibility: Map<string, Map<TokenKey, readonly string[]>>;
  /** module id → provider ids and module ids it exports, for graph(). */
  readonly moduleExports: Map<string, readonly string[]>;
  /** module id → tokens it exports, directly or through re-exports. */
  readonly exportedTokens: Map<string, Set<TokenKey>>;
  /** module id → plain tokens it sees from more than one provider. */
  readonly ambiguous: Map<string, Set<TokenKey>>;
}

interface ExportPlan {
  readonly tokens: TokenKey[];
  readonly modules: string[];
}

/**
 * Pass 2. For each module: its own providers, its imports' exports (following
 * re-exports), and every global module's exports. A module's own provider of
 * a plain token shadows imported ones; two different imported providers of a
 * plain token are ambiguous; MultiToken contributions merge.
 */
export function computeVisibility(
  input: VisibilityInput,
  errors: NexusError[],
): Visibility {
  const nodes = new Map(input.modules.map((m) => [m.id, m]));
  const rank = new Map(input.records.map((r) => [r.id, r.index]));
  const byRank = (a: string, b: string): number =>
    (rank.get(a) ?? 0) - (rank.get(b) ?? 0);
  const globals = input.modules.filter((m) => m.global).map((m) => m.id);

  const own = new Map<string, Map<TokenKey, string[]>>(
    input.modules.map((m) => [m.id, new Map()]),
  );
  const universe: TokenKey[] = [];
  const known = new Set<TokenKey>();
  const learn = (token: TokenKey): void => {
    if (known.has(token)) return;
    known.add(token);
    universe.push(token);
  };
  for (const record of input.records) {
    learn(record.token);
    if (input.pinned.has(record.token)) continue;
    const map = own.get(record.module);
    map?.set(record.token, [...(map.get(record.token) ?? []), record.id]);
  }
  for (const token of input.pinned.keys()) learn(token);

  const plans = new Map<string, ExportPlan>();
  for (const node of input.modules) {
    const plan: ExportPlan = { tokens: [], modules: [] };
    for (const entry of node.definition.exports) {
      const found = resolveModuleRef(entry);
      if (found !== undefined) {
        const id = input.byDefinition.get(input.replace?.(found) ?? found);
        if (id !== undefined && node.imports.includes(id))
          plan.modules.push(id);
        else
          errors.push(
            new InvalidExportError({ token: found.name, module: node.name }),
          );
      } else if (isToken(entry)) {
        plan.tokens.push(entry);
      } else {
        errors.push(
          new InvalidExportError({
            token: describeValue(entry),
            module: node.name,
          }),
        );
      }
    }
    plans.set(node.id, plan);
  }

  const ambiguous = new Map<string, Set<TokenKey>>();
  const memo = new Map<string, Map<TokenKey, readonly string[]>>();
  const active = new Set<string>();
  const tokenIds = new Map(universe.map((token, i) => [token, i]));

  const sources = (node: ModuleNode): string[] => [
    ...node.imports,
    ...globals.filter((g) => g !== node.id && !node.imports.includes(g)),
  ];

  const exported = (moduleId: string, token: TokenKey): readonly string[] => {
    const plan = plans.get(moduleId);
    if (plan === undefined) return [];
    const ids = new Set<string>();
    if (plan.tokens.includes(token))
      for (const id of lookup(moduleId, token)) ids.add(id);
    for (const child of plan.modules)
      for (const id of exported(child, token)) ids.add(id);
    return [...ids].sort(byRank);
  };

  const lookup = (moduleId: string, token: TokenKey): readonly string[] => {
    const pinned = input.pinned.get(token);
    if (pinned !== undefined) return pinned;
    const cached = memo.get(moduleId)?.get(token);
    if (cached !== undefined) return cached;
    // A re-export chain that loops back to itself contributes nothing.
    const key = `${moduleId}|${tokenIds.get(token)}`;
    if (active.has(key)) return [];
    active.add(key);

    const node = nodes.get(moduleId);
    const mine = own.get(moduleId)?.get(token) ?? [];
    let result: readonly string[] = [];
    if (node !== undefined) {
      if (token instanceof MultiToken) {
        const ids = new Set(mine);
        for (const source of sources(node))
          for (const id of exported(source, token)) ids.add(id);
        result = [...ids].sort(byRank);
      } else if (mine.length > 0) {
        result = mine;
      } else {
        const offers = new Map<string, string[]>();
        for (const source of sources(node)) {
          for (const id of exported(source, token)) {
            offers.set(id, [
              ...(offers.get(id) ?? []),
              nodes.get(source)?.name ?? source,
            ]);
          }
        }
        if (offers.size > 1) {
          const seen = ambiguous.get(moduleId) ?? new Set<TokenKey>();
          if (!seen.has(token)) {
            seen.add(token);
            ambiguous.set(moduleId, seen);
            errors.push(
              new AmbiguousProviderError({
                token: displayName(token),
                module: node.name,
                candidates: [...offers.values()].flat(),
              }),
            );
          }
        } else {
          result = [...offers.keys()];
        }
      }
    }

    active.delete(key);
    const perModule =
      memo.get(moduleId) ?? new Map<TokenKey, readonly string[]>();
    perModule.set(token, result);
    memo.set(moduleId, perModule);
    return result;
  };

  const visibility = new Map<string, Map<TokenKey, readonly string[]>>();
  for (const node of input.modules) {
    const map = new Map<TokenKey, readonly string[]>();
    for (const token of universe) {
      const ids = lookup(node.id, token);
      if (ids.length > 0) map.set(token, ids);
    }
    visibility.set(node.id, map);
  }

  const moduleExports = new Map<string, readonly string[]>();
  const exportedTokens = new Map<string, Set<TokenKey>>();
  for (const node of input.modules) {
    const plan = plans.get(node.id) ?? { tokens: [], modules: [] };
    for (const token of plan.tokens) {
      if (
        lookup(node.id, token).length === 0 &&
        !ambiguous.get(node.id)?.has(token)
      ) {
        errors.push(
          new InvalidExportError({
            token: displayName(token),
            module: node.name,
          }),
        );
      }
    }
    moduleExports.set(node.id, [
      ...new Set([
        ...plan.tokens.flatMap((t) => lookup(node.id, t)),
        ...plan.modules,
      ]),
    ]);
    exportedTokens.set(
      node.id,
      new Set(
        universe.filter(
          (token) =>
            !input.pinned.has(token) && exported(node.id, token).length > 0,
        ),
      ),
    );
  }

  return { visibility, moduleExports, exportedTokens, ambiguous };
}
