import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { Nexus } from '@nexusdi/core';
import { graph } from '@nexusdi/devtools';
import {
  ATMOSPHERE_SENSOR,
  DECK_PLAN,
  readShip,
  SHIP_STATE,
  type ShipReading,
  TELEMETRY,
} from '@nexusdi/meridian-systems';
import { nodeScopes, type NodeScopes } from '@nexusdi/node';
import { createTestingContainer } from '@nexusdi/testing';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  type MockInstance,
  vi,
} from 'vitest';

import { servers } from '../e2e/servers';
import { createBridge as expressBridge } from '../src/express';
import { createBridge as fastifyBridge } from '../src/fastify';
import { SIM_BODY_LIMIT, TICKS_REFUSED } from '../src/bridge/sim-ticks';
import { type BridgeOptions, createBridge as honoBridge } from '../src/hono';
import { AUDIT_LOG } from '../src/ship/audit-trail.module';
import { SIM_DRIVER } from '../src/ship/contracts';
import {
  DEFAULT_RELAY_URL,
  OfflineMeridian,
  offlineMeridian,
} from '../src/ship/meridian';
import { bridgePlugins } from '../src/ship/plugins';
import { FailingSensor, RecordingFeed } from './doubles';
import { events } from './sse';
import { test } from './fixtures';

const course = { to: 'Kepler-442b', heading: 42 };

test('serves the course from Hono with the fake charts', async ({ nexus }) => {
  const res = await honoBridge(nexus).request('/course/Kepler-442b');
  expect(await res.json()).toEqual({
    course,
    entries: ['plotting Kepler-442b'],
  });
});

test('serves the course from Express with the fake charts', async ({
  nexus,
}) => {
  const server = expressBridge(nexus).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/course/Kepler-442b`);
    expect(await res.json()).toEqual({
      course,
      entries: ['plotting Kepler-442b'],
    });
  } finally {
    server.close();
  }
});

test('serves the course from Fastify with the fake charts', async ({
  nexus,
}) => {
  const bridge = await fastifyBridge(nexus);
  const res = await bridge.inject({ url: '/course/Kepler-442b' });
  expect(res.json()).toEqual({ course, entries: ['plotting Kepler-442b'] });
  await bridge.close();
});

test('the audit interceptor sees every plot', async ({ nexus }) => {
  const res = await honoBridge(nexus).request('/course/Kepler-442b');
  expect(res.status).toBe(200);
  expect(nexus.get(AUDIT_LOG).calls).toEqual(['plot Kepler-442b']);
});

interface Answer {
  readonly status: number;
  readonly body: unknown;
}
/** A request body as it goes on the wire. */
interface Payload {
  readonly type: string;
  readonly text: string;
}
type Call = (
  ship: Nexus,
  method: 'GET' | 'POST',
  path: string,
  payload?: Payload,
  options?: BridgeOptions,
  headers?: Readonly<Record<string, string>>,
) => Promise<Answer>;

const json = (body: unknown): Payload => ({
  type: 'application/json',
  text: JSON.stringify(body),
});

/** Bodies every framework refuses the same way: none of them holds JSON it can read. */
const UNREADABLE: readonly (readonly [string, Payload])[] = [
  ['malformed JSON', { type: 'application/json', text: '{ ticks' }],
  ['an empty JSON body', { type: 'application/json', text: '' }],
  ['a form', { type: 'application/x-www-form-urlencoded', text: 'ticks=3' }],
  ['plain text', { type: 'text/plain', text: '{ "ticks": 3 }' }],
];

/** A JSON body sent with the media type in another case and a charset. */
const charset = (body: unknown): Payload => ({
  type: 'Application/JSON; charset=utf-8',
  text: JSON.stringify(body),
});

/** The status and the body: parsed for a JSON answer, undefined for an empty one, else the text. */
function answerOf(status: number, type: unknown, text: string): Answer {
  const json = String(type ?? '').startsWith('application/json');
  if (json) return { status, body: JSON.parse(text) };
  return { status, body: text === '' ? undefined : text };
}

const answerOfResponse = async (res: Response): Promise<Answer> =>
  answerOf(res.status, res.headers.get('content-type'), await res.text());

const init = (
  method: string,
  payload?: Payload,
  headers: Readonly<Record<string, string>> = {},
): RequestInit =>
  payload === undefined
    ? { method, headers }
    : {
        method,
        headers: { ...headers, 'content-type': payload.type },
        body: payload.text,
      };

/** One request to `ship` through each framework's bridge. */
const calls: Readonly<Record<'hono' | 'express' | 'fastify', Call>> = {
  async hono(ship, method, path, payload, options, headers) {
    return answerOfResponse(
      await honoBridge(ship, options).request(
        path,
        init(method, payload, headers),
      ),
    );
  },
  async express(ship, method, path, payload, options, headers) {
    const server = expressBridge(ship, options).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    try {
      return answerOfResponse(
        await fetch(
          `http://127.0.0.1:${port}${path}`,
          init(method, payload, headers),
        ),
      );
    } finally {
      server.close();
    }
  },
  async fastify(ship, method, path, payload, options, headers = {}) {
    const bridge = await fastifyBridge(ship, options);
    try {
      const res = await bridge.inject({
        method,
        url: path,
        ...(payload === undefined
          ? { headers }
          : {
              headers: { ...headers, 'content-type': payload.type },
              payload: payload.text,
            }),
      });
      return answerOf(res.statusCode, res.headers['content-type'], res.body);
    } finally {
      await bridge.close();
    }
  },
};

