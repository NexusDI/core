import { defineModule, Nexus } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { meridianSystems } from '../src/meridian-systems.module';
import { GASES, pressure } from '../src/physics/gas';
import { COMMAND_DESK } from '../src/simulation/commands';
import { UnknownCompartmentError } from '../src/errors';
import {
  COMPARTMENT,
  DECK_PLAN,
  type SimOptions,
  TICK_LOOP,
} from '../src/simulation/contracts';
import { roundNumber, roundSnapshot } from '../src/simulation/round-snapshot';
import { TELEMETRY } from '../src/telemetry/contracts';
import { test } from './fixtures';
import { LOOP_WATCH, PROBE_LOG } from './probes';

describe('meridianSystems', () => {
  it('passes the check', () => {
    expect(() =>
      Nexus.check(meridianSystems({ seed: 7, dt: 0.5 })),
    ).not.toThrow();
  });

  it('exports TELEMETRY to a root that imports it', async () => {
    const Root = defineModule({
      name: 'Root',
      imports: [meridianSystems({ seed: 7, dt: 0.5 })],
    });
    expect(() => Nexus.check(Root)).not.toThrow();
    await using ship = await Nexus.create(Root);
    expect(ship.get(TELEMETRY)).toBeDefined();
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

  it('serves the command desk, which refuses a system no module handles', async () => {
    await using ship = await Nexus.create(
      meridianSystems({ seed: 7, dt: 0.5 }),
    );
    expect(() =>
      ship.get(COMMAND_DESK).submit({ system: 'warp-core', action: 'engage' }),
    ).toThrow(
      expect.objectContaining({
        code: 'MERIDIAN_BAD_COMMAND',
        reason: 'system',
        expected: 'engineering, life-support and safety',
      }),
    );
  });
});

describe('COMPARTMENT', () => {
  it('reads the compartment of the request a scope carries', async () => {
    await using ship = await Nexus.create(
      meridianSystems({ seed: 7, dt: 0.5 }),
    );
    await using scope = await ship.createScope({
      request: { compartment: 'habitat' },
    });
    expect(scope.get(COMPARTMENT)).toBe('habitat');
  });

  it('opens a scope whose request names no compartment and refuses only the get', async () => {
    await using ship = await Nexus.create(
      meridianSystems({ seed: 7, dt: 0.5 }),
    );
    await using scope = await ship.createScope({ request: {} });
    let refused: unknown;
    try {
      scope.get(COMPARTMENT);
    } catch (error) {
      refused = error;
    }
    // Core rethrows a NexusError from a sync factory as it is, with no
    // ProviderError around it.
    expect(refused).toBeInstanceOf(UnknownCompartmentError);
    expect({ ...(refused as UnknownCompartmentError) }).toStrictEqual({
      expected: 'bridge, habitat, reactor-bay and airlock',
    });
  });
});

describe('Simulation.forRoot', () => {
  const SEED = 'expected a whole number from 0 to 4294967295 (uint32)';
  const DT = 'expected a positive finite number of ship seconds';

  // The schema runs at create, and Nexus.create rejects with
  // NEXUS_PROVIDER_FAILED. The issues sit on error.cause, and the errors()
  // message does not show them yet (NexusDI/core#176).
  it.each([
    [{ seed: 1.5, dt: 0.5 }, 'seed', `${SEED}, got 1.5`],
    [{ seed: -1, dt: 0.5 }, 'seed', `${SEED}, got -1`],
    [{ seed: 2 ** 32, dt: 0.5 }, 'seed', `${SEED}, got 4294967296`],
    [{ seed: Number.NaN, dt: 0.5 }, 'seed', `${SEED}, got NaN`],
    [{ seed: '7', dt: 0.5 }, 'seed', `${SEED}, got "7"`],
    [{ seed: 7, dt: 0 }, 'dt', `${DT}, got 0`],
    [{ seed: 7, dt: -0.5 }, 'dt', `${DT}, got -0.5`],
    [{ seed: 7, dt: Number.POSITIVE_INFINITY }, 'dt', `${DT}, got Infinity`],
    [{ seed: 7 }, 'dt', `${DT}, got undefined`],
  ])('refuses %o at create', async (options, field, message) => {
    const error = await Nexus.create(
      meridianSystems(options as unknown as SimOptions),
    ).then(
      () => undefined,
      (refused: unknown) => refused,
    );
    expect(error).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
      token: 'SimOptions',
      cause: {
        code: 'NEXUS_INVALID_MODULE_OPTIONS',
        module: 'Simulation',
        issues: [{ path: [field], message }],
      },
    });
  });

  it('lists every refused field', async () => {
    const error = await Nexus.create(meridianSystems({ seed: -1, dt: 0 })).then(
      () => undefined,
      (refused: unknown) => refused,
    );
    expect(error).toMatchObject({
      cause: {
        issues: [
          { path: ['seed'], message: `${SEED}, got -1` },
          { path: ['dt'], message: `${DT}, got 0` },
        ],
      },
    });
  });

  it.each([
    { seed: 0, dt: 0.001 },
    { seed: 4294967295, dt: 60 },
  ])('accepts %o', async (options) => {
    await using ship = await Nexus.create(meridianSystems(options));
    expect(ship.get(TICK_LOOP).advance(1).time).toBe(options.dt);
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
