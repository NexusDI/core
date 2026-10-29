import { defineModule } from '@nexusdi/core';

import { Comms } from './systems/comms/comms.module';
import { Engineering } from './systems/engineering/engineering.module';
import { Helm } from './systems/helm/helm.module';
import { ShipLifeSupport } from './systems/life-support/life-support.module';
import { Propulsion } from './systems/propulsion/propulsion.module';
import { Safety } from './systems/safety/safety.module';
import { Tactical } from './systems/tactical/tactical.module';
import { Weapons } from './systems/weapons/weapons.module';
import { Telemetry } from './telemetry/telemetry.module';

/**
 * Every system the ship has at startup, so an app pulls the ship in with one
 * import beside `Simulation.forRoot()`. It provides and exports nothing: each
 * system publishes its contributions to the buses, and an app imports the
 * system modules whose tokens it reads.
 */
export const MeridianSystems = defineModule({
  name: 'MeridianSystems',
  imports: [
    Telemetry,
    Engineering,
    ShipLifeSupport,
    Safety,
    Comms,
    Tactical,
    Propulsion,
    Helm,
    Weapons,
  ],
});
