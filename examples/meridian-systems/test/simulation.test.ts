import { Nexus } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { meridianSystems } from '../src/meridian-systems.module';
import { GASES, pressure } from '../src/physics/gas';
import { DECK_PLAN, TICK_LOOP } from '../src/simulation/contracts';
import { roundNumber, roundSnapshot } from '../src/simulation/round-snapshot';
import { test } from './fixtures';
import { LOOP_WATCH, PROBE_LOG } from './probes';

describe('meridianSystems', () => {
  it('passes the check', () => {
    expect(() =>
      Nexus.check(meridianSystems({ seed: 7, dt: 0.5 })),
    ).not.toThrow();
  });

  it('builds on its own and gives one snapshot for one seed', async () => {
    await using first = await Nexus.create(
      meridianSystems({ seed: 7, dt: 0.5 }),
    );
    await using second = await Nexus.create(
      meridianSystems({ seed: 7, dt: 0.5 }),
    );
    const a = first.get(TICK_LOOP).advance(600);
    const b = second.get(TICK_LOOP).advance(600);
    expect(roundSnapshot(a)).toEqual(roundSnapshot(b));
    expect(a).toEqual(b);
  });
});

describe('ShipUnderTest', () => {
  test('runs the probe systems in phase order through TICK_LOOP', ({
    nexus,
  }) => {
    nexus.get(TICK_LOOP).advance(2);
    expect(nexus.get(PROBE_LOG).entries).toEqual([
      'ProbeReactor@1',
      'ProbeSensor@1',
      'ProbeReactor@2',
      'ProbeSensor@2',
    ]);
  });

  test('gives a provider in an imported module the TICK_LOOP of the root', ({
    nexus,
  }) => {
    expect(nexus.get(LOOP_WATCH).loop).toBe(nexus.get(TICK_LOOP));
  });

  test('reads the idle ship after 600 ticks', ({ nexus }) => {
    const ship = nexus.get(TICK_LOOP).advance(600);
    const rounded = roundSnapshot(ship);
    expect(rounded.tick).toBe(600);
    expect(rounded.time).toBe(300);
    expect(rounded.compartments.habitat.temperature).toBe(293);
    const habitat = ship.compartments.habitat;
    const moles = GASES.reduce((sum, gas) => sum + habitat.moles[gas], 0);
    const room = nexus
      .get(DECK_PLAN)
      .compartments.find((plan) => plan.id === 'habitat');
    if (!room) throw new Error('The deck plan has no habitat.');
    expect(roundNumber(pressure(moles, habitat.temperature, room.volume))).toBe(
      101_300,
    );
  });
});
