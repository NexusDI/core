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
import { HELM, HELM_ACTIONS, type IHelm } from './contracts';

/** Reads the crew's helm commands and hands each to the helm. */
export class HelmCommands implements ICommandHandler {
  static deps = [HELM] as const;

  readonly system = 'helm';

  private readonly refuse = commandRefusal(this.system, HELM_ACTIONS);

  constructor(private readonly helm: IHelm) {}

  handle(command: ShipCommand): QueuedCommand {
    switch (command.action) {
      case 'course':
        return this.helm.course(textArgument(command, 'to', this.refuse));
      case 'burn':
        return this.helm.burn(levelArgument(command, 'level', this.refuse));
      default:
        throw this.refuse(command.action, 'action');
    }
  }
}
