import { defineModule, provide } from '@nexusdi/core';

import { COMMAND_HANDLERS } from '../../simulation/commands';
import { SHIP_RECORDS, SHIP_SYSTEMS } from '../../simulation/contracts';

import {
  COOLANT_LOOP,
  POWER_CONSUMERS,
  POWER_ROUTER,
  REACTOR,
  SHIELD_GRID,
} from './contracts';
import { DeflectorGrid } from './deflector-grid';
import { EngineeringCommands } from './engineering-commands';
import { EngineeringPhysics } from './engineering-physics';
import { ShieldPower } from './engineering-power';
import { FusionReactor } from './fusion-reactor';
import { PlasmaRouter } from './plasma-router';
import { RadiatorLoop } from './radiator-loop';
import { ENGINEERING_RECORD } from './engineering-record';

/** The reactor, the coolant loop, the power router and the shield grid, stepped in phase 1. */
export const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    // Private: other systems read the reactor and the router, never the loop.
    provide(COOLANT_LOOP, { useClass: RadiatorLoop }),
    provide(POWER_ROUTER, { useClass: PlasmaRouter }),
    provide(SHIELD_GRID, { useClass: DeflectorGrid }),
    provide(SHIP_SYSTEMS, { useClass: EngineeringPhysics }),
    provide(POWER_CONSUMERS, { useClass: ShieldPower }),
    provide(COMMAND_HANDLERS, { useClass: EngineeringCommands }),
    provide(SHIP_RECORDS, { useValue: ENGINEERING_RECORD }),
  ],
  exports: [
    REACTOR,
    POWER_ROUTER,
    SHIELD_GRID,
    SHIP_SYSTEMS,
    POWER_CONSUMERS,
    COMMAND_HANDLERS,
    SHIP_RECORDS,
  ],
});
