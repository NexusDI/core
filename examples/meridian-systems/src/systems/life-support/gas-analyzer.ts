import {
  type AtmosphereReading,
  readAtmosphere,
} from '../../physics/atmosphere';
import {
  COMPARTMENT,
  type CompartmentId,
  DECK_PLAN,
  type DeckPlan,
  type IRandomSource,
  type IShipState,
  RNG,
  SHIP_STATE,
} from '../../simulation/contracts';
import {
  type IAtmosphereSensor,
  LIFE_SUPPORT_OPTIONS,
  type LifeSupportOptions,
} from './contracts';

/**
 * A gas analyzer in the compartment of the scope's request. It samples the
 * compartment when the container builds it and answers that sample on every
 * `read()`, so a transient binding gives a fresh sample on each `get()`.
 */
export class GasAnalyzer implements IAtmosphereSensor {
  static deps = [
    COMPARTMENT,
    SHIP_STATE,
    RNG,
    LIFE_SUPPORT_OPTIONS,
    DECK_PLAN,
  ] as const;

  private readonly sample: AtmosphereReading<CompartmentId>;

  /**
   * The noise comes from the fork `AtmosphereSensor:<compartment>:<tick>`,
   * whose stream depends on the seed and the label alone. Every analyzer of
   * one compartment and tick reads the same numbers, and no other system's
   * draws move.
   */
  constructor(
    compartment: CompartmentId,
    state: IShipState,
    rng: IRandomSource,
    options: LifeSupportOptions,
    deck: DeckPlan,
  ) {
    const ship = state.snapshot();
    const plan = deck.compartments.find((room) => room.id === compartment);
    if (!plan) {
      throw new Error(`The deck plan has no compartment '${compartment}'.`);
    }
    const stream = rng.fork(`AtmosphereSensor:${compartment}:${ship.tick}`);
    this.sample = readAtmosphere(
      ship.compartments[compartment],
      plan,
      compartment,
      ship.tick,
      options.calibration,
      () => stream.next(),
    );
  }

  read(): AtmosphereReading<CompartmentId> {
    return this.sample;
  }
}
