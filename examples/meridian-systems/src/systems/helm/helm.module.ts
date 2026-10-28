import { defineModule, provide } from '@nexusdi/core';

import { COMMAND_HANDLERS } from '../../simulation/commands';
import { SHIP_SYSTEMS } from '../../simulation/contracts';
import { POWER_CONSUMERS } from '../engineering/contracts';

import { HELM, THRUSTERS } from './contracts';
import { HelmCommands } from './helm-commands';
import { HelmControl } from './helm-control';
import { HelmPhysics } from './helm-physics';
import { HelmPower } from './helm-power';
import { RcsThrusters } from './rcs-thrusters';

/**
 * The thrusters and the helm, stepped in phase 2, with the thrusters' load on
 * the power router and the crew's helm commands. HelmControl reads MAIN_DRIVE
 * and NAV_CHARTS through the global MeridianSystems, which re-exports
 * Propulsion and the tactical module.
 */
export const Helm = defineModule({
  name: 'Helm',
  providers: [
    provide(THRUSTERS, { useClass: RcsThrusters }),
    provide(HELM, { useClass: HelmControl }),
    provide(SHIP_SYSTEMS, { useClass: HelmPhysics }),
    provide(POWER_CONSUMERS, { useClass: HelmPower }),
    provide(COMMAND_HANDLERS, { useClass: HelmCommands }),
  ],
  exports: [THRUSTERS, HELM, SHIP_SYSTEMS, POWER_CONSUMERS, COMMAND_HANDLERS],
});
