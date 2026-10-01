import {
  REQUEST,
  Token,
  type BlueprintView,
  type MissingProviderError,
  type NearMiss,
} from '@nexusdi/core';

/** What a MissingProviderError looked up: the token and the module that could not see it. */
type MissingLookup = NonNullable<MissingProviderError['lookup']>;

/**
 * Where a token exists that `lookup.moduleId` cannot see: a module that
 * provides it without exporting it, a module that exports it and is not
 * imported, and a distinct Token with the same description. Classes compare
 * by identity, so two classes with one name are never a near miss.
 */
export function nearMissesOf(
  lookup: MissingLookup,
  view: BlueprintView,
): NearMiss[] {
  const modules = new Map(view.modules.map((m) => [m.id, m]));
  const providers = view.providers.filter((p) => p.token !== REQUEST);
  const misses: NearMiss[] = [];

  const owners = new Set<string>();
  for (const provider of providers) {
    if (
      provider.token !== lookup.token ||
      provider.module === lookup.moduleId ||
      owners.has(provider.module)
    )
      continue;
    owners.add(provider.module);
    const owner = modules.get(provider.module);
    const exported = owner?.exports.includes(provider.id) ?? false;
    misses.push({
      kind: exported ? 'not-imported' : 'not-exported',
      module: owner?.name ?? provider.module,
    });
  }

  const token = lookup.token;
  if (token instanceof Token) {
    const namesakes = new Set<string>();
    for (const provider of providers) {
      const other = provider.token;
      if (
        !(other instanceof Token) ||
        other === token ||
        other.description !== token.description ||
        namesakes.has(provider.module)
      )
        continue;
      namesakes.add(provider.module);
      misses.push({
        kind: 'same-description',
        module: modules.get(provider.module)?.name ?? provider.module,
      });
    }
  }
  return misses;
}
