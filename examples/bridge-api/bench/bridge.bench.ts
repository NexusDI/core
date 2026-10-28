import { Nexus } from '@nexusdi/core';
import { Hono } from 'hono';
import { test } from 'vitest';

import { createBridge } from '../src/entries/hono';
import { NAV_CHARTS } from '../src/ship/contracts';
import { OfflineMeridian } from '../src/ship/meridian.module';

const ship = await Nexus.create(OfflineMeridian);
const bridge = createBridge(ship);
const charts = ship.get(NAV_CHARTS);
const bare = new Hono().get('/course/:to', (c) =>
  c.json({ course: charts.plot(c.req.param('to')), entries: [] }),
);

test('Nexus.create, warm', async ({ bench }) => {
  await bench('OfflineMeridian', async () => {
    const built = await Nexus.create(OfflineMeridian);
    await built[Symbol.asyncDispose]();
  }).run();
});

test('a request through Hono', async ({ bench }) => {
  await bench.compare(
    bench('bare Hono', async () => {
      await bare.request('/course/Kepler-442b');
    }),
    bench('@nexusdi/hono with inject', async () => {
      await bridge.request('/course/Kepler-442b');
    }),
  );
});
