import { FTL_DRIVE, type ShipReading } from '@nexusdi/meridian-systems';
import { nodeScopes } from '@nexusdi/node';
import { describe, expect } from 'vitest';

import { SIM_BODY_LIMIT } from '../../src/bridge/sim-ticks';
import { test } from '../fixtures';
import { calls, json, type Payload, scopedShip } from '../route-helpers';
import { FRAMEWORKS } from '../support';

describe.each(FRAMEWORKS)('the ftl commands on %s', (framework) => {
  const call = calls[framework];
  const kepler = json({ to: 'Kepler-442b' });
  const unspooled = {
    status: 409,
    body: {
      code: 'MERIDIAN_FTL_NOT_SPOOLED',
      message: 'The FTL drive holds 0 GJ of the 90 GJ a jump needs.',
      fix: 'spool the drive and wait until it holds the full charge, then jump.',
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

  test('POST /ftl/spool loads the drive and charges it, and POST /ftl/jump moves the ship to the charted star', async () => {
    const scopes = nodeScopes();
    await using ship = await scopedShip(scopes);
    const send = (method: 'GET' | 'POST', path: string, payload?: Payload) =>
      call(ship, method, path, payload, { scopes });
    const advance = (ticks: number) =>
      send('POST', '/sim/advance', json({ ticks }));
    const reading = async () => (await send('GET', '/sim')).body as ShipReading;
    const spool = (ship: ShipReading) =>
      ship.power.loads.find((load) => load.id === 'ftl-spool');

    expect(ship.has(FTL_DRIVE)).toBe(false);
    expect(await send('POST', '/ftl/spool')).toEqual({
      status: 409,
      body: {
        code: 'MERIDIAN_POWER_BUDGET',
        message:
          'The ftl-spool load needs 900 MW, and the router has 0 MW free beside the loads above it.',
        fix: 'raise the reactor throttle and wait for the output to climb, or lower a load of higher priority.',
      },
    });
    expect(ship.has(FTL_DRIVE)).toBe(true);

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
    expect(await send('POST', '/ftl/spool')).toEqual({
      status: 202,
      body: { tick: 101 },
    });
    expect(await send('POST', '/ftl/jump', kepler)).toEqual(unspooled);
    expect(await send('POST', '/ftl/jump', json({}))).toEqual(uncharted);
    expect(
      await send('POST', '/ftl/jump', {
        type: 'text/plain',
        text: JSON.stringify({ to: 'Kepler-442b' }),
      }),
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
    expect(await send('POST', '/ftl/spool')).toEqual({
      status: 202,
      body: { tick: 301 },
    });
    expect(await send('POST', '/ftl/jump', kepler)).toEqual({
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

  test('POST /ftl/jump answers an empty 413 for a body over 100 kB', async () => {
    const scopes = nodeScopes();
    await using ship = await scopedShip(scopes);
    const over = json({ to: 'Kepler-442b', pad: 'x'.repeat(SIM_BODY_LIMIT) });
    // Fastify runs onRequest: ftl before it reads the body, so its 413
    // comes after the load. Hono and Express refuse the body first.
    expect(await call(ship, 'POST', '/ftl/jump', over, { scopes })).toEqual({
      status: 413,
      body: undefined,
    });
    expect(ship.has(FTL_DRIVE)).toBe(framework === 'fastify');
  });

  test('POST /ftl/spool reads no body on Hono and Express, and Fastify refuses 2 MiB with a 413', async () => {
    const scopes = nodeScopes();
    await using ship = await scopedShip(scopes);
    const over = json({ pad: 'x'.repeat(2 * 1024 * 1024) });
    const answer = await call(ship, 'POST', '/ftl/spool', over, { scopes });
    if (framework === 'fastify') {
      expect(answer).toEqual({ status: 413, body: undefined });
    } else {
      expect(answer.status).toBe(409);
      expect(answer.body).toMatchObject({ code: 'MERIDIAN_POWER_BUDGET' });
    }
    expect(ship.has(FTL_DRIVE)).toBe(true);
  });

  test('POST /ftl/jump as the first FTL request loads the drive and refuses the jump below a full charge', async () => {
    const scopes = nodeScopes();
    await using ship = await scopedShip(scopes);
    expect(await call(ship, 'POST', '/ftl/jump', kepler, { scopes })).toEqual(
      unspooled,
    );
    expect(ship.has(FTL_DRIVE)).toBe(true);
  });
});
