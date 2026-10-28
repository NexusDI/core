import {
  type CompartmentId,
  type CompartmentState,
  DECK_PLAN,
  type DeckPlan,
  type IRandomSource,
  RNG,
} from '../../simulation/contracts';

import {
  type AtmosphereReading,
  type IAtmosphereProbe,
  LIFE_SUPPORT_OPTIONS,
  type LifeSupportOptions,
} from './contracts';
import { readAtmosphere } from './life-support-model';

/** The sensors of every compartment, with the noise and resolution of `options.calibration`. */
export class CalibratedProbe implements IAtmosphereProbe {
  static deps = [RNG, LIFE_SUPPORT_OPTIONS, DECK_PLAN] as const;

  constructor(
    private readonly rng: IRandomSource,
    private readonly options: LifeSupportOptions,
    private readonly deck: DeckPlan,
  ) {}

  /**
   * The noise comes from the fork `AtmosphereSensor:<compartment>:<tick>`,
   * whose stream depends on the seed and the label alone. Every read of one
   * compartment and tick draws the same numbers, and no other system's draws
   * move.
   */
  read(
    compartment: CompartmentId,
    air: CompartmentState,
    tick: number,
  ): AtmosphereReading<CompartmentId> {
    const plan = this.deck.compartments.find((room) => room.id === compartment);
    if (!plan) {
      throw new Error(`The deck plan has no compartment '${compartment}'.`);
    }
    const stream = this.rng.fork(`AtmosphereSensor:${compartment}:${tick}`);
    return readAtmosphere(
      air,
      plan,
      compartment,
      tick,
      this.options.calibration,
      () => stream.next(),
    );
  }
}
