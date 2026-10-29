import { defineModule, type ModuleRef } from '@nexusdi/core';

import { MeridianSystems } from '../src/meridian-systems.module';
import type { SimOptions } from '../src/simulation/contracts';
import { Simulation } from '../src/simulation/simulation.module';
import { SubspaceLink } from '../src/systems/comms/subspace-link.module';

import { SHIP_OPTIONS } from './support';

/** How a test's ship root is built. */
export interface ShipRootOptions {
  /** The simulation's seed and step. Defaults to `SHIP_OPTIONS`. */
  readonly sim?: SimOptions;
  /** The relay the ship links to. Without one the ship runs offline. */
  readonly relayUrl?: string;
  readonly relayTimeout?: number;
  /** The system modules whose tokens the test reads from the root. */
  readonly reads?: readonly ModuleRef[];
}

/**
 * The root an app builds: `Simulation.forRoot()`, `SubspaceLink.forRoot()`
 * when the ship links to a relay, `MeridianSystems`, and the system modules
 * the test reads. Core keys a module by its definition, so a system module
 * the root imports beside `MeridianSystems` is the same node.
 */
export function shipRoot({
  sim = SHIP_OPTIONS,
  relayUrl,
  relayTimeout,
  reads = [],
}: ShipRootOptions = {}) {
  return defineModule({
    name: relayUrl === undefined ? 'OfflineShip' : 'LinkedShip',
    imports: [
      Simulation.forRoot(sim),
      ...(relayUrl === undefined
        ? []
        : [SubspaceLink.forRoot({ relayUrl, relayTimeout })]),
      MeridianSystems,
      ...reads,
    ],
  });
}
