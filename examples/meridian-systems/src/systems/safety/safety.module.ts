import { defineModule, provide } from '@nexusdi/core';

import { COMMAND_HANDLERS } from '../../simulation/commands';
import {
  DECK_PLAN,
  SHIP_RECORDS,
  SHIP_SYSTEMS,
} from '../../simulation/contracts';
import { ShipLifeSupport } from '../life-support/life-support.module';

import { BlastDoorControl } from './blast-door-control';
import {
  ALARM_BOARD,
  BLAST_DOORS,
  FIRE_SUPPRESSION,
  MASTER_ALARM,
} from './contracts';
import { InertGasSuppression } from './inert-gas-suppression';
import { MasterAlarm } from './master-alarm';
import { SafetyCommands } from './safety-commands';
import { SafetyPhysics } from './safety-physics';
import { safetyRecord } from './safety-record';

/** The doors, the fires, the floods and the alarms, stepped in phase 5, with their panels and the master alarm. */
export const Safety = defineModule({
  name: 'Safety',
  // SafetyPhysics reads ATMOSPHERE_PROBE from the ship's one life support.
  imports: [ShipLifeSupport],
  providers: [
    provide(BLAST_DOORS, { useClass: BlastDoorControl }),
    provide(FIRE_SUPPRESSION, { useClass: InertGasSuppression }),
    provide(MASTER_ALARM, { useClass: MasterAlarm }),
    provide(ALARM_BOARD, { useExisting: MASTER_ALARM }),
    provide(SHIP_SYSTEMS, { useClass: SafetyPhysics }),
    provide(COMMAND_HANDLERS, { useClass: SafetyCommands }),
    provide(SHIP_RECORDS, { useFactory: safetyRecord, deps: [DECK_PLAN] }),
  ],
  exports: [
    BLAST_DOORS,
    FIRE_SUPPRESSION,
    MASTER_ALARM,
    ALARM_BOARD,
    SHIP_SYSTEMS,
    COMMAND_HANDLERS,
    SHIP_RECORDS,
  ],
});
