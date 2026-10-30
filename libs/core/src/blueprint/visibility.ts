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
  /** The same records by id. The pass sorts provider ids by their record's `index`. */
  readonly providers: ReadonlyMap<string, ProviderRecord>;
  /** Tokens bound to fixed providers in every module: REQUEST, and MultiTokens a compile.provider hook pins. */
  readonly pinned: ReadonlyMap<TokenKey, readonly string[]>;
}

export interface Visibility {
  /** module id → token → provider ids the module sees. */
  readonly visibility: Map<string, Map<TokenKey, readonly string[]>>;
  /** module id → provider ids and module ids it exports, for the view. */
  readonly moduleExports: Map<string, readonly string[]>;
  /** module id → tokens it exports, directly or through re-exports. */
  readonly exportedTokens: Map<string, Set<TokenKey>>;
  /** module id → plain tokens it sees from more than one provider. */
  readonly ambiguous: Map<string, Set<TokenKey>>;
}

/**
 * Pass 2. For a plain token, each module sees its own providers, its imports'
 * exports (following re-exports), and every global module's exports. A
 * module's own provider shadows imported ones; two different imported
 * providers are ambiguous.
 *
 * A MultiToken that no hook pins is collected across the container. Module M
 * publishes its own records of the token when its `exports` names the token,
 * and nothing otherwise; a module re-export publishes nothing of it. M sees
 * its own records plus every module's published records, sorted by record
 * index, which is the order the walk first meets each module, then
 * `providers` order. `exports: [T]` in a module with no record of T is legal
 * and adds nothing.
 *
 * A module sees a plain token only if it provides it, the token is pinned, or
 * one of its sources exports it. So the pass builds each module's export map
 * once, callees first, and looks up only the tokens a module's own providers
 * and its sources' export maps name. Import cycles are rejected by walk, but
 * a global module is a source of every module, so a global that re-exports
 * its own importers closes a cycle through them. Only inside such a cycle
 * does the pass solve token by token.
 *
 * Errors: every NEXUS_AMBIGUOUS_PROVIDER first, ordered by module (the order
 * of `modules`), then by token, in the order `records` first names each
 * token. Then NEXUS_INVALID_EXPORT for plain tokens, by module, then in
 * export list order.
 */
