import { Nexus } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';
import { describe, expect } from 'vitest';

import { OfflineMeridian } from '../../src/ship/meridian.module';
import { bridgePlugins } from '../../src/ship/plugins';
import { test } from '../fixtures';
import { calls, json, type Payload } from '../route-helpers';
import { FRAMEWORKS } from '../support';

describe.each(FRAMEWORKS)('the weapons commands on %s', (framework) => {
  const call = calls[framework];
  const fire = (range?: unknown) =>
    json({ system: 'weapons', action: 'fire', range });
  const weaponsUsage = 'It takes fire with a range from 0 to 100,000 m.';
  const badRange = (range: unknown) => ({
    status: 400,
    body: {
      code: 'MERIDIAN_BAD_COMMAND',
      message: `weapons fire ${range === undefined ? 'needs' : 'cannot use'} the range argument. ${weaponsUsage}`,
      fix: 'send the arguments in the ranges above.',
    },
  });

  test('two fires on the offline ship charge the capacitor, hit at 10 km on tick 32 and miss at 50 km on tick 36', async () => {
    await using ship = await Nexus.create(OfflineMeridian, {
      plugins: bridgePlugins(),
    });
    const send = (method: 'GET' | 'POST', path: string, payload?: Payload) =>
      call(ship, method, path, payload);
    const advance = (ticks: number) =>
      send('POST', '/sim/advance', json({ ticks }));
    const reading = async () => (await send('GET', '/sim')).body as ShipReading;
    const railgun = (ship: ShipReading) =>
      ship.power.loads.find((load) => load.id === 'railgun');
    const load = (demand: number) => ({
      id: 'railgun',
      priority: 6,
      demand,
      allocated: demand,
    });

    // The first fire arms the mount, so it asks the router for the
    // charger and refuses while the reactor gives nothing.
    expect(await send('POST', '/commands', fire(10_000))).toEqual({
      status: 409,
      body: {
        code: 'MERIDIAN_POWER_BUDGET',
        message:
          'The railgun load needs 300 MW, and the router has 0 MW free beside the loads above it.',
        fix: 'raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.',
      },
    });
    expect(
      await send(
        'POST',
        '/commands',
        json({ system: 'engineering', action: 'throttle', level: 1 }),
      ),
    ).toEqual({ status: 202, body: { tick: 1 } });
    await advance(30);

    for (const range of ['10000', 100_001, -1, undefined]) {
      expect(await send('POST', '/commands', fire(range))).toEqual(
        badRange(range),
      );
    }
    expect(
      await send(
        'POST',
        '/commands',
        json({ system: 'weapons', action: 'reload' }),
      ),
    ).toEqual({
      status: 400,
      body: {
        code: 'MERIDIAN_BAD_COMMAND',
        message: `weapons has no action 'reload'. ${weaponsUsage}`,
        fix: 'send one of the actions above with its arguments.',
      },
    });

    // The bank is empty, so both fires queue for tick 31 and the shot
    // leaves on the second charging tick.
    for (let i = 0; i < 2; i++) {
      expect(await send('POST', '/commands', fire(10_000))).toEqual({
        status: 202,
        body: { tick: 31 },
      });
    }
    await advance(1);
    const charging = await reading();
    expect(charging.weapons).toEqual({
      status: 'charging',
      charge: 150_000_000,
      shots: 0,
      hits: 0,
      lastShot: null,
    });
    expect(charging.setpoints.weapons).toEqual({
      armed: true,
      range: 10_000,
    });
    expect(railgun(charging)).toEqual(load(300_000_000));

    await advance(1);
    const hit = await reading();
    expect(hit.weapons).toEqual({
      status: 'charging',
      charge: 0,
      shots: 1,
      hits: 1,
      lastShot: { tick: 32, range: 10_000, hit: true },
    });
    expect(hit.setpoints.weapons).toEqual({ armed: true, range: null });
    expect(railgun(hit)).toEqual(load(300_000_000));
    expect(hit.coolant.temperature).toBe(507.67563);
    expect(hit.safety.alarms).toEqual([]);

    await advance(3);
    const charged = await reading();
    expect(charged.tick).toBe(35);
    expect(charged.weapons).toEqual({
      status: 'charged',
      charge: 400_000_000,
      shots: 1,
      hits: 1,
      lastShot: { tick: 32, range: 10_000, hit: true },
    });
    expect(railgun(charged)).toEqual(load(200_000_000));

    expect(await send('POST', '/commands', fire(50_000))).toEqual({
      status: 202,
      body: { tick: 36 },
    });
    await advance(1);
    const miss = await reading();
    expect(miss.weapons).toEqual({
      status: 'charging',
      charge: 100_000_000,
      shots: 2,
      hits: 1,
      lastShot: { tick: 36, range: 50_000, hit: false },
    });
    expect(miss.setpoints.weapons).toEqual({ armed: true, range: null });
    expect(await send('GET', '/commands')).toEqual({
      status: 200,
      body: [
        { tick: 1, change: { reactor: { throttle: 1 } } },
        { tick: 31, change: { weapons: { armed: true, range: 10_000 } } },
        { tick: 36, change: { weapons: { range: 50_000 } } },
      ],
    });
  });
});
