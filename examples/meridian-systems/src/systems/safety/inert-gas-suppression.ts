import { ownKey } from '../../simulation/command-arguments';
import type { QueuedCommand } from '../../simulation/commands';
import { type IShipState, SHIP_STATE } from '../../simulation/contracts';

import type { IFireSuppression } from './contracts';
import { refuseSafety } from './safety-commands';

/** The setpoint record each action writes. */
const RECORDS = { flood: 'floods', drill: 'drills' } as const;

/** The fire-suppression panel. It queues each setpoint on `SHIP_STATE` for the next tick. */
export class InertGasSuppression implements IFireSuppression {
  static deps = [SHIP_STATE] as const;

  constructor(private readonly state: IShipState) {}

  flood(compartment: string): QueuedCommand {
    return this.queue('flood', compartment);
  }

  drill(compartment: string): QueuedCommand {
    return this.queue('drill', compartment);
  }

  /**
   * The store keys `floods` and `drills` by the rooms with a flood charge,
   * so the check reads an own key, and an inherited name such as
   * `constructor` fails it.
   */
  private queue(
    action: keyof typeof RECORDS,
    compartment: string,
  ): QueuedCommand {
    const record = RECORDS[action];
    const rooms = this.state.snapshot().setpoints.safety[record];
    if (!ownKey(rooms, compartment)) {
      throw refuseSafety(action, { argument: 'compartment' });
    }
    return this.state.queue({
      safety: { [record]: { [compartment]: true } },
    });
  }
}
