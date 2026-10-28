import {
  commandRefusal,
  textArgument,
} from '../../simulation/command-arguments';
import type {
  ICommandHandler,
  QueuedCommand,
  ShipCommand,
} from '../../simulation/commands';

import {
  BLAST_DOORS,
  FIRE_SUPPRESSION,
  type IBlastDoors,
  type IFireSuppression,
  SAFETY_ACTIONS,
  SAFETY_SYSTEM,
} from './contracts';

/** The `BadCommandError` safety throws for an action or an argument it cannot read. */
export const refuseSafety = commandRefusal(SAFETY_SYSTEM, SAFETY_ACTIONS);

/**
 * Reads the crew's safety commands and hands each to its panel. A command
 * reaches a panel with a string argument alone, so an interceptor on a
 * panel reads a string.
 */
export class SafetyCommands implements ICommandHandler {
  static deps = [BLAST_DOORS, FIRE_SUPPRESSION] as const;

  readonly system = SAFETY_SYSTEM;

  constructor(
    private readonly doors: IBlastDoors,
    private readonly suppression: IFireSuppression,
  ) {}

  handle(command: ShipCommand): QueuedCommand {
    switch (command.action) {
      case 'open':
        return this.doors.open(textArgument(command, 'door', refuseSafety));
      case 'close':
        return this.doors.close(textArgument(command, 'door', refuseSafety));
      case 'flood':
        return this.suppression.flood(
          textArgument(command, 'compartment', refuseSafety),
        );
      case 'drill':
        return this.suppression.drill(
          textArgument(command, 'compartment', refuseSafety),
        );
      default:
        throw refuseSafety(command.action, 'action');
    }
  }
}
