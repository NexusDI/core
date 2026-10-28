import {
  commandRefusal,
  numberArgument,
} from '../../simulation/command-arguments';
import type {
  ICommandHandler,
  QueuedCommand,
  ShipCommand,
} from '../../simulation/commands';

import {
  type IWeaponMount,
  WEAPON_MOUNT,
  WEAPONS_ACTIONS,
  WEAPONS_SYSTEM,
} from './contracts';

/** The `BadCommandError` weapons throws for an action or an argument it cannot read. */
export const refuseWeapons = commandRefusal(WEAPONS_SYSTEM, WEAPONS_ACTIONS);

/** Reads the crew's weapons commands and hands each fire to the mount. */
export class WeaponsCommands implements ICommandHandler {
  static deps = [WEAPON_MOUNT] as const;

  readonly system = WEAPONS_SYSTEM;

  constructor(private readonly mount: IWeaponMount) {}

  handle(command: ShipCommand): QueuedCommand {
    if (command.action !== 'fire') {
      throw refuseWeapons(command.action, 'action');
    }
    return this.mount.fire(
      numberArgument(
        command,
        'range',
        0,
        this.mount.rating.range,
        refuseWeapons,
      ),
    );
  }
}
