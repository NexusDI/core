import { LIFE_SUPPORT_LOAD, stepAtmosphere } from '../../physics/atmosphere';
import {
  DECK_PLAN,
  type DeckPlan,
  type IShipSystem,
  type Phase,
  type ShipSnapshot,
  type TickContext,
} from '../../simulation/contracts';

import { LIFE_SUPPORT_OPTIONS, type LifeSupportOptions } from './contracts';

/** Steps the air of every compartment in phase 4 of each tick. */
export class LifeSupportPhysics implements IShipSystem {
  static deps = [LIFE_SUPPORT_OPTIONS, DECK_PLAN] as const;

  /** The graph reads the phase without building the class. */
  static readonly phase: Phase = 4;

  readonly name = 'LifeSupport';
  readonly phase = LifeSupportPhysics.phase;

  constructor(
    private readonly options: LifeSupportOptions,
    private readonly deck: DeckPlan,
  ) {}

  /**
   * Offline, the ship comes back as it went in. Online, the devices run from
   * this tick's air unless the router shed the life-support load in phase 1.
   * The router priced the load on the air at the start of the tick, and no
   * phase 2 or 3 system changes the compartments, so the devices here
   * draw what the router allocated.
   */
  step(ship: ShipSnapshot, { dt }: TickContext): ShipSnapshot {
    const setpoints = ship.setpoints.lifeSupport;
    if (!setpoints.online) return ship;
    const result = stepAtmosphere({
      compartments: ship.compartments,
      rooms: this.deck.compartments,
      setpoints,
      coolantTemperature: ship.coolant.temperature,
      shed: ship.power.shed.includes(LIFE_SUPPORT_LOAD.id),
      dt,
      ratings: this.options.ratings,
    });
    return Object.freeze({
      ...ship,
      compartments: result.compartments as ShipSnapshot['compartments'],
      lifeSupport: result.lifeSupport,
    });
  }
}
