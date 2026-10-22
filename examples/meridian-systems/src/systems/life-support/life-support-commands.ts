import { BadCommandError } from '../../errors';
import type { PumpMode } from '../../physics/atmosphere';
import type {
  ICommandHandler,
  QueuedCommand,
  ShipCommand,
} from '../../simulation/commands';
import {
  ATMOSPHERE_CONTROL,
  type IAtmosphereControl,
  LIFE_SUPPORT_ACTIONS,
} from './contracts';

/** The thermostat targets a heater command accepts, in K. */
const TARGET = { min: 283, max: 303 } as const;

const PUMP_MODES: readonly unknown[] = [
  'off',
  'evacuate',
  'fill',
] satisfies readonly PumpMode[];

/** Reads the crew's life-support commands and hands each to the panel. */
export class LifeSupportCommands implements ICommandHandler {
  static deps = [ATMOSPHERE_CONTROL] as const;

  readonly system = 'life-support';

  constructor(private readonly control: IAtmosphereControl) {}

  handle(command: ShipCommand): QueuedCommand {
    switch (command.action) {
      case 'online':
        return this.control.online();
      case 'heater': {
        const compartment = this.compartment(command);
        const { on, target } = command;
        const goodOn = on === undefined || typeof on === 'boolean';
        const goodTarget =
          target === undefined ||
          (typeof target === 'number' &&
            target >= TARGET.min &&
            target <= TARGET.max);
        if (
          !goodOn ||
          !goodTarget ||
          (on === undefined && target === undefined)
        ) {
          throw this.refuse(command, 'argument');
        }
        return this.control.heater(compartment, {
          on: on as boolean | undefined,
          target: target as number | undefined,
        });
      }
      case 'scrubber':
        return this.control.scrubber(
          this.compartment(command),
          this.flag(command, 'on'),
        );
      case 'oxygen':
        return this.control.oxygen(
          this.compartment(command),
          this.flag(command, 'on'),
        );
      case 'vent':
        return this.control.vent(
          this.compartment(command),
          this.flag(command, 'open'),
        );
      case 'pump': {
        const compartment = this.compartment(command);
        if (!PUMP_MODES.includes(command.mode)) {
          throw this.refuse(command, 'argument');
        }
        return this.control.pump(compartment, command.mode as PumpMode);
      }
      default:
        throw this.refuse(command, 'action');
    }
  }

  private compartment(command: ShipCommand): string {
    const { compartment } = command;
    if (typeof compartment !== 'string') throw this.refuse(command, 'argument');
    return compartment;
  }

  private flag(command: ShipCommand, name: 'on' | 'open'): boolean {
    const value = command[name];
    if (typeof value !== 'boolean') throw this.refuse(command, 'argument');
    return value;
  }

  private refuse(
    command: ShipCommand,
    reason: 'action' | 'argument',
  ): BadCommandError {
    return new BadCommandError({
      reason,
      system: this.system,
      action: command.action,
      expected: LIFE_SUPPORT_ACTIONS,
    });
  }
}
