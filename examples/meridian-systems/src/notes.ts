import type { BlueprintView } from '@nexusdi/core';

import { TICK_LOOP } from './simulation/contracts';

/**
 * Labels each ship provider `system: <module name>` for the devtools graph.
 * It finds the module that binds the `TICK_LOOP` the root resolves, then walks
 * that module's imports transitively, so a root's own modules stay unlabelled.
 * The shape matches devtools' `GraphAnnotator`, so the library needs no
 * import from `@nexusdi/devtools`.
 */
export function shipNotes(
  view: BlueprintView,
): readonly { provider: string; label: string }[] {
  const [loopId] = view.visible(view.root, view.canonical(TICK_LOOP));
  const loop = view.providers.find((provider) => provider.id === loopId);
  if (loop === undefined) return [];

  const modules = new Map(view.modules.map((module) => [module.id, module]));
  const ship = new Set<string>();
  const pending = [loop.module];
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (ship.has(id)) continue;
    ship.add(id);
    pending.push(...(modules.get(id)?.imports ?? []));
  }

  return view.providers
    .filter((provider) => ship.has(provider.module))
    .map((provider) => ({
      provider: provider.id,
      label: `system: ${modules.get(provider.module)?.name}`,
    }));
}
