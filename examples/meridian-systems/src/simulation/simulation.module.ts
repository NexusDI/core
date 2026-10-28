import { defineModule, provide, REQUEST } from '@nexusdi/core';

import deck from '../../deck/meridian.deck.json' with { type: 'json' };

import { compartmentOfRequest } from './compartment-of-request';
import {
  COMPARTMENT,
  DECK_PLAN,
  RNG,
  SHIP_STATE,
  SIM_CLOCK,
  SIM_OPTIONS,
} from './contracts';
import { FixedStepClock } from './fixed-step-clock';
import { SeededRandom } from './seeded-random';
import { SIM_OPTIONS_SCHEMA } from './sim-options-schema';
import { ShipStateStore } from './ship-state-store';

export const Simulation = defineModule({
  name: 'Simulation',
  global: true,
  options: SIM_OPTIONS,
  schema: SIM_OPTIONS_SCHEMA,
  providers: [
    provide(SIM_CLOCK, { useClass: FixedStepClock }),
    provide(RNG, { useClass: SeededRandom }),
    provide(SHIP_STATE, { useClass: ShipStateStore }),
    provide(DECK_PLAN, { useValue: deck }),
    // Sync and scoped: eager: false, so a scope whose request names no
    // compartment opens, and only a get of COMPARTMENT refuses it.
    provide(COMPARTMENT, {
      useFactory: compartmentOfRequest,
      deps: [REQUEST],
      lifetime: 'scoped',
      eager: false,
    }),
  ],
  exports: [SIM_OPTIONS, SIM_CLOCK, RNG, SHIP_STATE, DECK_PLAN, COMPARTMENT],
});
