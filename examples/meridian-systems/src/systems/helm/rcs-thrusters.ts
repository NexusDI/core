import { RCS_THRUSTERS, type ThrusterRating, wrap } from '../../physics/motion';
import type { QueuedCommand } from '../../simulation/commands';
import { type IShipState, SHIP_STATE } from '../../simulation/contracts';

import type { IThrusters } from './contracts';

/** The Meridian's reaction control thrusters. They queue the course on `SHIP_STATE`. */
export class RcsThrusters implements IThrusters {
  static deps = [SHIP_STATE] as const;

  readonly rating: ThrusterRating = RCS_THRUSTERS;

  constructor(private readonly state: IShipState) {}

  steer(heading: number): QueuedCommand {
    if (!Number.isFinite(heading)) {
      throw new RangeError(
        `steer() takes a finite heading in rad, and got ${heading}.`,
      );
    }
    return this.state.queue({ helm: { heading: wrap(heading) } });
  }
}
