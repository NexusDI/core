import { Nexus } from '@nexusdi/core';
import * as tools from '@nexusdi/devtools';
import {
  SUBSPACE_LINK,
  shipNotes,
  type ShipReading,
} from '@nexusdi/meridian-systems';
import { expect, it } from 'vitest';

import { OfflineMeridian } from '../../src/ship/meridian.module';
import { bridgePlugins } from '../../src/ship/plugins';
import { calls, json } from '../route-helpers';

it('the ship without SubspaceLink starts, queues a hail, reads no subspace link and serves the bundled charts', async () => {
  await using ship = await Nexus.create(OfflineMeridian, {
    plugins: [
      ...bridgePlugins({ dev: true }),
      tools.devtools({ annotate: [shipNotes] }),
    ],
  });
  // optional(SUBSPACE_LINK) leaves the array's dependency unbound.
  expect(ship.has(SUBSPACE_LINK)).toBe(false);

  // graph() lists the unbound dep on each provider that declared it optional.
  const unresolved = (token: string) =>
    tools.graph(ship).providers.find((provider) => provider.token === token)
      ?.unresolved;
  expect(unresolved('CommsArray')).toContain('SubspaceLink');
  expect(unresolved('NavCharts')).toContain('SubspaceLink');

  const call = calls.hono;
  expect(
    await call(
      ship,
      'POST',
      '/commands',
      json({ system: 'comms', action: 'hail' }),
    ),
  ).toMatchObject({
    status: 202,
    body: { tick: 1, notice: { code: 'MERIDIAN_NO_SUBSPACE_LINK' } },
  });
  await call(ship, 'POST', '/sim/advance', json({ ticks: 1 }));
  const { body } = await call(ship, 'GET', '/sim');
  const reading = body as ShipReading;
  expect(reading.comms.status).toBe('no subspace link');
  expect(reading.setpoints.comms.hail).toBe(true);

  expect(await call(ship, 'GET', '/course/Kepler-442b')).toMatchObject({
    status: 200,
    body: { course: { to: 'Kepler-442b', heading: 42 } },
  });
});
