import type { CallContext, Interceptor, Next } from '@nexusdi/interceptors';

import { InterlockError } from '../../errors';
import { doorPressures, PRESSURE_INTERLOCK } from '../../physics/doors';
import {
  DECK_PLAN,
  type DeckPlan,
  type IShipState,
  SHIP_STATE,
} from '../../simulation/contracts';

/**
 * Refuses to open a door with more than `PRESSURE_INTERLOCK.limit` Pa
 * across it. It reads the true pressures of the committed snapshot, so its
 * answer never depends on the RNG. An app binds it to `open` on
 * `BLAST_DOORS` through `@nexusdi/interceptors`, which the library's main
 * entry never imports.
 */
export class PressureInterlock implements Interceptor {
  static deps = [SHIP_STATE, DECK_PLAN] as const;

  constructor(
    private readonly state: IShipState,
    private readonly deck: DeckPlan,
  ) {}

  intercept(call: CallContext, next: Next): unknown {
    const [door] = call.args;
    const plan = this.deck.doors.find((entry) => entry.id === door);
    // BlastDoorControl refuses a door the deck lacks.
    if (plan === undefined) return next();
    const [a, b] = doorPressures(
      this.state.snapshot().compartments,
      this.deck.compartments,
      plan,
    );
    const difference = Math.round(Math.abs(a - b));
    if (difference > PRESSURE_INTERLOCK.limit) {
      throw new InterlockError({
        door: plan.id,
        difference,
        limit: PRESSURE_INTERLOCK.limit,
      });
    }
    return next();
  }
}
