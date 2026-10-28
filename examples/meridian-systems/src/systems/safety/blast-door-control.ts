import { ownKey } from '../../simulation/command-arguments';
import type { QueuedCommand } from '../../simulation/commands';
import { type IShipState, SHIP_STATE } from '../../simulation/contracts';

import type { IBlastDoors } from './contracts';
import { refuseSafety } from './safety-commands';

/** The blast-door panel. It queues each door's setpoint on `SHIP_STATE` for the next tick. */
export class BlastDoorControl implements IBlastDoors {
  static deps = [SHIP_STATE] as const;

  constructor(private readonly state: IShipState) {}

  open(door: string): QueuedCommand {
    return this.queue('open', door, true);
  }

  close(door: string): QueuedCommand {
    return this.queue('close', door, false);
  }

  /**
   * The store keys the door record by the deck's doors, so the check reads
   * an own key, and an inherited name such as `constructor` fails it.
   */
  private queue(
    action: 'open' | 'close',
    door: string,
    open: boolean,
  ): QueuedCommand {
    const doors = this.state.snapshot().setpoints.safety.doors;
    if (!ownKey(doors, door)) {
      throw refuseSafety(action, { argument: 'door' });
    }
    return this.state.queue({ safety: { doors: { [door]: open } } });
  }
}
