import { lazy } from '@nexusdi/core';

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
  FTL_ACTIONS,
  FTL_DRIVE,
  FTL_SYSTEM,
  type IFtlDrive,
} from './contracts';

/** The `BadCommandError` the FTL drive throws for an action or an argument it cannot read. */
export const refuseFtl = commandRefusal(FTL_SYSTEM, FTL_ACTIONS);

/**
 * Reads the crew's FTL commands and hands each to the drive. It reads the
 * drive through `lazy()`, since the drive reads this handler to register it
 * with the desk.
 */
export class FtlCommands implements ICommandHandler {
  static deps = [lazy(FTL_DRIVE)] as const;

  readonly system = FTL_SYSTEM;

  constructor(private readonly drive: () => IFtlDrive) {}

  handle(command: ShipCommand): QueuedCommand {
    switch (command.action) {
      case 'spool':
        return this.drive().spool();
      case 'jump':
        return this.drive().jump(textArgument(command, 'to', refuseFtl));
      default:
        throw refuseFtl(command.action, 'action');
    }
  }
}
