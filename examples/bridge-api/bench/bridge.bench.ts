import { Nexus } from '@nexusdi/core';
import { Hono } from 'hono';
import { bench, describe } from 'vitest';

import { createBridge } from '../src/hono';
import { NAV_CHARTS } from '../src/ship/contracts';
import { OfflineMeridian } from '../src/ship/meridian';

const ship = await Nexus.create(OfflineMeridian);
const bridge = createBridge(ship);
const charts = ship.get(NAV_CHARTS);
const bare = new Hono().get('/course/:to', (c) =>
  c.json({ course: charts.plot(c.req.param('to')), entries: [] }),
);

describe('Nexus.create, warm', () => {
  bench('OfflineMeridian', async () => {
    const built = await Nexus.create(OfflineMeridian);
    await built[Symbol.asyncDispose]();
  });
});

describe('a request through Hono', () => {
  bench('bare Hono', async () => {
    await bare.request('/course/Kepler-442b');
  });
  bench('@nexusdi/hono with inject', async () => {
    await bridge.request('/course/Kepler-442b');
  });
});
