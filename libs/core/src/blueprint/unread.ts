import { MultiToken } from '../definitions/token.js';
import { UnreadContributionError } from '../errors/index.js';
import type {
  DepEntry,
  ModuleNode,
  ProviderRecord,
  TokenKey,
} from './blueprint.js';
import { contributionLabel } from './contribution-label.js';

/** Module id → the tokens its providers read through all() or lazy(all()). */
function collectedBy(
  ...lists: readonly (readonly ProviderRecord[])[]
): ReadonlyMap<string, ReadonlySet<TokenKey>> {
  const collected = new Map<string, Set<TokenKey>>();
  const add = (module: string, dep: DepEntry): void => {
    if (dep.kind !== 'all' && dep.kind !== 'lazy-all') return;
    const tokens = collected.get(module) ?? new Set<TokenKey>();
    tokens.add(dep.token);
    collected.set(module, tokens);
  };
  for (const records of lists)
    for (const record of records) {
      for (const dep of record.deps) add(record.module, dep);
      for (const prop of record.props) add(record.module, prop.dep);
    }
  return collected;
}

/**
 * Rejects a private contribution to a MultiToken in a non-root module when
 * the module does not export the token and none of its providers reads it
 * through all() or lazy(all()). The check walks `records`, the records the
 * compile.provider hooks return, so a contribution a hook removes is not
 * checked, and it skips every record of a pinned token. A provider reads a
 * token when its record binds it in `records` or in `written`, the records
 * as the modules wrote them. A hook that replaces or removes a collector
 * therefore leaves the contributions it collected unflagged. Errors come in
 * record order. `modules[0]` is the root.
 */
export function unreadContributions(
  modules: readonly ModuleNode[],
  records: readonly ProviderRecord[],
  pinned: ReadonlyMap<TokenKey, readonly string[]>,
  written: readonly ProviderRecord[],
): UnreadContributionError[] {
  const nodes = new Map(modules.map((m) => [m.id, m]));
  const root = modules[0]?.id;
  const collected = collectedBy(records, written);
  const errors: UnreadContributionError[] = [];
  for (const record of records) {
    if (!(record.token instanceof MultiToken) || pinned.has(record.token))
      continue;
    const node = nodes.get(record.module);
    if (
      node === undefined ||
      node.id === root ||
      node.exportTokens.includes(record.token)
    )
      continue;
    if (!collected.get(node.id)?.has(record.token))
      errors.push(
        new UnreadContributionError({
          token: record.name,
          module: node.name,
          provider: contributionLabel(record, records),
        }),
      );
  }
  return errors;
}
