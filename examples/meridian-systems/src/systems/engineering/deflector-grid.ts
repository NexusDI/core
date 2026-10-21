import type { PowerLoad } from '../../physics/power';
import type { QueuedCommand } from '../../simulation/commands';
import {
  type IShipState,
  SHIP_STATE,
  type ShipSnapshot,
} from '../../simulation/contracts';
import { type IPowerRouter, type IShieldGrid, POWER_ROUTER } from './contracts';

/** The power the raised grid draws, in W (spec §5.7). */
const RAISED_DEMAND = 200e6;

/** The Meridian's deflector shields, a load of priority 2 on the power router. */
export class DeflectorGrid implements IShieldGrid {
  static deps = [SHIP_STATE, POWER_ROUTER] as const;

  constructor(
    private readonly state: IShipState,
    private readonly router: IPowerRouter,
  ) {}

  draw(ship: ShipSnapshot): PowerLoad {
    return load(ship.setpoints.shields.raised);
  }

  /** Throws `PowerBudgetError` and queues nothing when the router cannot fit the raised grid. */
  raise(): QueuedCommand {
    this.router.divert(load(true));
    return this.state.queue({ shields: { raised: true } });
  }

  lower(): QueuedCommand {
    return this.state.queue({ shields: { raised: false } });
  }
}

/** The grid's load. A quarter of the power it draws ends in the coolant loop. */
function load(raised: boolean): PowerLoad {
  return {
    id: 'shields',
    priority: 2,
    demand: raised ? RAISED_DEMAND : 0,
    heatShare: 0.25,
  };
}
