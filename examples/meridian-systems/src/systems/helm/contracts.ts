import { Token } from '@nexusdi/core';

import type { ThrusterRating } from '../../physics/motion';
import type { QueuedCommand } from '../../simulation/commands';

/** The actions the helm takes and their ranges, in words. shipText reads it after "It takes". */
export const HELM_ACTIONS =
  'course with a charted star to steer for and burn with a level from 0 to 1';

/** The ship's attitude thrusters. */
export interface IThrusters {
  /** The thrusters' fixed figures, in N·m and W. */
  readonly rating: ThrusterRating;
  /** Queues the course `heading` in rad, wrapped to (−π, π]. Throws RangeError for a heading that is not finite. */
  steer(heading: number): QueuedCommand;
}

/** The helm's panel. */
export interface IHelm {
  /**
   * Plots the course to the star `to` on the charts and steers for its heading.
   * Throws BadCommandError for a star the charts do not hold.
   */
  course(to: string): QueuedCommand;
  /** Queues the main drive's throttle, 0 to 1. */
  burn(level: number): QueuedCommand;
}

export const THRUSTERS = new Token<IThrusters>('Thrusters');
export const HELM = new Token<IHelm>('Helm');
