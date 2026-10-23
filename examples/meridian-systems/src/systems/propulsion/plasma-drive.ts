import { type DriveRating, PLASMA_DRIVE } from '../../physics/motion';
import type { QueuedCommand } from '../../simulation/commands';
import { type IShipState, SHIP_STATE } from '../../simulation/contracts';
import type { IMainDrive } from './contracts';

/** The Meridian's plasma drive. It queues its throttle on `SHIP_STATE`. */
export class PlasmaDrive implements IMainDrive {
  static deps = [SHIP_STATE] as const;

  readonly rating: DriveRating = PLASMA_DRIVE;

  constructor(private readonly state: IShipState) {}

  throttle(level: number): QueuedCommand {
    return this.state.queue({ drive: { throttle: level } });
  }
}
