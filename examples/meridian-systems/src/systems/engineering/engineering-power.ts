import type { ShipSnapshot } from '../../simulation/contracts';

import {
  type IPowerConsumer,
  type IShieldGrid,
  type PowerLoad,
  SHIELD_GRID,
} from './contracts';

/**
 * The shield grid's load on the power router, from the grid's own `draw`. The
 * router reads this consumer through `POWER_CONSUMERS`, so the router depends
 * on the grid through this class and the grid reads the router through a
 * thunk.
 */
export class ShieldPower implements IPowerConsumer {
  static deps = [SHIELD_GRID] as const;

  constructor(private readonly grid: IShieldGrid) {}

  draw(ship: ShipSnapshot): PowerLoad {
    return this.grid.draw(ship);
  }
}
