import { LIFE_SUPPORT_LOAD, lifeSupportDemand } from '../../physics/atmosphere';
import type { PowerLoad } from '../../physics/power';
import type { IPowerConsumer } from '../engineering/contracts';
import {
  DECK_PLAN,
  type DeckPlan,
  type ShipSnapshot,
} from '../../simulation/contracts';
import { LIFE_SUPPORT_OPTIONS, type LifeSupportOptions } from './contracts';

/**
 * Life support's load on the power router: every device's draw from the air
 * at the start of the tick, at priority 1, and 0 W while offline.
 */
export class LifeSupportPower implements IPowerConsumer {
  static deps = [LIFE_SUPPORT_OPTIONS, DECK_PLAN] as const;

  constructor(
    private readonly options: LifeSupportOptions,
    private readonly deck: DeckPlan,
  ) {}

  draw(ship: ShipSnapshot): PowerLoad {
    return {
      ...LIFE_SUPPORT_LOAD,
      demand: lifeSupportDemand(
        ship.compartments,
        this.deck.compartments,
        ship.setpoints.lifeSupport,
        this.options.ratings,
      ),
    };
  }
}
