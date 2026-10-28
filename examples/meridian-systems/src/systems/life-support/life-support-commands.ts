import {
  choiceArgument,
  commandRefusal,
  flagArgument,
  optionalFlagArgument,
  optionalNumberArgument,
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
  LIFE_SUPPORT_SYSTEM,
  type PumpMode,
} from './contracts';

/** The thermostat targets a heater command accepts, in K. */
const TARGET = { min: 283, max: 303 } as const;

const PUMP_MODES = [
  'off',
  'evacuate',
  'fill',
] as const satisfies readonly PumpMode[];

/** The `BadCommandError` life support throws for an action or an argument it cannot read. */
export const refuseLifeSupport = commandRefusal(
  LIFE_SUPPORT_SYSTEM,
  LIFE_SUPPORT_ACTIONS,
);

/** Reads the crew's life-support commands and hands each to the panel. */
export class LifeSupportCommands implements ICommandHandler {
  static deps = [ATMOSPHERE_CONTROL] as const;

  readonly system = LIFE_SUPPORT_SYSTEM;

  constructor(private readonly control: IAtmosphereControl) {}

  handle(command: ShipCommand): QueuedCommand {
    switch (command.action) {
      case 'online':
        return this.control.online();
      case 'offline':
        return this.control.offline();
      case 'heater': {
        const compartment = textArgument(
          command,
          'compartment',
          refuseLifeSupport,
        );
        const on = optionalFlagArgument(command, 'on', refuseLifeSupport);
        const target = optionalNumberArgument(
          command,
          'target',
          TARGET.min,
          TARGET.max,
          refuseLifeSupport,
        );
        if (on === undefined && target === undefined) {
          throw refuseLifeSupport(command.action, {
            argument: 'on or target',
            missing: true,
          });
        }
        return this.control.heater(compartment, { on, target });
      }
      case 'scrubber':
        return this.control.scrubber(
          textArgument(command, 'compartment', refuseLifeSupport),
          flagArgument(command, 'on', refuseLifeSupport),
        );
      case 'oxygen':
        return this.control.oxygen(
          textArgument(command, 'compartment', refuseLifeSupport),
          flagArgument(command, 'on', refuseLifeSupport),
        );
      case 'vent':
        return this.control.vent(
          textArgument(command, 'compartment', refuseLifeSupport),
          flagArgument(command, 'open', refuseLifeSupport),
        );
      case 'pump':
        return this.control.pump(
          textArgument(command, 'compartment', refuseLifeSupport),
          choiceArgument(command, 'mode', PUMP_MODES, refuseLifeSupport),
        );
      default:
        throw refuseLifeSupport(command.action, 'action');
    }
  }
}
