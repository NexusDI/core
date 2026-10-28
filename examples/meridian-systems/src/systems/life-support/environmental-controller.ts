import type { PumpMode } from '../../physics/atmosphere';
import { ownKey } from '../../simulation/command-arguments';
import type { QueuedCommand, SetpointChange } from '../../simulation/commands';
import {
  type CompartmentId,
  type IShipState,
  SHIP_STATE,
} from '../../simulation/contracts';

import type { IAtmosphereControl } from './contracts';
import { refuseLifeSupport } from './life-support-commands';

type LifeSupportChange = NonNullable<SetpointChange['lifeSupport']>;

/** The device setpoint records that `IAtmosphereControl` writes, by action name. */
const RECORDS = {
  heater: 'heaters',
  scrubber: 'scrubbers',
  oxygen: 'oxygen',
  vent: 'vents',
  pump: 'pumps',
} as const;

type DeviceAction = keyof typeof RECORDS;

/** The life-support panel. It queues each setpoint on `SHIP_STATE` for the next tick. */
export class EnvironmentalController implements IAtmosphereControl {
  static deps = [SHIP_STATE] as const;

  constructor(private readonly state: IShipState) {}

  online(): QueuedCommand {
    return this.queue({ online: true });
  }

  offline(): QueuedCommand {
    return this.queue({ online: false });
  }

  heater(
    compartment: string,
    setting: { readonly on?: boolean; readonly target?: number },
  ): QueuedCommand {
    const id = this.device('heater', compartment);
    return this.queue({
      heaters: { [id]: { on: setting.on, target: setting.target } },
    });
  }

  scrubber(compartment: string, on: boolean): QueuedCommand {
    return this.queue({
      scrubbers: { [this.device('scrubber', compartment)]: on },
    });
  }

  oxygen(compartment: string, on: boolean): QueuedCommand {
    return this.queue({ oxygen: { [this.device('oxygen', compartment)]: on } });
  }

  vent(compartment: string, open: boolean): QueuedCommand {
    return this.queue({ vents: { [this.device('vent', compartment)]: open } });
  }

  pump(compartment: string, mode: PumpMode): QueuedCommand {
    return this.queue({ pumps: { [this.device('pump', compartment)]: mode } });
  }

  private queue(change: LifeSupportChange): QueuedCommand {
    return this.state.queue({ lifeSupport: change });
  }

  /**
   * `compartment` when the deck gives it the device of `action`. The store
   * keys each device record by the rooms that carry it, so `device` checks
   * for an own key, and an inherited name such as `constructor` fails that
   * check.
   */
  private device(action: DeviceAction, compartment: string): CompartmentId {
    const record = this.state.snapshot().setpoints.lifeSupport[RECORDS[action]];
    if (!ownKey(record, compartment)) {
      throw refuseLifeSupport(action, { argument: 'compartment' });
    }
    return compartment;
  }
}
