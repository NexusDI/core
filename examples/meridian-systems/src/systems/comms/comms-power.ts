import { COMMS_LOAD, commsDemand } from '../../physics/comms';
import type { PowerLoad } from '../../physics/power';
import type { ShipSnapshot } from '../../simulation/contracts';
import type { IPowerConsumer } from '../engineering/contracts';
import { COMMS_ARRAY, type ICommsArray } from './contracts';

/**
 * The phased array's load on the power router: 5 MW at priority 3 on each
 * tick a hail waits on a linked array with no reply outstanding, read from the
 * snapshot at the start of the tick, and 0 W otherwise.
 */
export class CommsPower implements IPowerConsumer {
  static deps = [COMMS_ARRAY] as const;

  constructor(private readonly array: ICommsArray) {}

  draw(ship: ShipSnapshot): PowerLoad {
    return {
      ...COMMS_LOAD,
      demand: commsDemand(ship.comms, ship.setpoints.comms, this.array.linked),
    };
  }
}
