import { defineModule, provide } from '@nexusdi/core';

import deck from '../../deck/meridian.deck.json' with { type: 'json' };
import {
  DECK_PLAN,
  RNG,
  SHIP_STATE,
  SIM_CLOCK,
  SIM_OPTIONS,
} from './contracts';
import { FixedStepClock } from './fixed-step-clock';
import { SeededRandom } from './seeded-random';
import { ShipStateStore } from './ship-state-store';

export const Simulation = defineModule({
  name: 'Simulation',
  global: true,
  options: SIM_OPTIONS,
  providers: [
    provide(SIM_CLOCK, { useClass: FixedStepClock }),
    provide(RNG, { useClass: SeededRandom }),
    provide(SHIP_STATE, { useClass: ShipStateStore }),
    provide(DECK_PLAN, { useValue: deck }),
  ],
  exports: [SIM_OPTIONS, SIM_CLOCK, RNG, SHIP_STATE, DECK_PLAN],
});
