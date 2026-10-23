import { Token } from '@nexusdi/core';

import type { DriveRating } from '../../physics/motion';
import type { QueuedCommand } from '../../simulation/commands';

/** The ship's main drive. */
export interface IMainDrive {
  /** The drive's fixed figures, in W and m/s. */
  readonly rating: DriveRating;
  /** Queues the throttle the crew asks for, 0 to 1. */
  throttle(level: number): QueuedCommand;
}

export const MAIN_DRIVE = new Token<IMainDrive>('MainDrive');
