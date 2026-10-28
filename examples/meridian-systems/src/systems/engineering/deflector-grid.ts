import type { QueuedCommand } from '../../simulation/commands';
import {
  type IShipState,
  SHIP_STATE,
  type ShipSnapshot,
} from '../../simulation/contracts';

import {
  type IPowerRouter,
  type IShieldGrid,
  POWER_ROUTER,
  type PowerLoad,
} from './contracts';
import { DEFLECTOR_GRID } from './engineering-model';

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

/** The grid's load, which asks for its whole rating while raised and 0 W while lowered. */
function load(raised: boolean): PowerLoad {
  return raised ? DEFLECTOR_GRID : { ...DEFLECTOR_GRID, demand: 0 };
}
