import type { ShipSnapshot } from '../../simulation/contracts';
import type { IPowerConsumer, PowerLoad } from '../engineering/contracts';

import type { FtlRating } from './contracts';
import { FTL_SPOOL_LOAD, ftlDemand } from './ftl-model';

/**
 * The spool's load on the power router: the rating's power at priority 7
 * while the drive is armed and ready below a full charge, read from the
 * snapshot at the start of the tick. `JumpDrive` builds it with its rating.
 */
export class FtlPower implements IPowerConsumer {
  constructor(private readonly rating: FtlRating) {}

  draw(ship: ShipSnapshot): PowerLoad {
    return {
      ...FTL_SPOOL_LOAD,
      demand: ftlDemand(
        ship.ftl,
        ship.setpoints.ftl,
        ship.reactor,
        ship.coolant,
        this.rating,
      ),
    };
  }
}
