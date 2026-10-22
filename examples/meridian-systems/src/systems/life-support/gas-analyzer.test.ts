import { describe, expect, it } from 'vitest';

import calibration from '../../../deck/sensors.calibration.json';
import deck from '../../../deck/meridian.deck.json';
import { LIFE_SUPPORT_RATINGS, readAtmosphere } from '../../physics/atmosphere';
import type { DeckPlan } from '../../simulation/contracts';
import { SeededRandom } from '../../simulation/seeded-random';
import { ShipStateStore } from '../../simulation/ship-state-store';
import type { LifeSupportOptions } from './contracts';
import { GasAnalyzer } from './gas-analyzer';

const plan = deck satisfies DeckPlan;
const options: LifeSupportOptions = {
  calibration,
  ratings: LIFE_SUPPORT_RATINGS,
};

function build() {
  const state = new ShipStateStore(plan);
  const rng = new SeededRandom({ seed: 7 });
  const analyzer = () => new GasAnalyzer('habitat', state, rng, options, plan);
  return { state, rng, analyzer };
}

/** What the analyzer reads in the habitat of `state` at its current tick. */
function expected(state: ShipStateStore, rng: SeededRandom) {
  const ship = state.snapshot();
  const room = plan.compartments.find((entry) => entry.id === 'habitat');
  if (!room) throw new Error('the deck has no habitat');
  const stream = rng.fork(`AtmosphereSensor:habitat:${ship.tick}`);
  return readAtmosphere(
    ship.compartments.habitat,
    room,
    'habitat',
    ship.tick,
    calibration,
    () => stream.next(),
  );
}

describe('GasAnalyzer', () => {
  it('reads the habitat through the fork of its compartment and tick', () => {
    const { state, rng, analyzer } = build();
    expect(analyzer().read()).toEqual(expected(state, rng));
    expect(analyzer().read()).toMatchObject({
      compartment: 'habitat',
      tick: 0,
    });
  });

  it('samples at construction, so a second read repeats the first tick', () => {
    const { state, rng, analyzer } = build();
    const first = analyzer();
    const sample = first.read();
    const ship = state.snapshot();
    state.commit({
      ...ship,
      tick: 1,
      time: 0.5,
      compartments: {
        ...ship.compartments,
        habitat: { ...ship.compartments.habitat, temperature: 280 },
      },
    });
    expect(first.read()).toBe(sample);
    const second = analyzer().read();
    expect(second.tick).toBe(1);
    expect(second).toEqual(expected(state, rng));
    expect(second.temperature).toBeLessThan(281);
  });
});
