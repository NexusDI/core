import type { Nexus } from '@nexusdi/core';
import { ATMOSPHERE_SENSOR, SHIP_STATE } from '@nexusdi/meridian-systems';
import { nodeScopes } from '@nexusdi/node';
import { createTestingContainer } from '@nexusdi/testing';
import { describe, expect, vi } from 'vitest';

import { FLIGHT_LOG } from '../../src/ship/contracts';
import { OfflineMeridian } from '../../src/ship/meridian.module';
import { FailingSensor } from '../doubles';
import { test } from '../fixtures';
import { calls, json, scopedShip } from '../route-helpers';
import { FRAMEWORKS } from '../support';

describe.each(FRAMEWORKS)('the airlock commands on %s', (framework) => {
  const call = calls[framework];

  test('POST /commands queues the close, the vent and the pump, and GET /commands merges them', async () => {
    const scopes = nodeScopes();
    await using ship = await scopedShip(scopes);
    const post = (body: unknown) =>
      call(ship, 'POST', '/commands', json(body), { scopes });

    expect(
      await post({
        system: 'safety',
        action: 'close',
        door: 'airlock-outer',
      }),
    ).toEqual({
      status: 202,
      body: { tick: 1, flightLog: ['survey-7: closed airlock-outer'] },
    });
    expect(
      await post({
        system: 'life-support',
        action: 'vent',
        compartment: 'airlock',
        open: false,
      }),
    ).toEqual({ status: 202, body: { tick: 1 } });
    expect(
      await post({
        system: 'life-support',
        action: 'pump',
        compartment: 'airlock',
        mode: 'fill',
      }),
    ).toEqual({ status: 202, body: { tick: 1 } });

    const advanced = await call(
      ship,
      'POST',
      '/sim/advance',
      json({ ticks: 1 }),
      { scopes },
    );
    expect(advanced.status).toBe(200);
    expect(await call(ship, 'GET', '/commands', undefined, { scopes })).toEqual(
      {
        status: 200,
        body: [
          {
            tick: 1,
            change: {
              safety: { doors: { 'airlock-outer': false } },
              lifeSupport: {
                vents: { airlock: false },
                pumps: { airlock: 'fill' },
              },
            },
          },
        ],
      },
    );
  });

  test('POST /commands answers 400 for a vent in the habitat, which has none', async () => {
    const scopes = nodeScopes();
    await using ship = await scopedShip(scopes);
    const vent = json({
      system: 'life-support',
      action: 'vent',
      compartment: 'habitat',
      open: true,
    });
    expect(await call(ship, 'POST', '/commands', vent, { scopes })).toEqual({
      status: 400,
      body: {
        code: 'MERIDIAN_BAD_COMMAND',
        message:
          'life-support vent cannot use the compartment argument. It takes online and offline with no arguments, heater with a compartment and on true or false or a target from 283 to 303 K, scrubber and oxygen with a compartment and on true or false, vent with a compartment and open true or false, and pump with a compartment and mode off, evacuate or fill.',
        fix: 'send the arguments in the ranges above.',
      },
    });
    await call(ship, 'POST', '/sim/advance', json({ ticks: 1 }), { scopes });
    expect(ship.get(SHIP_STATE).log()).toEqual([]);
  });
});

describe.each(FRAMEWORKS)('the atmosphere route on %s', (framework) => {
  const call = calls[framework];

  /** What an analyzer in `compartment` reads at the ship's current tick. */
  async function readingOf(ship: Nexus, compartment: string) {
    await using scope = await ship.createScope({
      request: {
        mission: { id: 'survey-7', target: 'Kepler-442b' },
        compartment,
      },
    });
    return scope.get(ATMOSPHERE_SENSOR).read();
  }

  test.for(['habitat', 'airlock'])(
    'GET /compartments/%s/atmosphere answers the reading at tick 0',
    async (compartment, { nexus }) => {
      const { status, body } = await call(
        nexus,
        'GET',
        `/compartments/${compartment}/atmosphere`,
      );
      expect(status).toBe(200);
      expect(body).toMatchObject({ compartment, tick: 0 });
      expect(body).toEqual(await readingOf(nexus, compartment));
    },
  );

  test('GET /compartments/galley/atmosphere answers 404 with the text', async ({
    nexus,
  }) => {
    expect(await call(nexus, 'GET', '/compartments/galley/atmosphere')).toEqual(
      {
        status: 404,
        body: {
          code: 'MERIDIAN_UNKNOWN_COMPARTMENT',
          message:
            "No compartment is named 'galley'. The deck has bridge, habitat, reactor-bay and airlock.",
          fix: 'read /compartments/<id>/atmosphere with one of the compartments above.',
        },
      },
    );
  });

  test('GET /compartments/%68abitat/atmosphere answers 404, since the id stays encoded', async ({
    nexus,
  }) => {
    const { status, body } = await call(
      nexus,
      'GET',
      '/compartments/%68abitat/atmosphere',
    );
    expect(status).toBe(404);
    // The router keeps the id encoded, and the message decodes it for display.
    expect(body).toMatchObject({
      code: 'MERIDIAN_UNKNOWN_COMPARTMENT',
      message:
        "No compartment is named 'habitat'. The deck has bridge, habitat, reactor-bay and airlock.",
    });
  });

  test('GET /compartments/reactor%20bay/atmosphere names the room with its space', async ({
    nexus,
  }) => {
    const { status, body } = await call(
      nexus,
      'GET',
      '/compartments/reactor%20bay/atmosphere',
    );
    expect(status).toBe(404);
    expect(body).toMatchObject({
      message: expect.stringContaining("'reactor bay'"),
    });
  });

  test.for([
    '/Compartments/habitat/atmosphere',
    '/compartments/habitat/Atmosphere',
    '/compartments/habitat/atmosphere/',
  ])(
    'GET %s answers an empty 404, as no route matches it',
    async (path, { nexus }) => {
      expect(await call(nexus, 'GET', path)).toEqual({
        status: 404,
        body: undefined,
      });
    },
  );

  test('an unknown route answers an empty 404 that echoes no path', async ({
    nexus,
  }) => {
    expect(await call(nexus, 'GET', `/${'x'.repeat(2_000)}`)).toEqual({
      status: 404,
      body: undefined,
    });
  });

  test('a sensor that throws answers an empty 500', async () => {
    await using ship = await createTestingContainer(OfflineMeridian)
      .override(ATMOSPHERE_SENSOR, { useClass: FailingSensor })
      .create();
    expect(await call(ship, 'GET', '/compartments/habitat/atmosphere')).toEqual(
      { status: 500, body: undefined },
    );
  });

  test('a NexusError that ends in a 500 reaches the log option and leaves the body empty', async () => {
    await using ship = await createTestingContainer(OfflineMeridian)
      .override(FLIGHT_LOG, {
        useFactory: () => {
          throw new Error('the log failed');
        },
        lifetime: 'scoped',
      })
      .create();
    const log = vi.fn();
    expect(
      await call(ship, 'GET', '/course/Kepler-442b', undefined, { log }),
    ).toEqual({ status: 500, body: undefined });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ code: expect.stringMatching(/^NEXUS_/) }),
      expect.objectContaining({ status: 500 }),
    );
  });
});
