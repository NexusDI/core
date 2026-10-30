import { Nexus } from '@nexusdi/core';
import * as tools from '@nexusdi/devtools';
import {
  DECK_PLAN,
  readShip,
  shipNotes,
  SHIP_STATE,
} from '@nexusdi/meridian-systems';
import { describe, expect, vi } from 'vitest';

import { SIM_BODY_LIMIT, TICKS_REFUSED } from '../../src/bridge/sim-ticks';
import {
  OfflineMeridian,
  offlineMeridian,
} from '../../src/ship/meridian.module';
import { bridgePlugins } from '../../src/ship/plugins';
import { test } from '../fixtures';
import {
  calls,
  charset,
  json,
  type Payload,
  UNREADABLE,
} from '../route-helpers';
import { FRAMEWORKS } from '../support';

describe.each(FRAMEWORKS)('the simulation routes on %s', (framework) => {
  const call = calls[framework];

  test('GET /sim answers the ship at tick 0', async ({ nexus }) => {
    const { status, body } = await call(nexus, 'GET', '/sim');
    expect(status).toBe(200);
    expect(body).toEqual(
      readShip(nexus.get(SHIP_STATE).snapshot(), nexus.get(DECK_PLAN)),
    );
    expect(body).toMatchObject({ tick: 0, time: 0 });
    expect(body).toMatchObject({
      compartments: { habitat: { pressure: 101_300 } },
    });
  });

  test('POST /sim/advance runs the ticks and GET /sim reads the result', async ({
    nexus,
  }) => {
    const advanced = await call(
      nexus,
      'POST',
      '/sim/advance',
      json({ ticks: 3 }),
    );
    expect(advanced.status).toBe(200);
    expect(advanced.body).toMatchObject({ tick: 3, time: 1.5 });
    expect(advanced.body).toEqual(
      readShip(nexus.get(SHIP_STATE).snapshot(), nexus.get(DECK_PLAN)),
    );
    expect(await call(nexus, 'GET', '/sim')).toEqual(advanced);
  });

  test('POST /sim/advance answers 400 for a tick count it cannot run', async ({
    nexus,
  }) => {
    const refused = { status: 400, body: TICKS_REFUSED };
    expect(
      await call(nexus, 'POST', '/sim/advance', json({ ticks: 0 })),
    ).toEqual(refused);
    expect(await call(nexus, 'POST', '/sim/advance')).toEqual(refused);
    expect(nexus.get(SHIP_STATE).snapshot().tick).toBe(0);
  });

  test.for(UNREADABLE)(
    'POST /sim/advance answers 400 for %s',
    async ([, payload], { nexus }) => {
      expect(await call(nexus, 'POST', '/sim/advance', payload)).toEqual({
        status: 400,
        body: TICKS_REFUSED,
      });
    },
  );

  test('POST /sim/advance reads a JSON media type in any case, with a charset', async ({
    nexus,
  }) => {
    const advanced = await call(
      nexus,
      'POST',
      '/sim/advance',
      charset({ ticks: 3 }),
    );
    expect(advanced).toMatchObject({ status: 200, body: { tick: 3 } });
  });

  test('POST /sim/advance answers 413 for a body over 100 kB', async ({
    nexus,
  }) => {
    const pad = 'x'.repeat(SIM_BODY_LIMIT);
    const over = await call(
      nexus,
      'POST',
      '/sim/advance',
      json({ ticks: 3, pad }),
    );
    expect(over).toEqual({ status: 413, body: undefined });
    expect(nexus.get(SHIP_STATE).snapshot().tick).toBe(0);
    const under = json({ ticks: 3, pad: pad.slice(0, SIM_BODY_LIMIT - 100) });
    expect((await call(nexus, 'POST', '/sim/advance', under)).status).toBe(200);
  });

  test('GET /graph answers the graph the option draws', async () => {
    await using ship = await Nexus.create(OfflineMeridian, {
      plugins: [
        ...bridgePlugins({ dev: true }),
        tools.devtools({ annotate: [shipNotes] }),
      ],
    });
    const { status, body } = await call(ship, 'GET', '/graph', undefined, {
      graph: () => tools.graph(ship),
    });
    expect(status).toBe(200);
    expect(body).toEqual(tools.graph(ship));
  });

  test('GET /graph answers 404 without the graph option', async ({ nexus }) => {
    expect((await call(nexus, 'GET', '/graph')).status).toBe(404);
  });

  test.for(['/mission', '/log/stream'])(
    'GET %s answers an empty 404, as the demo routes are ship routes only',
    async (path, { nexus }) => {
      expect(await call(nexus, 'GET', path)).toEqual({
        status: 404,
        body: undefined,
      });
    },
  );

  test('POST /sim/advance answers 404 on a live ship', async () => {
    // A faked setInterval keeps the live driver's timer out of the event loop.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      await using ship = await Nexus.create(
        offlineMeridian({ sim: { seed: 7, dt: 0.5 }, mode: 'live' }),
      );
      const advance = (payload: Payload) =>
        call(ship, 'POST', '/sim/advance', payload);
      expect((await advance(json({ ticks: 3 }))).status).toBe(404);
      // The mode decides before the body is read, so a malformed body
      // answers 404 too.
      expect(
        (await advance({ type: 'application/json', text: '{ ticks' })).status,
      ).toBe(404);
      expect(ship.get(SHIP_STATE).snapshot().tick).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
