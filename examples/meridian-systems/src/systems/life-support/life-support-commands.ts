import type { PumpMode } from '../../physics/atmosphere';
import {
  commandRefusal,
  flagArgument,
  textArgument,
} from '../../simulation/command-arguments';
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

  private readonly refuse = commandRefusal(this.system, LIFE_SUPPORT_ACTIONS);

  constructor(private readonly control: IAtmosphereControl) {}

  handle(command: ShipCommand): QueuedCommand {
    switch (command.action) {
      case 'online':
        return this.control.online();
      case 'heater': {
        const compartment = textArgument(command, 'compartment', this.refuse);
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
          throw this.refuse(command.action);
        }
        return this.control.heater(compartment, {
          on: on as boolean | undefined,
          target: target as number | undefined,
        });
      }
      case 'scrubber':
        return this.control.scrubber(
          textArgument(command, 'compartment', this.refuse),
          flagArgument(command, 'on', this.refuse),
        );
      case 'oxygen':
        return this.control.oxygen(
          textArgument(command, 'compartment', this.refuse),
          flagArgument(command, 'on', this.refuse),
        );
      case 'vent':
        return this.control.vent(
          textArgument(command, 'compartment', this.refuse),
          flagArgument(command, 'open', this.refuse),
        );
      case 'pump': {
        const compartment = textArgument(command, 'compartment', this.refuse);
        if (!PUMP_MODES.includes(command.mode)) {
          throw this.refuse(command.action);
        }
        return this.control.pump(compartment, command.mode as PumpMode);
      }
      default:
        throw this.refuse(command.action, 'action');
    }
  }
}
