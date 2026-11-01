import {
  REQUEST,
  Token,
  type BlueprintView,
  type MissingProviderError,
  type NearMiss,
} from '@nexusdi/core';

/** What a MissingProviderError looked up: the token and the module that could not see it. */
type MissingLookup = NonNullable<MissingProviderError['lookup']>;

/** The ids of the modules that reach `target` through imports, `target` excluded. One reverse walk. */
function modulesReaching(view: BlueprintView, target: string): Set<string> {
  const importers = new Map<string, string[]>();
  for (const m of view.modules) {
    for (const imported of m.imports) {
      const list = importers.get(imported);
      if (list === undefined) importers.set(imported, [m.id]);
      else list.push(m.id);
    }
  }
  const reaching = new Set<string>();
  const pending = [target];
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    for (const importer of importers.get(id) ?? []) {
      if (importer === target || reaching.has(importer)) continue;
      reaching.add(importer);
      pending.push(importer);
    }
  }
  return reaching;
}

/**
 * Where a token exists that `lookup.moduleId` cannot see:
 * - a module that provides it without exporting it (`not-exported`),
 * - a module that exports it and is not imported (`not-imported`),
 * - a non-global module that provides it and reaches `lookup.moduleId`
 *   through imports, so importing it would close a cycle (`importer`),
 * - a distinct Token with the same description (`same-description`).
 *
 * A global module that provides the token stays `not-exported`: its exports
 * are visible everywhere, so exporting the token is the whole fix.
 * Classes compare by identity, so two classes with one name are never a
 * near miss.
 */
export function nearMissesOf(
  lookup: MissingLookup,
  view: BlueprintView,
): NearMiss[] {
  const modules = new Map(view.modules.map((m) => [m.id, m]));
  const providers = view.providers.filter((p) => p.token !== REQUEST);
  const misses: NearMiss[] = [];
  const reaching = modulesReaching(view, lookup.moduleId);

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
    const kind =
      owner?.global !== true && reaching.has(provider.module)
        ? 'importer'
        : exported
          ? 'not-imported'
          : 'not-exported';
    misses.push({ kind, module: owner?.name ?? provider.module });
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
