import { describe, expect, it } from 'vitest';

import deck from '../../../deck/meridian.deck.json';
import type { AtmosphereReading } from '../../physics/atmosphere';
import type {
  CompartmentId,
  CompartmentState,
  DeckPlan,
} from '../../simulation/contracts';
import { ShipStateStore } from '../../simulation/ship-state-store';
import type { IAtmosphereProbe } from './contracts';
import { GasAnalyzer } from './gas-analyzer';

const plan = deck satisfies DeckPlan;

/** Records each call and answers a reading that names its arguments. */
class ProbeDouble implements IAtmosphereProbe {
  readonly calls: [CompartmentId, CompartmentState, number][] = [];

  read(
    compartment: CompartmentId,
    air: CompartmentState,
    tick: number,
  ): AtmosphereReading<CompartmentId> {
    this.calls.push([compartment, air, tick]);
    return {
      compartment,
      tick,
      temperature: air.temperature,
      pressure: 0,
      partial: air.moles,
    };
  }
}

function build() {
  const state = new ShipStateStore(plan);
  const probe = new ProbeDouble();
  const analyzer = () => new GasAnalyzer('habitat', state, probe);
  return { state, probe, analyzer };
}

describe('GasAnalyzer', () => {
  it('reads the habitat through the probe at the current tick', () => {
    const { state, probe, analyzer } = build();
    const reading = analyzer().read();
    const ship = state.snapshot();
    expect(probe.calls).toEqual([['habitat', ship.compartments.habitat, 0]]);
    expect(probe.calls[0][1]).toBe(ship.compartments.habitat);
    expect(reading).toMatchObject({ compartment: 'habitat', tick: 0 });
  });

  it('samples at construction, so a second read repeats the first tick', () => {
    const { state, probe, analyzer } = build();
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
    expect(probe.calls).toHaveLength(1);
    const second = analyzer().read();
    expect(second).toMatchObject({ tick: 1, temperature: 280 });
    expect(probe.calls).toHaveLength(2);
  });
});
