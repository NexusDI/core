import { BadCommandError } from '../../errors';
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
const EXPECTED =
  'throttle with a level from 0 to 1 and shields with raised true or false';

/** Reads the crew's engineering commands and hands each to the reactor or the shield grid. */
export class EngineeringCommands implements ICommandHandler {
  static deps = [REACTOR, SHIELD_GRID] as const;

  readonly system = 'engineering';

  constructor(
    private readonly reactor: IReactorCore,
    private readonly shields: IShieldGrid,
  ) {}

  handle(command: ShipCommand): QueuedCommand {
    switch (command.action) {
      case 'throttle': {
        const { level } = command;
        if (typeof level !== 'number' || !(level >= 0 && level <= 1)) {
          throw this.refuse(command, 'argument');
        }
        return this.reactor.throttle(level);
      }
      case 'shields': {
        const { raised } = command;
        if (typeof raised !== 'boolean') throw this.refuse(command, 'argument');
        return raised ? this.shields.raise() : this.shields.lower();
      }
      default:
        throw this.refuse(command, 'action');
    }
  }

  private refuse(
    command: ShipCommand,
    reason: 'action' | 'argument',
  ): BadCommandError {
    return new BadCommandError({
      reason,
      system: this.system,
      action: command.action,
      expected: EXPECTED,
    });
  }
}
