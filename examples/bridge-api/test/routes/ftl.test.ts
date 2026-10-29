import { FTL_DRIVE, type ShipReading } from '@nexusdi/meridian-systems';
import { nodeScopes } from '@nexusdi/node';
import { describe, expect } from 'vitest';

import { test } from '../fixtures';
import { calls, json, type Payload, scopedShip } from '../route-helpers';
import { FRAMEWORKS } from '../support';

describe.each(FRAMEWORKS)('the ftl commands on %s', (framework) => {
  const call = calls[framework];
  const kepler = json({ system: 'ftl', action: 'jump', to: 'Kepler-442b' });
  const unspooled = {
    status: 409,
    body: {
      code: 'MERIDIAN_FTL_NOT_SPOOLED',
      message: 'The FTL drive holds 0 GJ of the 90 GJ a jump needs.',
      fix: 'spool the drive and wait until it holds the full charge, then jump.',
    },
  };
  const missing = {
    status: 400,
    body: {
      code: 'MERIDIAN_BAD_COMMAND',
      message:
        'ftl jump needs the to argument. It takes spool with no arguments and jump with a charted star to jump to.',
      fix: 'send the arguments in the ranges above.',
    },
  };
  const uncharted = {
    status: 400,
    body: {
      code: 'MERIDIAN_BAD_COMMAND',
      message:
        'ftl jump cannot use the to argument. It takes spool with no arguments and jump with a charted star to jump to.',
      fix: 'send the arguments in the ranges above.',
    },
  };

  const RATING = {
    energy: 90_000_000_000,
    power: 900_000_000,
    pulseShare: 0.1,
    reactorLevel: 0.9,
    coolantLimit: 1_300,
  };
  const ftl = (action: string, args: object = {}) =>
    json({ system: 'ftl', action, ...args });

  test('POST /sections/ftl loads the drive, and the ftl commands on POST /commands charge it and move the ship to the charted star', async () => {
    const scopes = nodeScopes();
    await using ship = await scopedShip(scopes);
    const send = (method: 'GET' | 'POST', path: string, payload?: Payload) =>
      call(ship, method, path, payload, { scopes });
    const advance = (ticks: number) =>
      send('POST', '/sim/advance', json({ ticks }));
    const reading = async () => (await send('GET', '/sim')).body as ShipReading;
    const spool = (ship: ShipReading) =>
      ship.power.loads.find((load) => load.id === 'ftl-spool');

    expect(await send('POST', '/commands', ftl('spool'))).toEqual({
      status: 400,
      body: {
        code: 'MERIDIAN_BAD_COMMAND',
        message:
          "No ship system is named 'ftl'. The desk serves comms, engineering, helm, life-support, safety and weapons.",
        fix: 'send the command to one of the systems above.',
      },
    });
    expect(ship.has(FTL_DRIVE)).toBe(false);
    expect(await send('POST', '/sections/ftl')).toEqual({
      status: 200,
      body: { rating: RATING },
    });
    expect(ship.has(FTL_DRIVE)).toBe(true);
    expect(await send('POST', '/sections/ftl')).toEqual({
      status: 200,
      body: { rating: RATING },
    });

    expect(await send('POST', '/commands', ftl('spool'))).toEqual({
      status: 409,
      body: {
        code: 'MERIDIAN_POWER_BUDGET',
        message:
          'The ftl-spool load needs 900 MW, and the router has 0 MW free beside the loads above it.',
        fix: 'raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.',
      },
    });
    const throttle = json({
      system: 'engineering',
      action: 'throttle',
      level: 1,
    });
    expect(await send('POST', '/commands', throttle)).toEqual({
      status: 202,
      body: { tick: 1 },
    });
    await advance(100);
    expect(await send('POST', '/commands', ftl('spool'))).toEqual({
      status: 202,
      body: { tick: 101 },
    });
    expect(await send('POST', '/commands', kepler)).toEqual(unspooled);
    expect(await send('POST', '/commands', ftl('jump'))).toEqual(missing);
    expect(
      await send('POST', '/commands', ftl('jump', { to: 'Vega' })),
    ).toEqual(uncharted);

    await advance(200);
    const charged = await reading();
    expect(charged.tick).toBe(300);
    expect(charged.ftl).toEqual({
      status: 'charged',
      charge: 90_000_000_000,
      sector: 'Sol',
      jumped: null,
    });
    expect(spool(charged)).toEqual({
      id: 'ftl-spool',
      priority: 7,
      demand: 900_000_000,
      allocated: 900_000_000,
    });

    // The drive is armed, so a second spool queues nothing.
    expect(await send('POST', '/commands', ftl('spool'))).toEqual({
      status: 202,
      body: { tick: 301 },
    });
    expect(await send('POST', '/commands', kepler)).toEqual({
      status: 202,
      body: { tick: 301 },
    });
    await advance(1);
    const jumped = await reading();
    expect(jumped.ftl).toEqual({
      status: 'idle',
      charge: 0,
      sector: 'Kepler-442b',
      jumped: 301,
    });
    expect(jumped.setpoints.ftl).toEqual({ armed: false, jump: null });
    expect(jumped.safety.alarms).toEqual([]);
    expect(await send('GET', '/commands')).toEqual({
      status: 200,
      body: [
        { tick: 1, change: { reactor: { throttle: 1 } } },
        { tick: 101, change: { ftl: { armed: true } } },
        { tick: 301, change: { ftl: { jump: 'Kepler-442b' } } },
      ],
    });
  });

  test('POST /sections/ftl reads no body on Hono and Express, and Fastify refuses 2 MiB with a 413', async () => {
    const scopes = nodeScopes();
    await using ship = await scopedShip(scopes);
    const over = json({ pad: 'x'.repeat(2 * 1024 * 1024) });
    const answer = await call(ship, 'POST', '/sections/ftl', over, { scopes });
    if (framework === 'fastify') {
      expect(answer).toEqual({ status: 413, body: undefined });
    } else {
      expect(answer).toEqual({ status: 200, body: { rating: RATING } });
    }
    expect(ship.has(FTL_DRIVE)).toBe(true);
  });

  test.each(['/ftl/spool', '/ftl/jump'])(
    'answers an empty 404 on %s',
    async (path) => {
      const scopes = nodeScopes();
      await using ship = await scopedShip(scopes);
      expect(await call(ship, 'POST', path, kepler, { scopes })).toEqual({
        status: 404,
        body: undefined,
      });
      expect(ship.has(FTL_DRIVE)).toBe(false);
    },
  );
});
