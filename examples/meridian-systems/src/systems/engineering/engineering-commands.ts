import {
  commandRefusal,
  flagArgument,
  levelArgument,
} from '../../simulation/command-arguments';
import type {
  ICommandHandler,
  QueuedCommand,
  ShipCommand,
} from '../../simulation/commands';
import {
  type IReactorCore,
  type IShieldGrid,
  REACTOR,
  SHIELD_GRID,
} from './contracts';

/**
 * The actions engineering takes and their ranges, in words. shipText reads
 * it after "It takes".
 */
export const ENGINEERING_ACTIONS =
  'throttle with a level from 0 to 1 and shields with raised true or false';

/** Reads the crew's engineering commands and hands each to the reactor or the shield grid. */
export class EngineeringCommands implements ICommandHandler {
  static deps = [REACTOR, SHIELD_GRID] as const;

  readonly system = 'engineering';

  private readonly refuse = commandRefusal(this.system, ENGINEERING_ACTIONS);

  constructor(
    private readonly reactor: IReactorCore,
    private readonly shields: IShieldGrid,
  ) {}

  handle(command: ShipCommand): QueuedCommand {
    switch (command.action) {
      case 'throttle':
        return this.reactor.throttle(
          levelArgument(command, 'level', this.refuse),
        );
      case 'shields':
        return flagArgument(command, 'raised', this.refuse)
          ? this.shields.raise()
          : this.shields.lower();
      default:
        throw this.refuse(command.action, 'action');
    }
  }
}
