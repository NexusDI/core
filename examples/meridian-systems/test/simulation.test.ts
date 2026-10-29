import { isNexusError, Nexus } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { MeridianSystems } from '../src/meridian-systems.module';
import { GASES, pressure } from '../src/physics/gas';
import { COMMAND_DESK } from '../src/simulation/commands';
import {
  COMPARTMENT,
  DECK_PLAN,
  SHIP_RECORDS,
  type SimOptions,
  type SystemRecord,
  TICK_LOOP,
} from '../src/simulation/contracts';
import { roundNumber, roundSnapshot } from '../src/simulation/round-snapshot';
import { TELEMETRY } from '../src/telemetry/contracts';
import { Telemetry } from '../src/telemetry/telemetry.module';
import { byCodeUnit } from '../src/simulation/by-code-unit';

import { shipRoot } from './ship-root';
import { shipRecords } from './ship-state';
import { shipTest, test } from './fixtures';
import { LOOP_WATCH, PROBE_LOG, caught } from './support';

describe('MeridianSystems', () => {
  const test = shipTest(shipRoot());

  it('passes the check', () => {
    expect(() => Nexus.check(shipRoot())).not.toThrow();
  });

  it('exports nothing, so a root reads TELEMETRY only when it imports Telemetry', async () => {
    expect(MeridianSystems.exports ?? []).toEqual([]);
    await using bare = await Nexus.create(shipRoot());
    expect(() => bare.get(TELEMETRY)).toThrow(
      expect.objectContaining({
        code: 'NEXUS_NOT_VISIBLE',
        token: 'TelemetryFeed',
      }),
    );
    await using ship = await Nexus.create(shipRoot({ reads: [Telemetry] }));
    expect(ship.get(TELEMETRY)).toBeDefined();
  });

  test('collects the record of every system at startup through SHIP_RECORDS', ({
    nexus: ship,
  }) => {
    const records = ship.get(SHIP_RECORDS);
    expect(
      records.flatMap((entry) => Object.keys(entry.records)).sort(),
    ).toEqual([
      'comms',
      'coolant',
      'drive',
      'helm',
      'lifeSupport',
      'power',
      'reactor',
      'safety',
      'weapons',
    ]);
    expect(
      records.flatMap((entry) => Object.keys(entry.setpoints)).sort(),
    ).toEqual([
      'comms',
      'drive',
      'helm',
      'lifeSupport',
      'reactor',
      'safety',
      'shields',
      'weapons',
    ]);
  });

  test('collects the records test/ship-state.ts hands a store with no container', ({
    nexus: ship,
  }) => {
    const byKeys = (records: readonly SystemRecord[]) =>
      [...records].sort((a, b) =>
        byCodeUnit(
          Object.keys(a.records).join(),
          Object.keys(b.records).join(),
        ),
      );
    expect(byKeys(shipRecords())).toEqual(byKeys(ship.get(SHIP_RECORDS)));
  });

  it('builds on its own and gives one snapshot for one seed', async () => {
    await using first = await Nexus.create(shipRoot());
    await using second = await Nexus.create(shipRoot());
    const a = first.get(TICK_LOOP).advance(600);
    const b = second.get(TICK_LOOP).advance(600);
    expect(roundSnapshot(a)).toEqual(roundSnapshot(b));
    expect(a).toEqual(b);
  });

  test('serves the command desk, which refuses a system no module handles', ({
    nexus: ship,
  }) => {
    expect(() =>
      ship.get(COMMAND_DESK).submit({ system: 'warp-core', action: 'engage' }),
    ).toThrow(
      expect.objectContaining({
        code: 'MERIDIAN_BAD_COMMAND',
        reason: 'system',
        expected: 'comms, engineering, helm, life-support, safety and weapons',
      }),
    );
  });
});

describe('COMPARTMENT', () => {
  const test = shipTest(shipRoot());

  test('reads the compartment of the request a scope carries', async ({
    nexus: ship,
  }) => {
    await using scope = await ship.createScope({
      request: { compartment: 'habitat' },
    });
    expect(scope.get(COMPARTMENT)).toBe('habitat');
  });

  test('opens a scope whose request names no compartment and refuses only the get', async ({
    nexus: ship,
  }) => {
    await using scope = await ship.createScope({ request: {} });
    // Core rethrows a NexusError from a sync factory as it is, with no
    // ProviderError around it.
    const refused = caught(() => scope.get(COMPARTMENT));
    if (!isNexusError(refused, 'MERIDIAN_UNKNOWN_COMPARTMENT')) {
      throw new Error('expected MERIDIAN_UNKNOWN_COMPARTMENT');
    }
    expect(refused.expected).toBe(
      'bridge, habitat, reactor-bay, airlock, chart-room, computer-core, quarters, comms-relay, shuttle-bay, drone-bay, capacitor-room, engineering, ftl-core and main-drive',
    );
  });
});

describe('Simulation.forRoot', () => {
  const SEED = 'expected a whole number from 0 to 4294967295 (uint32)';
  const DT = 'expected a positive finite number of ship seconds';

  // The schema runs at create, and Nexus.create rejects with
  // NEXUS_PROVIDER_FAILED. The issues sit on error.cause, and the errors()
  // message does not show them yet (NexusDI/core#176).
  const FILES = 'expected an object with a read(name) method';

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
    [{ seed: 7, dt: 0.5, files: 'x' }, 'files', `${FILES}, got "x"`],
    [{ seed: 7, dt: 0.5, files: {} }, 'files', `${FILES}, got [object Object]`],
    [
      { seed: 7, dt: 0.5, files: { read: 1 } },
      'files',
      `${FILES}, got [object Object]`,
    ],
  ])('refuses %o at create', async (options, field, message) => {
    const error = await caught(() =>
      Nexus.create(shipRoot({ sim: options as unknown as SimOptions })),
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
    const error = await caught(() =>
      Nexus.create(shipRoot({ sim: { seed: -1, dt: 0 } })),
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
    { seed: 7, dt: 0.5, files: undefined },
  ])('accepts %o', async (options) => {
    await using ship = await Nexus.create(shipRoot({ sim: options }));
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
