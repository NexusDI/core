import type { QueuedCommand } from '../../simulation/commands';
import {
  type DoorId,
  type IShipState,
  SHIP_STATE,
} from '../../simulation/contracts';
import { type IBlastDoors, refuseSafety } from './contracts';

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
    if (!Object.hasOwn(doors, door)) throw refuseSafety(action);
    // The record's keys are the deck's ids, so an own key is a DoorId.
    return this.state.queue({ safety: { doors: { [door as DoorId]: open } } });
  }
}