export function computeVisibility(
  input: VisibilityInput,
  errors: NexusError[],
): Visibility {
  const { modules, records, providers, pinned } = input;
  const rank = (id: string): number => providers.get(id)?.index ?? 0;
  const sorted = (ids: readonly string[]): string[] =>
    [...new Set(ids)].sort((a, b) => rank(a) - rank(b));
  const indexOf = new Map(modules.map((m, i) => [m.id, i]));
  const toIndex = (ids: readonly string[]): number[] =>
    ids.flatMap((id) => indexOf.get(id) ?? []);
  const globals = modules.flatMap((m, i) => (m.global ? [i] : []));

  // own[i]: token → module i's providers of it.
  const own = modules.map(() => new Map<TokenKey, string[]>());
  for (const record of records) {
    const map = own[indexOf.get(record.module) ?? -1];
    if (map === undefined || pinned.has(record.token)) continue;
    const ids = map.get(record.token);
    if (ids === undefined) map.set(record.token, [record.id]);
    else ids.push(record.id);
  }

  // A MultiToken no hook pins is collected across the container.
  const collected = (token: TokenKey): boolean =>
    token instanceof MultiToken && !pinned.has(token);
  // publishedBy[i]: MultiToken → module i's own records of it, when module i
  // exports the token by name. published: the same, every module's together.
  const publishedBy = modules.map((node, i) => {
    const map = new Map<TokenKey, readonly string[]>();
    for (const token of node.exportTokens) {
      const ids = own[i].get(token);
      if (ids !== undefined && collected(token)) map.set(token, ids);
    }
    return map;
  });
  const published = new Map<TokenKey, string[]>();
  for (const map of publishedBy)
    for (const [token, ids] of map) {
      const list = published.get(token);
      if (list === undefined) published.set(token, [...ids]);
      else list.push(...ids);
    }
  // Sorted once. A module with no own record of a token reads this array
  // as its list, so nothing may mutate the lists in `seen`.
  for (const [token, list] of published) published.set(token, sorted(list));

  const sources = modules.map((node, i) => {
    const imports = toIndex(node.imports);
    return [
      ...imports,
      ...globals.filter((g) => g !== i && !imports.includes(g)),
    ];
  });
  const reexports = modules.map((node) => toIndex(node.exportModules));
  // exported[i]: plain token → provider ids module i exports. seen[i]:
  // token → provider ids module i sees. Empty lists are left out.
  const exported = modules.map(() => new Map<TokenKey, readonly string[]>());
  const seen = modules.map(() => new Map<TokenKey, readonly string[]>());
  const put = (i: number, token: TokenKey, ids: readonly string[]): void => {
    if (ids.length > 0) exported[i].set(token, ids);
  };
  const offered = (from: readonly number[], token: TokenKey): string[] =>
    from.flatMap((s) => exported[s].get(token) ?? []);
  // Whether module i's lookup of a plain token reads its sources.
  const open = (i: number, token: TokenKey): boolean =>
    !pinned.has(token) && !collected(token) && !own[i].has(token);
  // Everything module i provides or its sources offer of a token.
  const gather = (i: number, token: TokenKey): string[] => [
    ...(own[i].get(token) ?? []),
    ...offered(sources[i], token),
  ];

  const ambiguous = new Map<string, Set<TokenKey>>();
  const found: [number, number, NexusError][] = [];
  const lookup = (i: number, token: TokenKey): readonly string[] => {
    let ids = pinned.get(token) ?? seen[i].get(token);
    if (ids !== undefined) return ids;
    ids = own[i].get(token) ?? [];
    if (token instanceof MultiToken) {
      const shared = published.get(token) ?? [];
      ids = ids.length === 0 ? shared : sorted([...ids, ...shared]);
    } else if (ids.length === 0) {
      const offers = new Map<string, string[]>();
      for (const s of sources[i])
        for (const id of exported[s].get(token) ?? [])
          offers.set(id, [...(offers.get(id) ?? []), modules[s].name]);
      ids = [...offers.keys()];
      if (ids.length > 1) {
        const { id, name } = modules[i];
        const marked = ambiguous.get(id) ?? new Set<TokenKey>();
        ambiguous.set(id, marked);
        if (!marked.has(token)) {
          marked.add(token);
          found.push([
            i,
            records.findIndex((r) => r.token === token),
            new AmbiguousProviderError({
              token: displayName(token),
              module: name,
              candidates: [...offers.values()].flat(),
            }),
          ]);
        }
        return [];
      }
    }
    if (ids.length > 0) seen[i].set(token, ids);
    return ids;
  };
  // What module i exports of a token: what its lookup found and what the
  // modules it re-exports export. While modules settle, module i has looked
  // up only the tokens it exports by name.
  const exportOf = (i: number, token: TokenKey): string[] =>
    sorted([...(seen[i].get(token) ?? []), ...offered(reexports[i], token)]);

  // Fills the export maps of one strongly connected set of modules, once
  // every module they depend on is settled.
  const settle = (members: readonly number[]): void => {
    const tokens = new Set<TokenKey>();
    for (const m of members) {
      for (const t of modules[m].exportTokens) if (!collected(t)) tokens.add(t);
      for (const c of reexports[m])
        for (const t of exported[c].keys()) tokens.add(t);
    }
    // Per token, node 2j is what member j sees of it (its lookup) and node
    // 2j + 1 what member j exports of it. Only edges inside the component
    // count; every edge out of it reaches a settled module.
    const inside = (list: readonly number[]): number[] =>
      list.flatMap((x) => {
        const j = members.indexOf(x);
        return j < 0 ? [] : [2 * j + 1];
      });
    for (const t of tokens) {
      if (pinned.has(t)) continue;
      const out = (node: number): readonly number[] => {
        const m = members[node >> 1];
        if (node % 2 === 0) return open(m, t) ? inside(sources[m]) : [];
        const next = inside(reexports[m]);
        return modules[m].exportTokens.includes(t) ? [node - 1, ...next] : next;
      };
      // Settles one component once its callee components are settled. In a
      // cycle every node reaches every other. No lookup in a cycle has its
      // own provider (one that does has no successors), so the set that
      // enters the cycle is every provider a callee component hands in.
      // Exports take that set, then lookups run as usual over it: one
      // provider resolves everywhere in the cycle, two make every lookup in
      // the cycle ambiguous. No node of the component has an entry yet, so
      // the union reads only what enters from outside it.
      const visit = strongComponents(2 * members.length, out, (nodes) => {
        const cyclic = isCyclic(nodes, out);
        if (cyclic) {
          const all = sorted(
            nodes.flatMap((node) => {
              const m = members[node >> 1];
              return node % 2 === 1 ? exportOf(m, t) : gather(m, t);
            }),
          );
          for (const node of nodes)
            if (node % 2 === 1) put(members[node >> 1], t, all);
        }
        for (const node of nodes) {
          const m = members[node >> 1];
          if (node % 2 === 0) lookup(m, t);
          else if (!cyclic) put(m, t, exportOf(m, t));
        }
      });
      for (let j = 0; j < members.length; j++) visit(2 * j + 1);
    }
  };
  // Module i's export map needs the export maps of the modules it
  // re-exports, and of its sources when its lookup of a token it exports by
  // name reads them. Tarjan's algorithm settles modules callees first.
  const visitModule = strongComponents(
    modules.length,
    (i) =>
      modules[i].exportTokens.some((t) => open(i, t))
        ? [...reexports[i], ...sources[i]]
        : reexports[i],
    settle,
  );
  for (let i = 0; i < modules.length; i++) visitModule(i);

  // Each module looks up what it provides, what its sources export and every
  // published MultiToken. Pinned tokens resolve the same in every module.
  const visibility = new Map<string, Map<TokenKey, readonly string[]>>();
  for (const [i, node] of modules.entries()) {
    for (const t of own[i].keys()) lookup(i, t);
    for (const s of sources[i])
      for (const t of exported[s].keys()) lookup(i, t);
    for (const t of published.keys()) lookup(i, t);
    for (const [t, ids] of pinned) if (ids.length > 0) seen[i].set(t, ids);
    visibility.set(node.id, seen[i]);
  }
  found.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [, , error] of found) errors.push(error);

  const moduleExports = new Map<string, readonly string[]>();
  const exportedTokens = new Map<string, Set<TokenKey>>();
  for (const [i, node] of modules.entries()) {
    for (const token of node.exportTokens) {
      if (
        !(token instanceof MultiToken) &&
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
        ...node.exportTokens.flatMap((t) =>
          collected(t)
            ? (publishedBy[i].get(t) ?? [])
            : t instanceof MultiToken
              ? (pinned.get(t) ?? []).filter(
                  (id) => providers.get(id)?.module === node.id,
                )
              : lookup(i, t),
        ),
        ...node.exportModules,
      ]),
    ]);
    exportedTokens.set(
      node.id,
      new Set([...exported[i].keys(), ...publishedBy[i].keys()]),
    );
  }

  return { visibility, moduleExports, exportedTokens, ambiguous };
}
