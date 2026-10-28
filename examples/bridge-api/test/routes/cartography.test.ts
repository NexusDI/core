import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { Nexus } from '@nexusdi/core';
import { describe, expect } from 'vitest';

import { createBridge as expressBridge } from '../../src/entries/express';
import { createBridge as fastifyBridge } from '../../src/entries/fastify';
import { createBridge as honoBridge } from '../../src/entries/hono';
import { AUDIT_LOG } from '../../src/ship/contracts';
import { OfflineMeridian } from '../../src/ship/meridian.module';
import { bridgePlugins } from '../../src/ship/plugins';
import { test } from '../fixtures';
import { calls } from '../route-helpers';
import { FRAMEWORKS } from '../support';

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

describe.each(FRAMEWORKS)('the course route on %s', (framework) => {
  const call = calls[framework];

  test.each(['constructor', '__proto__'])(
    'GET /course/%s answers heading 0 on the offline ship, whose charts do not hold it',
    async (to) => {
      await using ship = await Nexus.create(OfflineMeridian, {
        plugins: bridgePlugins(),
      });
      expect(await call(ship, 'GET', `/course/${to}`)).toEqual({
        status: 200,
        body: {
          course: { to, heading: 0 },
          entries: [`survey-7: plotting ${to}`],
        },
      });
    },
  );
});
