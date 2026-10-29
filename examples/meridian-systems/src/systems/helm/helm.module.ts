import { defineModule, provide } from '@nexusdi/core';

import { COMMAND_HANDLERS } from '../../simulation/commands';
import { SHIP_RECORDS, SHIP_SYSTEMS } from '../../simulation/contracts';
import { POWER_CONSUMERS } from '../engineering/contracts';
import { Propulsion } from '../propulsion/propulsion.module';
import { Tactical } from '../tactical/tactical.module';

import { HELM, THRUSTERS } from './contracts';
import { HelmCommands } from './helm-commands';
import { HelmControl } from './helm-control';
import { HelmPhysics } from './helm-physics';
import { HelmPower } from './helm-power';
import { RcsThrusters } from './rcs-thrusters';
import { HELM_RECORD } from './helm-record';

/**
 * The thrusters and the helm, stepped in phase 2, with the thrusters' load on
 * the power router and the crew's helm commands. HelmControl reads MAIN_DRIVE
 * and NAV_CHARTS, so Helm imports Propulsion and Tactical.
 */
export const Helm = defineModule({
  name: 'Helm',
  imports: [Propulsion, Tactical],
  providers: [
    provide(THRUSTERS, { useClass: RcsThrusters }),
    provide(HELM, { useClass: HelmControl }),
    provide(SHIP_SYSTEMS, { useClass: HelmPhysics }),
    provide(POWER_CONSUMERS, { useClass: HelmPower }),
    provide(COMMAND_HANDLERS, { useClass: HelmCommands }),
    provide(SHIP_RECORDS, { useValue: HELM_RECORD }),
  ],
  exports: [
    THRUSTERS,
    HELM,
    SHIP_SYSTEMS,
    POWER_CONSUMERS,
    COMMAND_HANDLERS,
    SHIP_RECORDS,
  ],
});
