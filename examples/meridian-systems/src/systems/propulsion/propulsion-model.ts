import type { HullRating } from '../../physics/constants';
import type { PowerLoad } from '../engineering/contracts';

import type { DriveRating, DriveRecord, DriveSetpoints } from './contracts';

/** The Meridian's plasma drive. */
export const PLASMA_DRIVE: DriveRating = {
  efficiency: 0.6,
  exhaust: 50_000,
  power: 600e6,
};

/** The main drive's place on the power router. */
export const MAIN_DRIVE_LOAD: Omit<PowerLoad, 'demand'> = {
  id: 'main-drive',
  priority: 5,
  heatShare: 0.4,
};

/** The drive's thrust at `power` W, `F = 2 · η_d · P_d / v_e`, in N. */
export function thrust(power: number, rating: DriveRating): number {
  return (2 * rating.efficiency * power) / rating.exhaust;
}

/** The power the main drive asks the router for, `throttle · P`, in W. */
export function driveDemand(
  setpoints: DriveSetpoints,
  rating: DriveRating,
): number {
  return setpoints.throttle * rating.power;
}

/** Everything one drive step reads beside the record. */
interface DriveTick {
  /** The power the router allocated the main drive this tick, in W. */
  readonly power: number;
  /** The helm's attitude at the start of the tick, in rad. */
  readonly attitude: number;
  /** The course the helm steers for, in rad. */
  readonly course: number;
  /** Seconds. */
  readonly dt: number;
}

/**
 * Steps the main drive in phase 2.
 *
 * The drive pushes with the thrust of `power` and spends `ṁ = F / v_e`. The
 * ship gains `a = F · cos(attitude − course) / M` along the track, then
 * `v' = v + a · dt` and `s' = s + v' · dt`. With no thrust the step computes
 * no cosine and the ship coasts. The step returns the record it got at rest
 * with no thrust, and every record it builds is frozen.
 */
export function stepDrive(
  drive: DriveRecord,
  { power, attitude, course, dt }: DriveTick,
  rating: DriveRating,
  hull: HullRating,
): DriveRecord {
  const force = thrust(power, rating);
  if (
    force === 0 &&
    drive.thrust === 0 &&
    drive.acceleration === 0 &&
    drive.velocity === 0
  ) {
    return drive;
  }
  const acceleration =
    force === 0 ? 0 : (force * Math.cos(attitude - course)) / hull.mass;
  const velocity = drive.velocity + acceleration * dt;
  return Object.freeze({
    thrust: force,
    massFlow: force / rating.exhaust,
    acceleration,
    velocity,
    distance: drive.distance + velocity * dt,
  });
}