describe.each(['hono', 'express', 'fastify'] as const)(
  'the simulation routes on %s',
  (framework) => {
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
      expect((await call(nexus, 'POST', '/sim/advance', under)).status).toBe(
        200,
      );
    });

    test('GET /graph answers the graph the option draws', async () => {
      await using ship = await Nexus.create(OfflineMeridian, {
        plugins: bridgePlugins({ dev: true }),
      });
      const { status, body } = await call(ship, 'GET', '/graph', undefined, {
        graph: () => graph(ship),
      });
      expect(status).toBe(200);
      expect(body).toEqual(graph(ship));
    });

    test('GET /graph answers 404 without the graph option', async ({
      nexus,
    }) => {
      expect((await call(nexus, 'GET', '/graph')).status).toBe(404);
    });

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
  },
);

test('GET /telemetry streams a frame now and one per tick from Hono', async ({
  nexus,
}) => {
  const res = await honoBridge(nexus).request('/telemetry');
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('text/event-stream');
  expect(res.headers.get('cache-control')).toContain('no-transform');
  const stream = events(res);
  expect(await stream.tick()).toBe(0);
  nexus.get(SIM_DRIVER).advance(1);
  expect(await stream.tick()).toBe(1);
  await stream.cancel();
});

test('cancelling the Hono body unsubscribes from the feed', async ({
  nexus,
}) => {
  const feed = new RecordingFeed(
    readShip(nexus.get(SHIP_STATE).snapshot(), nexus.get(DECK_PLAN)),
  );
  await using ship = await createTestingContainer(OfflineMeridian)
    .override(TELEMETRY, { useValue: feed })
    .create();
  const res = await honoBridge(ship).request('/telemetry');
  const stream = events(res);
  expect(await stream.tick()).toBe(0);
  expect(feed.sinks.size).toBe(1);
  await stream.cancel();
  await vi.waitFor(() => expect(feed.sinks.size).toBe(0), { timeout: 5_000 });
});

describe.each(['hono', 'express', 'fastify'] as const)(
  'GET /telemetry on %s over a socket',
  (framework) => {
    test('a client abort unsubscribes from the feed', async ({ nexus }) => {
      const feed = new RecordingFeed(
        readShip(nexus.get(SHIP_STATE).snapshot(), nexus.get(DECK_PLAN)),
      );
      await using ship = await createTestingContainer(OfflineMeridian)
        .override(TELEMETRY, { useValue: feed })
        .create();
      const bridge = await servers[framework](ship);
      try {
        const abort = new AbortController();
        const res = await fetch(`${bridge.url}/telemetry`, {
          signal: abort.signal,
        });
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('text/event-stream');
        expect(res.headers.get('cache-control')).toBe('no-cache, no-transform');
        expect(await events(res).tick()).toBe(0);
        expect(feed.sinks.size).toBe(1);
        abort.abort();
        await vi.waitFor(() => expect(feed.sinks.size).toBe(0), {
          timeout: 5_000,
        });
      } finally {
        await bridge.close();
      }
    });
  },
);

