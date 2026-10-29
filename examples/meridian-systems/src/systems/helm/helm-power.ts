import type { ShipSnapshot } from '../../simulation/contracts';
import type { IPowerConsumer, PowerLoad } from '../engineering/contracts';
import { HULL } from '../../physics/constants';

import { type IThrusters, THRUSTERS } from './contracts';
import { THRUSTERS_LOAD, thrustersDemand } from './helm-model';

/**
 * The thrusters' load on the power router at priority 4: 20 MW at full
 * torque, scaled by the torque the PD law asks of the helm at the start of
 * the tick, and 0 W once the helm settles.
 */
export class HelmPower implements IPowerConsumer {
  static deps = [THRUSTERS] as const;

  readonly id = THRUSTERS_LOAD.id;

  constructor(private readonly thrusters: IThrusters) {}

  draw(ship: ShipSnapshot): PowerLoad {
    return {
      ...THRUSTERS_LOAD,
      demand: thrustersDemand(
        ship.helm,
        ship.setpoints.helm,
        this.thrusters.rating,
        HULL,
      ),
    };
  }
}
