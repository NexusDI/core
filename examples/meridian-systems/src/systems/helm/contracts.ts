import { Token } from '@nexusdi/core';

import type { QueuedCommand } from '../../simulation/commands';

/** The name the helm answers to on the command desk. */
export const HELM_SYSTEM = 'helm';

/** The actions the helm takes and their ranges, in words. shipText reads it after "It takes". */
export const HELM_ACTIONS =
  'course with a charted star to steer for and burn with a level from 0 to 1';

/** The attitude thrusters' fixed figures. */
export interface ThrusterRating {
  /** The torque limit τ_max, in N·m. */
  readonly maxTorque: number;
  /** The thrusters' draw at the torque limit, in W. */
  readonly power: number;
}

/** The ship's yaw at the end of a tick. */
export interface HelmRecord {
  /** The yaw angle θ, in rad, in (−π, π]. */
  readonly attitude: number;
  /** The yaw rate ω, in rad/s. */
  readonly rate: number;
  /** The torque the thrusters applied this tick, in N·m. */
  readonly torque: number;
}

/** What the crew set for the helm. */
export interface HelmSetpoints {
  /** The course θ_set the helm steers for, in rad, in (−π, π]. */
  readonly heading: number;
}

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

declare module '../../simulation/contracts' {
  interface ShipRecords {
    readonly helm: HelmRecord;
  }
  interface ShipSetpoints {
    readonly helm: HelmSetpoints;
  }
}
