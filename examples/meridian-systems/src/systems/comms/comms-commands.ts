import { commandRefusal } from '../../simulation/command-arguments';
import type {
  ICommandHandler,
  QueuedCommand,
  ShipCommand,
} from '../../simulation/commands';

import {
  COMMS_ACTIONS,
  COMMS_ARRAY,
  COMMS_SYSTEM,
  type ICommsArray,
} from './contracts';

/** The `BadCommandError` comms throws for an action it does not take. */
export const refuseComms = commandRefusal(COMMS_SYSTEM, COMMS_ACTIONS);

/** Reads the crew's comms commands and hands each to the array. */
export class CommsCommands implements ICommandHandler {
  static deps = [COMMS_ARRAY] as const;

  readonly system = COMMS_SYSTEM;

  constructor(private readonly array: ICommsArray) {}

  /** A hail takes no argument, so the handler ignores every other field. */
  handle(command: ShipCommand): QueuedCommand {
    if (command.action !== 'hail') throw refuseComms(command.action, 'action');
    return this.array.hail();
  }
}