describe.each(['hono', 'express', 'fastify'] as const)(
  'the command routes on %s',
  (framework) => {
    const call = calls[framework];
    const throttle = json({
      system: 'engineering',
      action: 'throttle',
      level: 1,
    });

    test('POST /commands queues a throttle for the next tick', async ({
      nexus,
    }) => {
      expect(await call(nexus, 'POST', '/commands', throttle)).toEqual({
        status: 202,
        body: { tick: 1 },
      });
    });

    test('POST /commands answers 409 for shields the idle reactor cannot power', async ({
      nexus,
    }) => {
      const raise = json({
        system: 'engineering',
        action: 'shields',
        raised: true,
      });
      const { status, body } = await call(nexus, 'POST', '/commands', raise);
      expect(status).toBe(409);
      expect(body).toMatchObject({ code: 'MERIDIAN_POWER_BUDGET' });
    });

    test('POST /commands answers 400 for a command the desk cannot read', async ({
      nexus,
    }) => {
      const warp = await call(
        nexus,
        'POST',
        '/commands',
        json({ system: 'warp' }),
      );
      expect(warp.status).toBe(400);
      expect(warp.body).toMatchObject({ code: 'MERIDIAN_BAD_COMMAND' });
    });

    test.for(UNREADABLE)(
      'POST /commands answers 400 for %s',
      async ([, payload], { nexus }) => {
        const { status, body } = await call(
          nexus,
          'POST',
          '/commands',
          payload,
        );
        expect(status).toBe(400);
        expect(body).toMatchObject({ code: 'MERIDIAN_BAD_COMMAND' });
        // A refused body is never queued, so the log stays empty.
        expect(nexus.get(SHIP_STATE).log()).toEqual([]);
      },
    );

    test('POST /commands reads a JSON media type in any case, with a charset', async ({
      nexus,
    }) => {
      const command = { system: 'engineering', action: 'throttle', level: 1 };
      expect(await call(nexus, 'POST', '/commands', charset(command))).toEqual({
        status: 202,
        body: { tick: 1 },
      });
    });

    test('POST /commands answers 413 for a body over 100 kB', async ({
      nexus,
    }) => {
      const over = json({
        system: 'engineering',
        action: 'throttle',
        level: 1,
        pad: 'x'.repeat(SIM_BODY_LIMIT),
      });
      expect(await call(nexus, 'POST', '/commands', over)).toEqual({
        status: 413,
        body: undefined,
      });
    });

    test('GET /commands answers the log once the tick applies the throttle', async ({
      nexus,
    }) => {
      await call(nexus, 'POST', '/commands', throttle);
      expect(await call(nexus, 'GET', '/commands')).toEqual({
        status: 200,
        body: [],
      });
      await call(nexus, 'POST', '/sim/advance', json({ ticks: 1 }));
      expect(await call(nexus, 'GET', '/commands')).toEqual({
        status: 200,
        body: [{ tick: 1, change: { reactor: { throttle: 1 } } }],
      });
    });

    test('POST /commands queues on a live ship', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      try {
        await using ship = await Nexus.create(
          offlineMeridian({ sim: { seed: 7, dt: 0.5 }, mode: 'live' }),
        );
        expect(await call(ship, 'POST', '/commands', throttle)).toEqual({
          status: 202,
          body: { tick: 1 },
        });
      } finally {
        vi.useRealTimers();
      }
    });
  },
);

/** A ship whose plugins read `scopes`, which the bridge runs too, as the Node entries build them. */
const scopedShip = (scopes: NodeScopes) =>
  Nexus.create(OfflineMeridian, { plugins: bridgePlugins({ scopes }) });

