import { Token } from '@nexusdi/core';

import type { QueuedCommand } from '../../simulation/commands';

/** The name weapons answers to on the command desk. */
export const WEAPONS_SYSTEM = 'weapons';

/** What the railgun takes, in words. shipText reads it after "It takes". */
export const WEAPONS_ACTIONS = 'fire with a range from 0 to 100,000 m';

/** The railgun mount's fixed figures. */
export interface RailgunRating {
  /** The most the capacitor holds, E_max, in J. */
  readonly capacity: number;
  /** The charge one shot spends, E_shot, in J. */
  readonly shot: number;
  /** The most the capacitor draws while it charges, P_max, in W. */
  readonly power: number;
  /** The share of a shot's charge that ends in the coolant loop as one pulse. */
  readonly pulseShare: number;
  /** The chance of a hit at 0 m, 0 to 1. */
  readonly accuracy: number;
  /** The range over which the hit chance falls by a factor of e, in m. */
  readonly falloff: number;
  /** The farthest range the mount fires at, in m. */
  readonly range: number;
}

/**
 * `idle`: unarmed. `held`: armed below a full bank, and the router shed the
 * capacitor this tick. `charging`: armed below a full bank. `charged`: the
 * bank holds `capacity`.
 */
export type WeaponsStatus = 'idle' | 'held' | 'charging' | 'charged';

/** One shot the railgun fired. */
export interface RailgunShot {
  readonly tick: number;
  /** The range the crew ordered, in m. */
  readonly range: number;
  readonly hit: boolean;
}

/** The railgun at the end of a tick. */
export interface WeaponsRecord {
  readonly status: WeaponsStatus;
  /** The capacitor's charge, in J. */
  readonly charge: number;
  /** Shots fired since tick 0, and how many hit. */
  readonly shots: number;
  readonly hits: number;
  /** The newest shot, or null before the first. */
  readonly lastShot: RailgunShot | null;
}

/** What the crew set for the railgun. */
export interface WeaponsSetpoints {
  /** True once the crew fired: the capacitor charges to `capacity` and holds it. */
  readonly armed: boolean;
  /** The range of the shot that waits for the charge, in m, or null. */
  readonly range: number | null;
}

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
