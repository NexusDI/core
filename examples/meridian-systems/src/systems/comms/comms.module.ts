import { defineModule, provide } from '@nexusdi/core';

import { COMMAND_HANDLERS } from '../../simulation/commands';
import { SHIP_RECORDS, SHIP_SYSTEMS } from '../../simulation/contracts';
import { POWER_CONSUMERS } from '../engineering/contracts';
import { Engineering } from '../engineering/engineering.module';

import { CommsCommands } from './comms-commands';
import { CommsPhysics } from './comms-physics';
import { CommsPower } from './comms-power';
import { COMMS_ARRAY } from './contracts';
import { PhasedArray } from './phased-array';
import { COMMS_RECORD } from './comms-record';

/**
 * The phased array, stepped in phase 6, with its load and its commands. The
 * array reads the global `SubspaceLink` through `optional()`, so a ship
 * without the link hails into silence. It imports Engineering for the reactor
 * the array reads at sign-off.
 */
export const Comms = defineModule({
  name: 'Comms',
  imports: [Engineering],
  providers: [
    provide(COMMS_ARRAY, { useClass: PhasedArray }),
    provide(SHIP_SYSTEMS, { useClass: CommsPhysics }),
    provide(POWER_CONSUMERS, { useClass: CommsPower }),
    provide(COMMAND_HANDLERS, { useClass: CommsCommands }),
    provide(SHIP_RECORDS, { useValue: COMMS_RECORD }),
  ],
  exports: [
    COMMS_ARRAY,
    SHIP_SYSTEMS,
    POWER_CONSUMERS,
    COMMAND_HANDLERS,
    SHIP_RECORDS,
  ],
});