describe.each(['hono', 'express', 'fastify'] as const)(
  'the door commands on %s',
  (framework) => {
    const call = calls[framework];
    const door = (action: 'open' | 'close', id: string) =>
      json({ system: 'safety', action, door: id });

    test('POST /commands answers the flight log entry of an opened door', async () => {
      const scopes = nodeScopes();
      await using ship = await scopedShip(scopes);
      expect(
        await call(ship, 'POST', '/commands', door('open', 'bridge-habitat'), {
          scopes,
        }),
      ).toEqual({
        status: 202,
        body: { tick: 1, flightLog: ['survey-7: opened bridge-habitat'] },
      });
    });

    test('POST /commands records the entry under the request mission', async () => {
      const scopes = nodeScopes();
      await using ship = await scopedShip(scopes);
      expect(
        await call(
          ship,
          'POST',
          '/commands',
          door('open', 'bridge-habitat'),
          { scopes },
          { 'x-mission-id': 'survey-9' },
        ),
      ).toEqual({
        status: 202,
        body: { tick: 1, flightLog: ['survey-9: opened bridge-habitat'] },
      });
    });

    test('POST /commands answers the tick alone without scopes', async () => {
      await using ship = await Nexus.create(OfflineMeridian, {
        plugins: bridgePlugins(),
      });
      expect(
        await call(ship, 'POST', '/commands', door('open', 'bridge-habitat')),
      ).toEqual({ status: 202, body: { tick: 1 } });
    });

    test('POST /commands answers 409 for the outer door at sea-level pressure', async () => {
      const scopes = nodeScopes();
      await using ship = await scopedShip(scopes);
      expect(
        await call(ship, 'POST', '/commands', door('open', 'airlock-outer'), {
          scopes,
        }),
      ).toEqual({
        status: 409,
        body: {
          code: 'MERIDIAN_INTERLOCK',
          message:
            'The airlock-outer door holds 101,300 Pa of difference, above the 5,000 Pa interlock.',
          fix: 'bring both sides within 5,000 Pa of each other with a pump or a vent, then open the door.',
        },
      });
    });

    test('POST /commands records a closed door, which the interlock never holds', async () => {
      const scopes = nodeScopes();
      await using ship = await scopedShip(scopes);
      expect(
        await call(ship, 'POST', '/commands', door('close', 'airlock-outer'), {
          scopes,
        }),
      ).toEqual({
        status: 202,
        body: { tick: 1, flightLog: ['survey-7: closed airlock-outer'] },
      });
    });
  },
);

describe.each(['hono', 'express', 'fastify'] as const)(
  'the airlock commands on %s',
  (framework) => {
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
      expect(
        await call(ship, 'GET', '/commands', undefined, { scopes }),
      ).toEqual({
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
      });
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
            'life-support vent got an argument it cannot use. It takes online with no arguments, heater with a compartment and on true or false or a target from 283 to 303 K, scrubber and oxygen with a compartment and on true or false, vent with a compartment and open true or false, and pump with a compartment and mode off, evacuate or fill.',
          fix: 'send the arguments in the ranges above.',
        },
      });
      await call(ship, 'POST', '/sim/advance', json({ ticks: 1 }), { scopes });
      expect(ship.get(SHIP_STATE).log()).toEqual([]);
    });
  },
);

