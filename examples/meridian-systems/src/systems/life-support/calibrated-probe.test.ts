import { describe, expect, it } from 'vitest';

import calibration from '../../../deck/sensors.calibration.json';
import deck from '../../../deck/meridian.deck.json';
import type { CompartmentId, DeckPlan } from '../../simulation/contracts';
import { SeededRandom } from '../../simulation/seeded-random';
import { ShipStateStore } from '../../simulation/ship-state-store';

import { CalibratedProbe } from './calibrated-probe';
import type { LifeSupportOptions } from './contracts';
import { LIFE_SUPPORT_RATINGS, readAtmosphere } from './life-support-model';

const plan = deck satisfies DeckPlan;
const options: LifeSupportOptions = {
  calibration,
  ratings: LIFE_SUPPORT_RATINGS,
};

/** The reading drawn from the fork of the compartment and tick, in order. */
function forkReading(rng: SeededRandom, id: CompartmentId, tick: number) {
  const air = new ShipStateStore(plan).snapshot().compartments[id];
  const room = plan.compartments.find((entry) => entry.id === id);
  if (!room) throw new Error(`the deck has no ${id}`);
  const stream = rng.fork(`AtmosphereSensor:${id}:${tick}`);
  return readAtmosphere(air, room, id, tick, calibration, () => stream.next());
}

describe('CalibratedProbe', () => {
  it('reads a compartment at a tick from the fork of that compartment and tick', () => {
    const rng = new SeededRandom({ seed: 7 });
    const probe = new CalibratedProbe(rng, options, plan);
    const air = new ShipStateStore(plan).snapshot().compartments.airlock;
    const reading = probe.read('airlock', air, 12);
    expect(reading).toEqual(forkReading(rng, 'airlock', 12));
    expect(reading).toMatchObject({ compartment: 'airlock', tick: 12 });
  });

  it('reads the same numbers twice for one compartment and tick', () => {
    const probe = new CalibratedProbe(
      new SeededRandom({ seed: 7 }),
      options,
      plan,
    );
    const air = new ShipStateStore(plan).snapshot().compartments.habitat;
    expect(probe.read('habitat', air, 3)).toEqual(
      probe.read('habitat', air, 3),
    );
    expect(probe.read('habitat', air, 3)).not.toEqual(
      probe.read('habitat', air, 4),
    );
  });

  it('throws for a compartment the deck lacks', () => {
    const probe = new CalibratedProbe(
      new SeededRandom({ seed: 7 }),
      options,
      plan,
    );
    const air = new ShipStateStore(plan).snapshot().compartments.habitat;
    expect(() => probe.read('galley' as CompartmentId, air, 0)).toThrow(
      "The deck plan has no compartment 'galley'.",
    );
  });
});
