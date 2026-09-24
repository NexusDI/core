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
import { isCyclic, strongComponents } from './tarjan.js';

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
    if (map === undefined) continue;
    const ids = map.get(record.token);
    if (ids === undefined) map.set(record.token, [record.id]);
    else ids.push(record.id);
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
  const indexOf = new Map(input.modules.map((m, i) => [m.id, i]));
  const toIndex = (ids: readonly string[]): number[] =>
    ids.flatMap((id) => indexOf.get(id) ?? []);
  const sourceIndex = input.modules.map((node) => {
    const imports = new Set(node.imports);
    return toIndex([
      ...node.imports,
      ...globals.filter((g) => g !== node.id && !imports.has(g)),
    ]);
  });
  const exportsToken = input.modules.map(
    (node) => new Set(plans.get(node.id)?.tokens),
  );
  const reexports = input.modules.map((node) =>
    toIndex(plans.get(node.id)?.modules ?? []),
  );
  const ownOf = (i: number, token: TokenKey): readonly string[] =>
    own.get(input.modules[i]?.id ?? '')?.get(token) ?? [];

  // Each (module, token) pair is two nodes: 2i is what module i sees of the
  // token (its lookup), 2i + 1 is what module i exports of it. Import cycles
  // are rejected by walk, but a global module is a source of every module, so
  // a global that re-exports its own importers closes a cycle through them.
  // Tarjan's algorithm condenses each token's graph into strongly connected
  // components and settles them callees first, so every node is computed once
  // from complete inputs: O(V + E) per token. The search is iterative, so a
  // 1,000-module chain does not grow the call stack.
  const successors = (token: TokenKey, node: number): readonly number[] => {
    const i = node >> 1;
    if (node % 2 === 1) {
      const next = reexports[i]?.map((c) => 2 * c + 1) ?? [];
      return exportsToken[i]?.has(token) ? [2 * i, ...next] : next;
    }
    if (input.pinned.has(token)) return [];
    if (!(token instanceof MultiToken) && ownOf(i, token).length > 0) return [];
    return sourceIndex[i]?.map((s) => 2 * s + 1) ?? [];
  };

  type Values = (readonly string[] | undefined)[];
  const valueOf = (values: Values, node: number): readonly string[] =>
    values[node] ?? [];

  const exportOf = (
    values: Values,
    token: TokenKey,
    i: number,
  ): readonly string[] => {
    const ids = new Set<string>();
    for (const next of successors(token, 2 * i + 1))
      for (const id of valueOf(values, next)) ids.add(id);
    return [...ids].sort(byRank);
  };

  const lookupOf = (
    values: Values,
    token: TokenKey,
    i: number,
  ): readonly string[] => {
    const pinned = input.pinned.get(token);
    if (pinned !== undefined) return pinned;
    const node = input.modules[i];
    if (node === undefined) return [];
    const mine = ownOf(i, token);
    const sourceList = sourceIndex[i] ?? [];
    if (token instanceof MultiToken) {
      const ids = new Set(mine);
      for (const s of sourceList)
        for (const id of valueOf(values, 2 * s + 1)) ids.add(id);
      return [...ids].sort(byRank);
    }
    if (mine.length > 0) return mine;
    const offers = new Map<string, string[]>();
    for (const s of sourceList) {
      const name = input.modules[s]?.name ?? '';
      for (const id of valueOf(values, 2 * s + 1)) {
        const names = offers.get(id);
        if (names === undefined) offers.set(id, [name]);
        else names.push(name);
      }
    }
    if (offers.size <= 1) return [...offers.keys()];
    const seen = ambiguous.get(node.id) ?? new Set<TokenKey>();
    if (!seen.has(token)) {
      seen.add(token);
      ambiguous.set(node.id, seen);
      errors.push(
        new AmbiguousProviderError({
          token: displayName(token),
          module: node.name,
          candidates: [...offers.values()].flat(),
        }),
      );
    }
    return [];
  };

  // Settles one component once its callee components are settled. In a
  // cycle every node reaches every other. For a MultiToken every node takes
  // a union, so the least fixpoint gives each node the same set: every
  // provider a member provides or a callee component hands in. For a plain
  // token no lookup in a cycle has its own provider (one that does has no
  // successors), so the same set is what enters the cycle. Exports take that
  // set, then lookups run as usual over it: one provider resolves everywhere
  // in the cycle, two make every lookup in the cycle ambiguous.
  const settle = (
    values: Values,
    token: TokenKey,
    members: readonly number[],
  ): void => {
    const out = (node: number): readonly number[] => successors(token, node);
    const cyclic = isCyclic(members, out);
    if (cyclic) {
      const inside = new Set(members);
      const ids = new Set<string>();
      for (const member of members) {
        if (member % 2 === 0)
          for (const id of ownOf(member >> 1, token)) ids.add(id);
        for (const next of out(member))
          if (!inside.has(next))
            for (const id of valueOf(values, next)) ids.add(id);
      }
      const all = [...ids].sort(byRank);
      for (const member of members) if (member % 2 === 1) values[member] = all;
    }
    for (const member of members) {
      if (cyclic && member % 2 === 1) continue;
      values[member] =
        member % 2 === 0
          ? lookupOf(values, token, member >> 1)
          : exportOf(values, token, member >> 1);
    }
  };

  const solved = new Map<
    TokenKey,
    { values: Values; visit: (root: number) => void }
  >();
  const solve = (token: TokenKey, root: number): readonly string[] => {
    let entry = solved.get(token);
    if (entry === undefined) {
      const size = 2 * input.modules.length;
      const values: Values = new Array(size);
      entry = {
        values,
        visit: strongComponents(
          size,
          (node) => successors(token, node),
          (members) => settle(values, token, members),
        ),
      };
      solved.set(token, entry);
    }
    entry.visit(root);
    return valueOf(entry.values, root);
  };

  const lookup = (i: number, token: TokenKey): readonly string[] =>
    solve(token, 2 * i);
  const exported = (i: number, token: TokenKey): readonly string[] =>
    solve(token, 2 * i + 1);

  const visibility = new Map<string, Map<TokenKey, readonly string[]>>();
  for (const [i, node] of input.modules.entries()) {
    const map = new Map<TokenKey, readonly string[]>();
    for (const token of universe) {
      const ids = lookup(i, token);
      if (ids.length > 0) map.set(token, ids);
    }
    visibility.set(node.id, map);
  }

  const moduleExports = new Map<string, readonly string[]>();
  const exportedTokens = new Map<string, Set<TokenKey>>();
  for (const [i, node] of input.modules.entries()) {
    const plan = plans.get(node.id) ?? { tokens: [], modules: [] };
    for (const token of plan.tokens) {
      if (
        lookup(i, token).length === 0 &&
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
        ...plan.tokens.flatMap((t) => lookup(i, t)),
        ...plan.modules,
      ]),
    ]);
    exportedTokens.set(
      node.id,
      new Set(
        universe.filter(
          (token) => !input.pinned.has(token) && exported(i, token).length > 0,
        ),
      ),
    );
  }

  return { visibility, moduleExports, exportedTokens, ambiguous };
}
