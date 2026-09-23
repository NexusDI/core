import { Token } from '../definitions/token.js';
import type { NearMiss } from '../errors/index.js';
import {
  REQUEST_ID,
  type ModuleNode,
  type ProviderRecord,
  type TokenKey,
} from './blueprint.js';

export interface NearMissSource {
  readonly modules: Iterable<ModuleNode>;
  readonly records: Iterable<ProviderRecord>;
  readonly exportedTokens: ReadonlyMap<string, ReadonlySet<TokenKey>>;
}

/**
 * Where a token exists that `fromModule` cannot see: a module that provides
 * it without exporting it, a module that exports it and is not imported, and
 * a distinct Token object with the same description. Classes compare by
 * identity, so two classes with one name are never a near miss.
 */
export function findNearMisses(
  token: TokenKey,
  fromModule: string,
  source: NearMissSource,
): NearMiss[] {
  const names = new Map([...source.modules].map((m) => [m.id, m.name]));
  const records = [...source.records].filter((r) => r.id !== REQUEST_ID);
  const misses: NearMiss[] = [];

  const owners = new Set<string>();
  for (const record of records) {
    if (
      record.token !== token ||
      record.module === fromModule ||
      owners.has(record.module)
    )
      continue;
    owners.add(record.module);
    const exported =
      source.exportedTokens.get(record.module)?.has(token) ?? false;
    misses.push({
      kind: exported ? 'not-imported' : 'not-exported',
      module: names.get(record.module) ?? record.module,
    });
  }

  if (token instanceof Token) {
    const namesakes = new Set<string>();
    for (const record of records) {
      const other = record.token;
      if (
        !(other instanceof Token) ||
        other === token ||
        other.description !== token.description
      )
        continue;
      if (namesakes.has(record.module)) continue;
      namesakes.add(record.module);
      misses.push({
        kind: 'same-description',
        module: names.get(record.module) ?? record.module,
      });
    }
  }
  return misses;
}
