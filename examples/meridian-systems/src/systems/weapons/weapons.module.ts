import { defineModule, provide } from '@nexusdi/core';

import { COMMAND_HANDLERS } from '../../simulation/commands';
import { SHIP_SYSTEMS } from '../../simulation/contracts';
import { POWER_CONSUMERS } from '../engineering/contracts';
import { Engineering } from '../engineering/engineering.module';

import { WEAPON_MOUNT } from './contracts';
import { RailgunMount } from './railgun-mount';
import { WeaponsCommands } from './weapons-commands';
import { WeaponsPhysics } from './weapons-physics';
import { WeaponsPower } from './weapons-power';

/**
 * The railgun, stepped in phase 3, with the capacitor's load on the power
 * router and the crew's fire command. RailgunMount reads POWER_ROUTER, so
 * Weapons imports Engineering.
 */
export const Weapons = defineModule({
  name: 'Weapons',
  imports: [Engineering],
  providers: [
    provide(WEAPON_MOUNT, { useClass: RailgunMount }),
    provide(SHIP_SYSTEMS, { useClass: WeaponsPhysics }),
    provide(POWER_CONSUMERS, { useClass: WeaponsPower }),
    provide(COMMAND_HANDLERS, { useClass: WeaponsCommands }),
  ],
  exports: [WEAPON_MOUNT, SHIP_SYSTEMS, POWER_CONSUMERS, COMMAND_HANDLERS],
});