describe.each(['hono', 'express', 'fastify'] as const)(
  'the safety commands on %s',
  (framework) => {
    const call = calls[framework];
    const SAFETY =
      'open and close with a door of bridge-habitat, habitat-reactor-bay, habitat-airlock or airlock-outer, and flood and drill with a compartment of bridge, habitat or reactor-bay';
    const refused = (action: string) => ({
      status: 400,
      body: {
        code: 'MERIDIAN_BAD_COMMAND',
        message: `safety ${action} got an argument it cannot use. It takes ${SAFETY}.`,
        fix: 'send the arguments in the ranges above.',
      },
    });

    test('POST /commands answers 400 naming the doors for a door the deck lacks', async ({
      nexus,
    }) => {
      const galley = json({ system: 'safety', action: 'open', door: 'galley' });
      expect(await call(nexus, 'POST', '/commands', galley)).toEqual(
        refused('open'),
      );
      expect(nexus.get(SHIP_STATE).log()).toEqual([]);
    });

    test.for(['flood', 'drill'])(
      'POST /commands answers 400 for %s of the airlock, which holds no charge',
      async (action, { nexus }) => {
        const airlock = json({
          system: 'safety',
          action,
          compartment: 'airlock',
        });
        expect(await call(nexus, 'POST', '/commands', airlock)).toEqual(
          refused(action),
        );
        expect(nexus.get(SHIP_STATE).log()).toEqual([]);
      },
    );

    test('POST /commands queues a drill at tick 0 and records no flight log entry', async () => {
      const scopes = nodeScopes();
      await using ship = await scopedShip(scopes);
      const drill = json({
        system: 'safety',
        action: 'drill',
        compartment: 'habitat',
      });
      expect(await call(ship, 'POST', '/commands', drill, { scopes })).toEqual({
        status: 202,
        body: { tick: 1 },
      });
    });

    test('GET /sim at tick 0 shows no alarm and every door and drill false', async ({
      nexus,
    }) => {
      const { status, body } = await call(nexus, 'GET', '/sim');
      expect(status).toBe(200);
      const ship = body as ShipReading;
      expect(ship.safety.alarms).toEqual([]);
      expect(ship.setpoints.safety.doors).toEqual({
        'bridge-habitat': false,
        'habitat-reactor-bay': false,
        'habitat-airlock': false,
        'airlock-outer': false,
      });
      expect(ship.setpoints.safety.drills).toEqual({
        bridge: false,
        habitat: false,
        'reactor-bay': false,
      });
    });

    test('GET /safety answers an empty 404, as safety rides /commands and /sim', async ({
      nexus,
    }) => {
      expect(await call(nexus, 'GET', '/safety')).toEqual({
        status: 404,
        body: undefined,
      });
    });
  },
);

describe.each(['hono', 'express', 'fastify'] as const)(
  'the atmosphere route on %s',
  (framework) => {
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
      expect(
        await call(nexus, 'GET', '/compartments/galley/atmosphere'),
      ).toEqual({
        status: 404,
        body: {
          code: 'MERIDIAN_UNKNOWN_COMPARTMENT',
          message:
            "No compartment is named 'galley'. The deck has bridge, habitat, reactor-bay and airlock.",
          fix: 'read /compartments/<id>/atmosphere with one of the compartments above.',
        },
      });
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
      expect(body).toMatchObject({
        code: 'MERIDIAN_UNKNOWN_COMPARTMENT',
        message: expect.stringContaining("'%68abitat'"),
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
      expect(
        await call(ship, 'GET', '/compartments/habitat/atmosphere'),
      ).toEqual({ status: 500, body: undefined });
    });
  },
);

