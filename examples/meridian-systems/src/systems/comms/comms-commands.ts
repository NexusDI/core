import { commandRefusal } from '../../simulation/command-arguments';
import type {
  ICommandHandler,
  QueuedCommand,
  ShipCommand,
} from '../../simulation/commands';
import { COMMS_ACTIONS, COMMS_ARRAY, type ICommsArray } from './contracts';

/** Reads the crew's comms commands and hands each to the array. */
export class CommsCommands implements ICommandHandler {
  static deps = [COMMS_ARRAY] as const;

  readonly system = 'comms';

  private readonly refuse = commandRefusal(this.system, COMMS_ACTIONS);

  constructor(private readonly array: ICommsArray) {}

  /** A hail takes no argument, so the handler ignores every other field. */
  handle(command: ShipCommand): QueuedCommand {
    if (command.action !== 'hail') throw this.refuse(command.action, 'action');
    return this.array.hail();
  }
}
