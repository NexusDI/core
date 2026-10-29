import type { ShipSnapshot } from '../../simulation/contracts';
import type { IPowerConsumer, PowerLoad } from '../engineering/contracts';

import type { FtlRating } from './contracts';
import { FTL_SPOOL, FTL_SPOOL_LOAD, ftlDemand } from './ftl-model';

/**
 * The spool's load on the power router: the rating's power at priority 7
 * while the drive is armed and ready below a full charge, read from the
 * snapshot at the start of the tick. It reads the Meridian's spool rating
 * unless a test passes another, and `JumpDrive` registers it with the
 * router.
 */
export class FtlPower implements IPowerConsumer {
  readonly id = FTL_SPOOL_LOAD.id;

  constructor(private readonly rating: FtlRating = FTL_SPOOL) {}

  /** A ship that holds no FTL record asks 0 W. */
  draw(ship: ShipSnapshot): PowerLoad {
    const { ftl } = ship;
    const setpoints = ship.setpoints.ftl;
    const demand =
      ftl === undefined || setpoints === undefined
        ? 0
        : ftlDemand(ftl, setpoints, ship.reactor, ship.coolant, this.rating);
    return { ...FTL_SPOOL_LOAD, demand };
  }
}