describe.each(['hono', 'express', 'fastify'] as const)(
  'the comms commands on %s',
  (framework) => {
    const call = calls[framework];
    // Express answers over a real socket, so the spy lets every fetch through
    // and the case counts the ones to the relay.
    let fetches: MockInstance<typeof fetch>;
    beforeEach(() => {
      fetches = vi.spyOn(globalThis, 'fetch');
    });
    afterEach(() => {
      fetches.mockRestore();
    });
    const throttle = json({
      system: 'engineering',
      action: 'throttle',
      level: 0.01,
    });
    const hail = json({ system: 'comms', action: 'hail' });
    const advance = (ship: Nexus, ticks: number) =>
      call(ship, 'POST', '/sim/advance', json({ ticks }));
    const reading = async (ship: Nexus) =>
      (await call(ship, 'GET', '/sim')).body as ShipReading;
    const refusal = {
      status: 400,
      body: {
        code: 'MERIDIAN_BAD_COMMAND',
        message: "comms has no action 'send'. It takes hail with no arguments.",
        fix: 'send one of the actions above with its arguments.',
      },
    };

    test('a hail on the linked ship goes out at tick 1 and gets its reply at tick 5', async ({
      nexus,
    }) => {
      expect(await call(nexus, 'POST', '/commands', throttle)).toEqual({
        status: 202,
        body: { tick: 1 },
      });
      expect(await call(nexus, 'POST', '/commands', hail)).toEqual({
        status: 202,
        body: { tick: 1 },
      });

      await advance(nexus, 1);
      const sent = await reading(nexus);
      expect(sent.comms).toEqual({
        status: 'awaiting reply',
        sent: 1,
        messages: [],
      });
      expect(sent.setpoints.comms).toEqual({ hail: false });
      expect(sent.power.loads).toContainEqual({
        id: 'comms',
        priority: 3,
        demand: 5_000_000,
        allocated: 5_000_000,
      });

      await advance(nexus, 4);
      const replied = await reading(nexus);
      expect(replied.comms).toEqual({
        status: 'standby',
        sent: 1,
        messages: [
          { tick: 5, from: 'fleet traffic control', text: 'sector clear' },
        ],
      });
      expect(replied.safety.alarms).toEqual([]);
      expect(
        fetches.mock.calls.filter(([url]) =>
          String(url).startsWith(DEFAULT_RELAY_URL),
        ),
      ).toEqual([]);
      expect(await call(nexus, 'GET', '/commands')).toEqual({
        status: 200,
        body: [
          {
            tick: 1,
            change: { reactor: { throttle: 0.01 }, comms: { hail: true } },
          },
        ],
      });
    });

    test('a hail on the offline ship reports no subspace link and stays queued', async () => {
      await using ship = await Nexus.create(OfflineMeridian, {
        plugins: bridgePlugins(),
      });
      expect(await call(ship, 'POST', '/commands', hail)).toEqual({
        status: 202,
        body: { tick: 1 },
      });
      await advance(ship, 20);
      const offline = await reading(ship);
      expect(offline.comms.status).toBe('no subspace link');
      expect(offline.setpoints.comms.hail).toBe(true);
      expect(offline.safety.alarms).toEqual([]);
    });

    test('POST /commands answers 400 for comms send on the linked ship', async ({
      nexus,
    }) => {
      const send = json({ system: 'comms', action: 'send' });
      expect(await call(nexus, 'POST', '/commands', send)).toEqual(refusal);
      expect(nexus.get(SHIP_STATE).log()).toEqual([]);
    });

    test('POST /commands answers 400 for comms send on the offline ship', async () => {
      await using ship = await Nexus.create(OfflineMeridian, {
        plugins: bridgePlugins(),
      });
      const send = json({ system: 'comms', action: 'send' });
      expect(await call(ship, 'POST', '/commands', send)).toEqual(refusal);
    });
  },
);

