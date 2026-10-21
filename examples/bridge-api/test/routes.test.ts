import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { Nexus } from '@nexusdi/core';
import { roundSnapshot, SHIP_STATE } from '@nexusdi/meridian-systems';
import { describe, expect, vi } from 'vitest';

import { createBridge as expressBridge } from '../src/express';
import { createBridge as fastifyBridge } from '../src/fastify';
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
type Call = (
  ship: Nexus,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
) => Promise<Answer>;

/** The status and, for a JSON answer, the parsed body. */
function answerOf(status: number, type: unknown, text: string): Answer {
  const json = String(type ?? '').startsWith('application/json');
  return { status, body: json ? JSON.parse(text) : undefined };
}

const answerOfResponse = async (res: Response): Promise<Answer> =>
  answerOf(res.status, res.headers.get('content-type'), await res.text());

const init = (method: string, body: unknown): RequestInit =>
  body === undefined
    ? { method }
    : {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      };

/** One request to `ship` through each framework's bridge. */
const calls: Readonly<Record<'hono' | 'express' | 'fastify', Call>> = {
  async hono(ship, method, path, body) {
    return answerOfResponse(
      await honoBridge(ship).request(path, init(method, body)),
    );
  },
  async express(ship, method, path, body) {
    const server = expressBridge(ship).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    try {
      return answerOfResponse(
        await fetch(`http://127.0.0.1:${port}${path}`, init(method, body)),
      );
    } finally {
      server.close();
    }
  },
  async fastify(ship, method, path, body) {
    const bridge = await fastifyBridge(ship);
    try {
      const res = await bridge.inject({
        method,
        url: path,
        ...(body === undefined ? {} : { payload: body as object }),
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
      const advanced = await call(nexus, 'POST', '/sim/advance', {
        ticks: 3,
      });
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
      expect(
        (await call(nexus, 'POST', '/sim/advance', { ticks: 0 })).status,
      ).toBe(400);
      expect((await call(nexus, 'POST', '/sim/advance')).status).toBe(400);
      expect(nexus.get(SHIP_STATE).snapshot().tick).toBe(0);
    });

    test('POST /sim/advance answers 404 on a live ship', async () => {
      // A faked setInterval keeps the live driver's timer out of the event loop.
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      try {
        await using ship = await Nexus.create(
          offlineMeridian({ sim: { seed: 7, dt: 0.5 }, mode: 'live' }),
        );
        const { status } = await call(ship, 'POST', '/sim/advance', {
          ticks: 3,
        });
        expect(status).toBe(404);
        expect(ship.get(SHIP_STATE).snapshot().tick).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });
  },
);
