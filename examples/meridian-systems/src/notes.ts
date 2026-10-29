import type { BlueprintView } from '@nexusdi/core';

import {
  PHASES,
  SHIP_SYSTEMS,
  type ShipSystemClass,
  TICK_LOOP,
} from './simulation/contracts';
import { MeridianSystems } from './meridian-systems.module';
import { FtlDrive } from './systems/ftl/ftl-drive.module';

/**
 * Labels each ship provider `system: <module name>` for the devtools graph.
 * The walk starts at the module that binds the `TICK_LOOP` the root
 * resolves, at `MeridianSystems`, and at `FtlDrive` or a module a plugin put
 * in its place, then follows their imports transitively. Each module that
 * binds a `SHIP_SYSTEMS` provider counts as ship too, every provider of it
 * included. A module outside the ship, such as one the root imports beside
 * it, stays unlabelled. A `SHIP_SYSTEMS` class provider whose class declares
 * a static `phase` also gets `phase: <n>`.
 * The shape matches devtools' `GraphAnnotator`, so the library needs no
 * import from `@nexusdi/devtools`.
 */
export function shipNotes(
  view: BlueprintView,
): readonly { provider: string; label: string }[] {
  const [loopId] = view.visible(view.root, view.canonical(TICK_LOOP));
  const loop = view.providers.find((provider) => provider.id === loopId);
  if (loop === undefined) return [];

  const systems = view.canonical(SHIP_SYSTEMS);
  const modules = new Map(view.modules.map((module) => [module.id, module]));
  const ship = new Set<string>();
  const pending = [
    loop.module,
    ...view.modules
      .filter(({ definition, replaced }) =>
        [MeridianSystems, FtlDrive].some(
          (start) => definition === start || replaced === start,
        ),
      )
      .map(({ id }) => id),
  ];
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (ship.has(id)) continue;
    ship.add(id);
    pending.push(...(modules.get(id)?.imports ?? []));
  }
  for (const provider of view.providers) {
    if (provider.token === systems) ship.add(provider.module);
  }

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

/** True when `impl` is a class with a static `phase` that is one of `PHASES`. */
function isShipSystemClass(impl: unknown): impl is ShipSystemClass {
  return (
    typeof impl === 'function' &&
    'phase' in impl &&
    PHASES.some((phase) => phase === impl.phase)
  );
}
