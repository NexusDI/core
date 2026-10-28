import { Nexus } from '@nexusdi/core';
import { SHIP_STATE } from '@nexusdi/meridian-systems';
import { describe, expect, vi } from 'vitest';

import { SIM_BODY_LIMIT } from '../../src/bridge/sim-ticks';
import { offlineMeridian } from '../../src/ship/meridian.module';
import { test } from '../fixtures';
import { calls, charset, json, UNREADABLE } from '../route-helpers';
import { FRAMEWORKS } from '../support';

describe.each(FRAMEWORKS)('the command routes on %s', (framework) => {
  const call = calls[framework];
  const throttle = json({
    system: 'engineering',
    action: 'throttle',
    level: 1,
  });

  test('POST /commands queues a throttle for the next tick', async ({
    nexus,
  }) => {
    expect(await call(nexus, 'POST', '/commands', throttle)).toEqual({
      status: 202,
      body: { tick: 1 },
    });
  });

  test('POST /commands answers 409 for shields the idle reactor cannot power', async ({
    nexus,
  }) => {
    const raise = json({
      system: 'engineering',
      action: 'shields',
      raised: true,
    });
    const { status, body } = await call(nexus, 'POST', '/commands', raise);
    expect(status).toBe(409);
    expect(body).toMatchObject({ code: 'MERIDIAN_POWER_BUDGET' });
  });

  test('POST /commands answers 400 for a command the desk cannot read', async ({
    nexus,
  }) => {
    const warp = await call(
      nexus,
      'POST',
      '/commands',
      json({ system: 'warp' }),
    );
    expect(warp.status).toBe(400);
    expect(warp.body).toMatchObject({ code: 'MERIDIAN_BAD_COMMAND' });
  });

  test.for(UNREADABLE)(
    'POST /commands answers 400 for %s',
    async ([, payload], { nexus }) => {
      const { status, body } = await call(nexus, 'POST', '/commands', payload);
      expect(status).toBe(400);
      expect(body).toMatchObject({ code: 'MERIDIAN_BAD_COMMAND' });
      // A refused body is never queued, so the log stays empty.
      expect(nexus.get(SHIP_STATE).log()).toEqual([]);
    },
  );

  test('POST /commands reads a JSON media type in any case, with a charset', async ({
    nexus,
  }) => {
    const command = { system: 'engineering', action: 'throttle', level: 1 };
    expect(await call(nexus, 'POST', '/commands', charset(command))).toEqual({
      status: 202,
      body: { tick: 1 },
    });
  });

  test('POST /commands answers 413 for a body over 100 kB', async ({
    nexus,
  }) => {
    const over = json({
      system: 'engineering',
      action: 'throttle',
      level: 1,
      pad: 'x'.repeat(SIM_BODY_LIMIT),
    });
    expect(await call(nexus, 'POST', '/commands', over)).toEqual({
      status: 413,
      body: undefined,
    });
  });

  test('GET /commands answers the log once the tick applies the throttle', async ({
    nexus,
  }) => {
    await call(nexus, 'POST', '/commands', throttle);
    expect(await call(nexus, 'GET', '/commands')).toEqual({
      status: 200,
      body: [],
    });
    await call(nexus, 'POST', '/sim/advance', json({ ticks: 1 }));
    expect(await call(nexus, 'GET', '/commands')).toEqual({
      status: 200,
      body: [{ tick: 1, change: { reactor: { throttle: 1 } } }],
    });
  });

  test('POST /commands queues on a live ship', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    try {
      await using ship = await Nexus.create(
        offlineMeridian({ sim: { seed: 7, dt: 0.5 }, mode: 'live' }),
      );
      expect(await call(ship, 'POST', '/commands', throttle)).toEqual({
        status: 202,
        body: { tick: 1 },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
