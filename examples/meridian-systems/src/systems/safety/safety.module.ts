import { defineModule, provide } from '@nexusdi/core';

import { COMMAND_HANDLERS } from '../../simulation/commands';
import { SHIP_SYSTEMS } from '../../simulation/contracts';

import { BlastDoorControl } from './blast-door-control';
import { BLAST_DOORS, FIRE_SUPPRESSION, MASTER_ALARM } from './contracts';
import { InertGasSuppression } from './inert-gas-suppression';
import { MasterAlarm } from './master-alarm';
import { SafetyCommands } from './safety-commands';
import { SafetyPhysics } from './safety-physics';

/** The doors, the fires, the floods and the alarms, stepped in phase 5, with their panels and the master alarm. */
export const Safety = defineModule({
  name: 'Safety',
  providers: [
    provide(BLAST_DOORS, { useClass: BlastDoorControl }),
    provide(FIRE_SUPPRESSION, { useClass: InertGasSuppression }),
    provide(MASTER_ALARM, { useClass: MasterAlarm }),
    provide(SHIP_SYSTEMS, { useClass: SafetyPhysics }),
    provide(COMMAND_HANDLERS, { useClass: SafetyCommands }),
  ],
  exports: [
    BLAST_DOORS,
    FIRE_SUPPRESSION,
    MASTER_ALARM,
    SHIP_SYSTEMS,
    COMMAND_HANDLERS,
  ],
});
