import { defineModule, provide, REQUEST } from '@nexusdi/core';

import deck from '../../deck/meridian.deck.json' with { type: 'json' };

import { CommandDesk } from './command-desk';
import { COMMAND_DESK } from './commands';
import { compartmentOfRequest } from './compartment-of-request';
import {
  COMPARTMENT,
  DECK_PLAN,
  RNG,
  SHIP_STATE,
  SIM_CLOCK,
  SIM_OPTIONS,
  TICK_LOOP,
} from './contracts';
import { FixedStepClock } from './fixed-step-clock';
import { FixedStepLoop } from './fixed-step-loop';
import { SeededRandom } from './seeded-random';
import { SIM_OPTIONS_SCHEMA } from './sim-options-schema';
import { ShipStateStore } from './ship-state-store';

/**
 * The kernel every system reads: the options, the clock, the random source,
 * the ship state, the deck, the request's compartment and the two buses. The
 * loop collects `all(SHIP_SYSTEMS)` and the desk `all(COMMAND_HANDLERS)`, and
 * each reads every contribution a module publishes by naming the token in its
 * exports. Each system reads this module, so it is global.
 */
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
    provide(TICK_LOOP, { useClass: FixedStepLoop }),
    provide(COMMAND_DESK, { useClass: CommandDesk }),
    // Sync and scoped: eager: false, so a scope whose request names no
    // compartment opens, and only a get of COMPARTMENT refuses it.
    provide(COMPARTMENT, {
      useFactory: compartmentOfRequest,
      deps: [REQUEST],
      lifetime: 'scoped',
      eager: false,
    }),
  ],
  exports: [
    SIM_OPTIONS,
    SIM_CLOCK,
    RNG,
    SHIP_STATE,
    DECK_PLAN,
    TICK_LOOP,
    COMMAND_DESK,
    COMPARTMENT,
  ],
});
