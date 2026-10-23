import {
  commandRefusal,
  numberArgument,
} from '../../simulation/command-arguments';
import type {
  ICommandHandler,
  QueuedCommand,
  ShipCommand,
} from '../../simulation/commands';
import { type IWeaponMount, WEAPON_MOUNT, WEAPONS_ACTIONS } from './contracts';

/** Reads the crew's weapons commands and hands each fire to the mount. */
export class WeaponsCommands implements ICommandHandler {
  static deps = [WEAPON_MOUNT] as const;

  readonly system = 'weapons';

  private readonly refuse = commandRefusal(this.system, WEAPONS_ACTIONS);

  constructor(private readonly mount: IWeaponMount) {}

  handle(command: ShipCommand): QueuedCommand {
    if (command.action !== 'fire') throw this.refuse(command.action, 'action');
    return this.mount.fire(
      numberArgument(command, 'range', 0, this.mount.rating.range, this.refuse),
    );
  }
}
