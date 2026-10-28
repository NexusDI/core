import type {
  IShipSystem,
  Phase,
  ShipSnapshot,
  TickContext,
} from '../../simulation/contracts';
import { LITHIUM_LOOP, pulseCoolant } from '../engineering/engineering-model';

import type { FtlRating } from './contracts';
import { FTL_SPOOL_LOAD, stepFtl } from './ftl-model';

/**
 * Steps the FTL drive in phase 3 of each tick. `JumpDrive` builds
 * it with its rating and attaches it to the loop.
 */
export class FtlPhysics implements IShipSystem {
  /** The graph reads the phase without building the class. */
  static readonly phase: Phase = 3;

  readonly name = 'FtlDrive';
  readonly phase = FtlPhysics.phase;

  constructor(private readonly rating: FtlRating) {}

  /**
   * The spool charges with the power the router allocated the ftl-spool load
   * in phase 1. A jump writes the record and the disarmed setpoints, and its
   * pulse enters the loop here, with the heat capacity of `LITHIUM_LOOP`. On
   * a tick that changes nothing, the ship comes back as it went in.
   */
  step(ship: ShipSnapshot, { tick, dt }: TickContext): ShipSnapshot {
    const load = ship.power.loads.find(({ id }) => id === FTL_SPOOL_LOAD.id);
    const next = stepFtl(
      ship.ftl,
      ship.setpoints.ftl,
      { tick, dt, allocated: load?.allocated ?? 0 },
      this.rating,
    );
    if (next.ftl === ship.ftl && next.setpoints === ship.setpoints.ftl) {
      return ship;
    }
    return Object.freeze({
      ...ship,
      ftl: next.ftl,
      coolant:
        next.pulse === 0
          ? ship.coolant
          : pulseCoolant(ship.coolant, next.pulse, LITHIUM_LOOP),
      setpoints:
        next.setpoints === ship.setpoints.ftl
          ? ship.setpoints
          : Object.freeze({ ...ship.setpoints, ftl: next.setpoints }),
    });
  }
}
