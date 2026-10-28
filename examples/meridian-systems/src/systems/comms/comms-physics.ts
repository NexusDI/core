import { COMMS_LOAD, stepComms } from '../../physics/comms';
import type {
  IShipSystem,
  Phase,
  ShipSnapshot,
  TickContext,
} from '../../simulation/contracts';
import { COMMS_ARRAY, type ICommsArray } from './contracts';

/** Steps the phased array in phase 6 of each tick. */
export class CommsPhysics implements IShipSystem {
  static deps = [COMMS_ARRAY] as const;

  /** The graph reads the phase without building the class. */
  static readonly phase: Phase = 6;

  readonly name = 'Comms';
  readonly phase = CommsPhysics.phase;

  constructor(private readonly array: ICommsArray) {}

  /**
   * `stepComms` judges a queued hail on the link and on the comms load the
   * router shed in phase 1. With no hail and no reply due, the ship comes
   * back as it went in.
   */
  step(ship: ShipSnapshot, { tick, dt }: TickContext): ShipSnapshot {
    const result = stepComms(ship.comms, ship.setpoints.comms, {
      tick,
      dt,
      linked: this.array.linked,
      shed: ship.power.shed.includes(COMMS_LOAD.id),
    });
    if (
      result.record === ship.comms &&
      result.setpoints === ship.setpoints.comms
    ) {
      return ship;
    }
    return Object.freeze({
      ...ship,
      comms: result.record,
      setpoints: Object.freeze({ ...ship.setpoints, comms: result.setpoints }),
    });
  }
}
