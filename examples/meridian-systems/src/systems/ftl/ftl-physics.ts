import type {
  IShipSystem,
  Phase,
  ShipSnapshot,
  TickContext,
} from '../../simulation/contracts';
import { LITHIUM_LOOP, pulseCoolant } from '../engineering/engineering-model';

import type { FtlRating } from './contracts';
import { FTL_SPOOL, FTL_SPOOL_LOAD, stepFtl } from './ftl-model';

/**
 * Steps the FTL drive in phase 3 of each tick, at the Meridian's spool
 * rating unless a test passes another. `JumpDrive` registers it with the
 * loop.
 */
export class FtlPhysics implements IShipSystem {
  /** The graph reads the phase without building the class. */
  static readonly phase: Phase = 3;

  readonly name = 'FtlDrive';
  readonly phase = FtlPhysics.phase;

  constructor(private readonly rating: FtlRating = FTL_SPOOL) {}

  /**
   * The spool charges with the power the router allocated the ftl-spool load
   * in phase 1. A jump writes the record and the disarmed setpoints, and its
   * pulse enters the loop here, with the heat capacity of `LITHIUM_LOOP`. On
   * a tick that changes nothing, or a ship that holds no FTL record, comes
   * back as it went in.
   */
  step(ship: ShipSnapshot, { tick, dt }: TickContext): ShipSnapshot {
    const { ftl } = ship;
    const setpoints = ship.setpoints.ftl;
    if (ftl === undefined || setpoints === undefined) return ship;
    const load = ship.power.loads.find(({ id }) => id === FTL_SPOOL_LOAD.id);
    const next = stepFtl(
      ftl,
      setpoints,
      { tick, dt, allocated: load?.allocated ?? 0 },
      this.rating,
    );
    if (next.ftl === ftl && next.setpoints === setpoints) return ship;
    return Object.freeze({
      ...ship,
      ftl: next.ftl,
      coolant:
        next.pulse === 0
          ? ship.coolant
          : pulseCoolant(ship.coolant, next.pulse, LITHIUM_LOOP),
      setpoints:
        next.setpoints === setpoints
          ? ship.setpoints
          : Object.freeze({ ...ship.setpoints, ftl: next.setpoints }),
    });
  }
}
