import { HULL, MAIN_DRIVE_LOAD, stepDrive } from '../../physics/motion';
import type {
  IShipSystem,
  Phase,
  ShipSnapshot,
  TickContext,
} from '../../simulation/contracts';

import { type IMainDrive, MAIN_DRIVE } from './contracts';

/** Steps the main drive in phase 2 of each tick. */
export class PropulsionPhysics implements IShipSystem {
  static deps = [MAIN_DRIVE] as const;

  /** The graph reads the phase without building the class. */
  static readonly phase: Phase = 2;

  readonly name = 'Propulsion';
  readonly phase = PropulsionPhysics.phase;

  constructor(private readonly drive: IMainDrive) {}

  /**
   * The drive burns with the power the router allocated the main-drive load
   * in phase 1, 0 W when shed. It pushes along the helm's attitude in
   * `start`, the snapshot before any system stepped, so the order of the two
   * phase-2 systems changes no figure. At rest with no thrust, the ship comes
   * back as it went in.
   */
  step(ship: ShipSnapshot, { dt, start }: TickContext): ShipSnapshot {
    const load = ship.power.loads.find(({ id }) => id === MAIN_DRIVE_LOAD.id);
    const drive = stepDrive(
      ship.drive,
      {
        power: load?.allocated ?? 0,
        attitude: start.helm.attitude,
        course: ship.setpoints.helm.heading,
        dt,
      },
      this.drive.rating,
      HULL,
    );
    return drive === ship.drive ? ship : Object.freeze({ ...ship, drive });
  }
}
