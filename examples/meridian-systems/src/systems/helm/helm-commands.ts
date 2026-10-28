import {
  commandRefusal,
  levelArgument,
  textArgument,
} from '../../simulation/command-arguments';
import type {
  ICommandHandler,
  QueuedCommand,
  ShipCommand,
} from '../../simulation/commands';

import { HELM, HELM_ACTIONS, HELM_SYSTEM, type IHelm } from './contracts';

/** The `BadCommandError` the helm throws for an action or an argument it cannot read. */
export const refuseHelm = commandRefusal(HELM_SYSTEM, HELM_ACTIONS);

/** Reads the crew's helm commands and hands each to the helm. */
export class HelmCommands implements ICommandHandler {
  static deps = [HELM] as const;

  readonly system = HELM_SYSTEM;

  constructor(private readonly helm: IHelm) {}

  handle(command: ShipCommand): QueuedCommand {
    switch (command.action) {
      case 'course':
        return this.helm.course(textArgument(command, 'to', refuseHelm));
      case 'burn':
        return this.helm.burn(levelArgument(command, 'level', refuseHelm));
      default:
        throw refuseHelm(command.action, 'action');
    }
  }
}
