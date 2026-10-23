import { Token } from '@nexusdi/core';

import type { RailgunRating } from '../../physics/weapons';
import type { QueuedCommand } from '../../simulation/commands';

/** What the railgun takes, in words. shipText reads it after "It takes". */
export const WEAPONS_ACTIONS = 'fire with a range from 0 to 100,000 m';

/** The ship's railgun mount. */
export interface IWeaponMount {
  /** The railgun's fixed figures, in J, W and m. */
  readonly rating: RailgunRating;
  /**
   * Queues a shot at `range` m. On an unarmed mount it first checks that the
   * router fits the load the next tick asks once armed and throws
   * PowerBudgetError when it does not; the shot then arms the mount. The shot
   * leaves on the first tick the capacitor holds 300 MJ. Throws RangeError
   * outside 0 to 100,000 m.
   */
  fire(range: number): QueuedCommand;
}

export const WEAPON_MOUNT = new Token<IWeaponMount>('WeaponMount');
