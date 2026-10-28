import { defineModule, provide } from '@nexusdi/core';

import { SHIP_SYSTEMS } from '../../simulation/contracts';
import { POWER_CONSUMERS } from '../engineering/contracts';

import { MAIN_DRIVE } from './contracts';
import { PlasmaDrive } from './plasma-drive';
import { PropulsionPhysics } from './propulsion-physics';
import { PropulsionPower } from './propulsion-power';

/** The main drive, stepped in phase 2, with its load on the power router. */
export const Propulsion = defineModule({
  name: 'Propulsion',
  providers: [
    provide(MAIN_DRIVE, { useClass: PlasmaDrive }),
    provide(SHIP_SYSTEMS, { useClass: PropulsionPhysics }),
    provide(POWER_CONSUMERS, { useClass: PropulsionPower }),
  ],
  exports: [MAIN_DRIVE, SHIP_SYSTEMS, POWER_CONSUMERS],
});
