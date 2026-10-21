import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { Nexus } from '@nexusdi/core';
import { roundSnapshot, SHIP_STATE } from '@nexusdi/meridian-systems';
import { describe, expect, vi } from 'vitest';

import { createBridge as expressBridge } from '../src/express';
import { createBridge as fastifyBridge } from '../src/fastify';
import { SIM_BODY_LIMIT, TICKS_REFUSED } from '../src/bridge/sim-ticks';
import { createBridge as honoBridge } from '../src/hono';
import { AUDIT_LOG } from '../src/ship/audit-trail.module';
import { offlineMeridian } from '../src/ship/meridian';
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
) => Promise<Answer>;

const json = (body: unknown): Payload => ({
  type: 'application/json',
  text: JSON.stringify(body),
});

/** The status and, for a JSON answer, the parsed body. */
function answerOf(status: number, type: unknown, text: string): Answer {
  const json = String(type ?? '').startsWith('application/json');
  return { status, body: json ? JSON.parse(text) : undefined };
}

const answerOfResponse = async (res: Response): Promise<Answer> =>
  answerOf(res.status, res.headers.get('content-type'), await res.text());

const init = (method: string, payload?: Payload): RequestInit =>
  payload === undefined
    ? { method }
    : {
        method,
        headers: { 'content-type': payload.type },
        body: payload.text,
      };

/** One request to `ship` through each framework's bridge. */
const calls: Readonly<Record<'hono' | 'express' | 'fastify', Call>> = {
  async hono(ship, method, path, payload) {
    return answerOfResponse(
      await honoBridge(ship).request(path, init(method, payload)),
    );
  },
  async express(ship, method, path, payload) {
    const server = expressBridge(ship).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    try {
      return answerOfResponse(
        await fetch(`http://127.0.0.1:${port}${path}`, init(method, payload)),
      );
    } finally {
      server.close();
    }
  },
  async fastify(ship, method, path, payload) {
    const bridge = await fastifyBridge(ship);
    try {
      const res = await bridge.inject({
        method,
        url: path,
        ...(payload === undefined
          ? {}
          : {
              headers: { 'content-type': payload.type },
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
      expect(body).toEqual(roundSnapshot(nexus.get(SHIP_STATE).snapshot()));
      expect(body).toMatchObject({ tick: 0, time: 0 });
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
        roundSnapshot(nexus.get(SHIP_STATE).snapshot()),
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
      expect(
        await call(nexus, 'POST', '/sim/advance', {
          type: 'text/plain',
          text: '{ "ticks": 3 }',
        }),
      ).toEqual(refused);
      expect(nexus.get(SHIP_STATE).snapshot().tick).toBe(0);
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
      expect(over.status).toBe(413);
      expect(nexus.get(SHIP_STATE).snapshot().tick).toBe(0);
      const under = json({ ticks: 3, pad: pad.slice(0, SIM_BODY_LIMIT - 100) });
      expect((await call(nexus, 'POST', '/sim/advance', under)).status).toBe(
        200,
      );
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
