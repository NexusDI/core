import type { PowerLoad } from '../../physics/power';
import { RAILGUN_LOAD, railgunDemand } from '../../physics/weapons';
import {
  SIM_OPTIONS,
  type ShipSnapshot,
  type SimOptions,
} from '../../simulation/contracts';
import type { IPowerConsumer } from '../engineering/contracts';

import { type IWeaponMount, WEAPON_MOUNT } from './contracts';

/**
 * The capacitor's load on the power router at priority 6, from
 * `railgunDemand` at the `dt` of SIM_OPTIONS and the rating behind the mount.
 */
export class WeaponsPower implements IPowerConsumer {
  // SIM_OPTIONS reaches the consumer through the global Simulation.
  static deps = [WEAPON_MOUNT, SIM_OPTIONS] as const;

  constructor(
    private readonly mount: IWeaponMount,
    private readonly options: Pick<SimOptions, 'dt'>,
  ) {}

  draw(ship: ShipSnapshot): PowerLoad {
    return {
      ...RAILGUN_LOAD,
      demand: railgunDemand(
        ship.weapons,
        ship.setpoints.weapons,
        this.mount.rating,
        this.options.dt,
      ),
    };
  }
}
