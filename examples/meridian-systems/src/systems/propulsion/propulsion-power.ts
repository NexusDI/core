import { driveDemand, MAIN_DRIVE_LOAD } from '../../physics/motion';
import type { PowerLoad } from '../../physics/power';
import type { ShipSnapshot } from '../../simulation/contracts';
import type { IPowerConsumer } from '../engineering/contracts';

import { type IMainDrive, MAIN_DRIVE } from './contracts';

/**
 * The main drive's load on the power router: the throttle times the drive's
 * 600 MW at priority 5, read from the snapshot at the start of the tick.
 */
export class PropulsionPower implements IPowerConsumer {
  static deps = [MAIN_DRIVE] as const;

  constructor(private readonly drive: IMainDrive) {}

  draw(ship: ShipSnapshot): PowerLoad {
    return {
      ...MAIN_DRIVE_LOAD,
      demand: driveDemand(ship.setpoints.drive, this.drive.rating),
    };
  }
}
