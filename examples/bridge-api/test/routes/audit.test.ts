import { Nexus } from '@nexusdi/core';
import { describe, expect, test } from 'vitest';

import { OfflineMeridian } from '../../src/ship/meridian.module';
import { bridgePlugins } from '../../src/ship/plugins';
import { calls, json } from '../route-helpers';
import { FRAMEWORKS } from '../support';

describe.each(FRAMEWORKS)('GET /audit on %s', (framework) => {
  const call = calls[framework];
  const ship = () =>
    Nexus.create(OfflineMeridian, { plugins: bridgePlugins() });

  test('answers empty lists before any call', async () => {
    await using quiet = await ship();
    expect(await call(quiet, 'GET', '/audit')).toEqual({
      status: 200,
      body: { calls: [], comms: [] },
    });
  });

  test('lists the audited chart calls and one comms entry per hail, in order', async () => {
    await using ship1 = await ship();
    await call(ship1, 'GET', '/course/Kepler-442b');
    await call(
      ship1,
      'POST',
      '/commands',
      json({ system: 'comms', action: 'hail' }),
    );
    await call(
      ship1,
      'POST',
      '/commands',
      json({ system: 'comms', action: 'hail' }),
    );
    expect(await call(ship1, 'GET', '/audit')).toEqual({
      status: 200,
      body: {
        calls: ['plot Kepler-442b'],
        comms: ['hail queued for tick 1', 'hail queued for tick 1'],
      },
    });
  });
});
