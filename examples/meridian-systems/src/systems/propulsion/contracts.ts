import { Token } from '@nexusdi/core';

import type { QueuedCommand } from '../../simulation/commands';

/** The main drive's fixed figures. */
export interface DriveRating {
  /** The share of the electric power that ends in the jet, η_d. */
  readonly efficiency: number;
  /** The exhaust velocity v_e, in m/s. */
  readonly exhaust: number;
  /** The drive's draw at full throttle, in W. */
  readonly power: number;
}

/** The main drive at the end of a tick. */
export interface DriveRecord {
  /** In N. */
  readonly thrust: number;
  /** The propellant the drive spends, in kg/s. */
  readonly massFlow: number;
  /** Along the track, in m/s². */
  readonly acceleration: number;
  /** Along the track, in m/s. */
  readonly velocity: number;
  /** Along the track since tick 0, in m. */
  readonly distance: number;
}

/** What the crew set for the main drive. */
export interface DriveSetpoints {
  /** 0 to 1. */
  readonly throttle: number;
}

/** The ship's main drive. */
export interface IMainDrive {
  /** The drive's fixed figures, in W and m/s. */
  readonly rating: DriveRating;
  /** Queues the throttle the crew asks for, 0 to 1. */
  throttle(level: number): QueuedCommand;
}

export const MAIN_DRIVE = new Token<IMainDrive>('MainDrive');

declare module '../../simulation/contracts' {
  interface ShipRecords {
    readonly drive: DriveRecord;
  }
  interface ShipSetpoints {
    readonly drive: DriveSetpoints;
  }
}
