import type { BlueprintView } from '@nexusdi/core';

import {
  SHIP_SYSTEMS,
  type ShipSystemClass,
  TICK_LOOP,
} from './simulation/contracts';

/**
 * Labels each ship provider `system: <module name>` for the devtools graph.
 * It finds the module that binds the `TICK_LOOP` the root resolves, then walks
 * that module's imports transitively, so a module outside that walk, such as
 * one the root imports beside the ship, stays unlabelled.
 * A `SHIP_SYSTEMS` class provider whose class declares a static `phase` also
 * gets `phase: <n>`.
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

  const systems = view.canonical(SHIP_SYSTEMS);
  return view.providers
    .filter((provider) => ship.has(provider.module))
    .flatMap((provider) => {
      const system = {
        provider: provider.id,
        label: `system: ${modules.get(provider.module)?.name}`,
      };
      const impl = provider.implementation;
      return provider.token === systems && isShipSystemClass(impl)
        ? [system, { provider: provider.id, label: `phase: ${impl.phase}` }]
        : [system];
    });
}

/** True when `impl` is a class with a static integer `phase` from 1 to 6. */
function isShipSystemClass(impl: unknown): impl is ShipSystemClass {
  if (typeof impl !== 'function') return false;
  const phase: unknown = (impl as { phase?: unknown }).phase;
  return (
    typeof phase === 'number' &&
    Number.isInteger(phase) &&
    phase >= 1 &&
    phase <= 6
  );
}
