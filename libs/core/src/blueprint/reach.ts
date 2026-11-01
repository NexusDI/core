import type { BlueprintView } from './views.js';

/**
 * Whether module `from` reaches module `to` through imports, directly or
 * through other modules, load imports included. A module reaches itself.
 * Importing `from` into `to` closes a cycle exactly when this is true.
 */
export function importsReach(
  view: BlueprintView,
  from: string,
  to: string,
): boolean {
  const imports = new Map(view.modules.map((m) => [m.id, m.imports]));
  const seen = new Set<string>();
  const pending = [from];
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (id === to) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    pending.push(...(imports.get(id) ?? []));
  }
  return false;
}