describe.each(['hono', 'express', 'fastify'] as const)(
  'the helm commands on %s',
  (framework) => {
    const call = calls[framework];
    const throttle = json({
      system: 'engineering',
      action: 'throttle',
      level: 0.6,
    });
    const course = json({
      system: 'helm',
      action: 'course',
      to: 'Kepler-442b',
    });
    const burn = json({ system: 'helm', action: 'burn', level: 1 });
    const advance = (ship: Nexus, ticks: number) =>
      call(ship, 'POST', '/sim/advance', json({ ticks }));
    const reading = async (ship: Nexus) =>
      (await call(ship, 'GET', '/sim')).body as ShipReading;
    const helmUsage =
      'It takes course with a charted star to steer for and burn with a level from 0 to 1.';
    const refusals = [
      {
        sent: { system: 'helm', action: 'burn', level: 1.5 },
        message: `helm burn got an argument it cannot use. ${helmUsage}`,
        fix: 'send the arguments in the ranges above.',
      },
      {
        sent: { system: 'helm', action: 'course' },
        message: `helm course got an argument it cannot use. ${helmUsage}`,
        fix: 'send the arguments in the ranges above.',
      },
      {
        sent: { system: 'helm', action: 'flip' },
        message: `helm has no action 'flip'. ${helmUsage}`,
        fix: 'send one of the actions above with its arguments.',
      },
    ];

    test('a course and a burn on the linked ship shed both loads at tick 1 and turn the ship at tick 2', async ({
      nexus,
    }) => {
      for (const command of [throttle, course, burn]) {
        expect(await call(nexus, 'POST', '/commands', command)).toEqual({
          status: 202,
          body: { tick: 1 },
        });
      }
      expect(nexus.get(AUDIT_LOG).calls).toEqual([
        'has Kepler-442b',
        'plot Kepler-442b',
      ]);

      await advance(nexus, 1);
      const shed = await reading(nexus);
      expect(shed.setpoints.helm).toEqual({ heading: 0.733 });
      expect(shed.setpoints.drive).toEqual({ throttle: 1 });
      expect(shed.helm).toEqual({ attitude: 0, rate: 0, torque: 0 });
      expect(shed.power.loads).toContainEqual({
        id: 'thrusters',
        priority: 4,
        demand: 20_000_000,
        allocated: 0,
      });
      expect(shed.power.loads).toContainEqual({
        id: 'main-drive',
        priority: 5,
        demand: 600_000_000,
        allocated: 0,
      });
      expect(shed.power.shed).toEqual(['thrusters', 'main-drive']);
      expect(shed.safety.alarms).toEqual([
        { code: 'LOAD_SHED', subject: 'thrusters' },
        { code: 'LOAD_SHED', subject: 'main-drive' },
      ]);

      await advance(nexus, 1);
      const turning = await reading(nexus);
      expect(turning.helm).toEqual({
        attitude: 0.0003788,
        rate: 0.0007576,
        torque: 5_000_000,
      });
      expect(turning.power.loads).toContainEqual({
        id: 'thrusters',
        priority: 4,
        demand: 20_000_000,
        allocated: 20_000_000,
      });
      expect(turning.power.shed).toEqual(['main-drive']);
      expect(turning.safety.alarms).toEqual([
        { code: 'LOAD_SHED', subject: 'main-drive' },
      ]);
      expect(
        nexus
          .get(AUDIT_LOG)
          .calls.filter(
            (entry) => entry.startsWith('has ') || entry.startsWith('plot '),
          ),
      ).toEqual(['has Kepler-442b', 'plot Kepler-442b']);
      expect(await call(nexus, 'GET', '/commands')).toEqual({
        status: 200,
        body: [
          {
            tick: 1,
            change: {
              reactor: { throttle: 0.6 },
              helm: { heading: (42 * Math.PI) / 180 },
              drive: { throttle: 1 },
            },
          },
        ],
      });
    });

    test('a course to TRAPPIST-1e on the offline ship steers the bundled heading', async () => {
      await using ship = await Nexus.create(OfflineMeridian, {
        plugins: bridgePlugins(),
      });
      expect(
        await call(
          ship,
          'POST',
          '/commands',
          json({ system: 'helm', action: 'course', to: 'TRAPPIST-1e' }),
        ),
      ).toEqual({ status: 202, body: { tick: 1 } });
      expect(ship.get(AUDIT_LOG).calls).toEqual([]);
      await advance(ship, 1);
      expect((await reading(ship)).setpoints.helm.heading).toBe(-2.74);
    });

    const refused = async (ship: Nexus) => {
      for (const { sent, message, fix } of refusals) {
        expect(await call(ship, 'POST', '/commands', json(sent))).toEqual({
          status: 400,
          body: { code: 'MERIDIAN_BAD_COMMAND', message, fix },
        });
      }
      expect(ship.get(SHIP_STATE).log()).toEqual([]);
    };

    test('POST /commands answers 400 for a bad helm command on the linked ship', async ({
      nexus,
    }) => {
      await refused(nexus);
    });

    test('POST /commands answers 400 for a bad helm command on the offline ship', async () => {
      await using ship = await Nexus.create(OfflineMeridian, {
        plugins: bridgePlugins(),
      });
      await refused(ship);
    });

    test.each(['Vega', 'constructor', '__proto__'])(
      'POST /commands answers 400 for a course to %s on the offline ship, which the charts do not hold',
      async (to) => {
        await using ship = await Nexus.create(OfflineMeridian, {
          plugins: bridgePlugins(),
        });
        expect(
          await call(
            ship,
            'POST',
            '/commands',
            json({ system: 'helm', action: 'course', to }),
          ),
        ).toEqual({
          status: 400,
          body: {
            code: 'MERIDIAN_BAD_COMMAND',
            message: `helm course got an argument it cannot use. ${helmUsage}`,
            fix: 'send the arguments in the ranges above.',
          },
        });
        await advance(ship, 1);
        const after = await reading(ship);
        expect(after.setpoints.helm).toEqual({ heading: 0 });
        expect(
          after.safety.alarms.filter((alarm) => alarm.code === 'LOAD_SHED'),
        ).toEqual([]);
      },
    );
  },
);
