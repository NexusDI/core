import { lazy } from '@nexusdi/core';

import {
  RAILGUN,
  RAILGUN_LOAD,
  type RailgunRating,
  railgunDemand,
} from '../../physics/weapons';
import type { QueuedCommand } from '../../simulation/commands';
import {
  type IShipState,
  SHIP_STATE,
  SIM_OPTIONS,
  type SimOptions,
} from '../../simulation/contracts';
import { type IPowerRouter, POWER_ROUTER } from '../engineering/contracts';

import type { IWeaponMount } from './contracts';

/**
 * The Meridian's railgun mount. It queues the crew's shots on `SHIP_STATE`
 * and reads the router through a thunk, since the router reads the mount's
 * load through `POWER_CONSUMERS`.
 */
export class RailgunMount implements IWeaponMount {
  // SIM_OPTIONS reaches the mount through the global Simulation.
  static deps = [SHIP_STATE, SIM_OPTIONS, lazy(POWER_ROUTER)] as const;

  readonly rating: RailgunRating = RAILGUN;

  // The container builds the router after the mount, so the constructor
  // never calls the thunk.
  constructor(
    private readonly state: IShipState,
    private readonly options: Pick<SimOptions, 'dt'>,
    private readonly router: () => IPowerRouter,
  ) {}

  fire(range: number): QueuedCommand {
    if (!(range >= 0 && range <= this.rating.range)) {
      throw new RangeError(
        `fire() takes a range from 0 to ${this.rating.range} m, and got ${range}.`,
      );
    }
    const ship = this.state.snapshot();
    // An armed mount stays armed. A second router check would refuse a shot
    // on a tick the router sheds the capacitor.
    if (ship.setpoints.weapons.armed) {
      return this.state.queue({ weapons: { range } });
    }
    // The check asks the load the next tick asks once the mount is armed.
    const armed = { ...ship.setpoints.weapons, armed: true };
    this.router().divert({
      ...RAILGUN_LOAD,
      demand: railgunDemand(ship.weapons, armed, this.rating, this.options.dt),
    });
    return this.state.queue({ weapons: { armed: true, range } });
  }
}
