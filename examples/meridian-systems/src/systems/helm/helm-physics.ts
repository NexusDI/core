import type {
  IShipSystem,
  Phase,
  ShipSnapshot,
  TickContext,
} from '../../simulation/contracts';
import { HULL } from '../../physics/constants';

import { type IThrusters, THRUSTERS } from './contracts';
import { stepHelm, THRUSTERS_LOAD } from './helm-model';

/** Steps the helm in phase 2 of each tick. */
export class HelmPhysics implements IShipSystem {
  static deps = [THRUSTERS] as const;

  /** The graph reads the phase without building the class. */
  static readonly phase: Phase = 2;

  readonly name = 'Helm';
  readonly phase = HelmPhysics.phase;

  constructor(private readonly thrusters: IThrusters) {}

  /**
   * The helm turns with no torque on a tick the router shed the thrusters
   * in phase 1. When the step changes no field, the ship comes back as it
   * went in.
   */
  step(ship: ShipSnapshot, { dt }: TickContext): ShipSnapshot {
    const helm = stepHelm(
      ship.helm,
      ship.setpoints.helm,
      { dt, shed: ship.power.shed.includes(THRUSTERS_LOAD.id) },
      this.thrusters.rating,
      HULL,
    );
    return helm === ship.helm ? ship : Object.freeze({ ...ship, helm });
  }
}
