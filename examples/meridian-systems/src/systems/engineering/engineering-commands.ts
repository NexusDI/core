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
  ENGINEERING_ACTIONS,
  ENGINEERING_SYSTEM,
  type IReactorCore,
  type IShieldGrid,
  REACTOR,
  SHIELD_GRID,
} from './contracts';

/** The `BadCommandError` engineering throws for an action or an argument it cannot read. */
export const refuseEngineering = commandRefusal(
  ENGINEERING_SYSTEM,
  ENGINEERING_ACTIONS,
);

/** Reads the crew's engineering commands and hands each to the reactor or the shield grid. */
export class EngineeringCommands implements ICommandHandler {
  static deps = [REACTOR, SHIELD_GRID] as const;

  readonly system = ENGINEERING_SYSTEM;

  constructor(
    private readonly reactor: IReactorCore,
    private readonly shields: IShieldGrid,
  ) {}

  handle(command: ShipCommand): QueuedCommand {
    switch (command.action) {
      case 'throttle':
        return this.reactor.throttle(
          levelArgument(command, 'level', refuseEngineering),
        );
      case 'shields':
        return flagArgument(command, 'raised', refuseEngineering)
          ? this.shields.raise()
          : this.shields.lower();
      default:
        throw refuseEngineering(command.action, 'action');
    }
  }
}
