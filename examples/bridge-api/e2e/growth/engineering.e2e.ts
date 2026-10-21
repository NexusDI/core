import { Nexus } from '@nexusdi/core';
import type { ShipSnapshot } from '@nexusdi/meridian-systems';
import { describe, expect, it } from 'vitest';

import { offlineMeridian, type ShipSetup } from '../../src/ship/meridian';
import { bridgePlugins } from '../../src/ship/plugins';
import { servers } from '../servers';

const manual: ShipSetup = { sim: { seed: 7, dt: 0.5 }, mode: 'manual' };

const throttle = { system: 'engineering', action: 'throttle', level: 1 };
const raise = { system: 'engineering', action: 'shields', raised: true };

/** POSTs `body` as JSON to `path` on `url`. */
const post = (url: string, path: string, body: unknown) =>
  fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** Advances the ship behind `url` by `ticks` and checks the tick it reaches. */
async function advance(url: string, ticks: number, tick: number) {
  const advanced = await post(url, '/sim/advance', { ticks });
  expect(advanced.status).toBe(200);
  expect(await advanced.json()).toMatchObject({ tick });
}

/** Serves a fresh offline ship on `framework`, runs `body`, then stops both. */
async function withShip(
  framework: keyof typeof servers,
  setup: ShipSetup,
  body: (url: string) => Promise<void>,
): Promise<void> {
  await using ship = await Nexus.create(offlineMeridian(setup), {
    plugins: bridgePlugins(),
  });
  const bridge = await servers[framework](ship);
  try {
    await body(bridge.url);
  } finally {
    await bridge.close();
  }
}

describe.each(['hono', 'express', 'fastify'] as const)(
  'engineering on %s',
  (framework) => {
    it('raises the shields once the reactor output fits them', () =>
      withShip(framework, manual, async (url) => {
        const throttled = await post(url, '/commands', throttle);
        expect(throttled.status).toBe(202);
        expect(await throttled.json()).toEqual({ tick: 1 });

        // The reactor ramps 0.01 a tick from tick 1, so tick 16 runs at
        // level 0.16 and 193.6 MW of the 1.21 GW full output.
        await advance(url, 16, 16);
        const refused = await post(url, '/commands', raise);
        expect(refused.status).toBe(409);
        expect(await refused.json()).toMatchObject({
          code: 'MERIDIAN_POWER_BUDGET',
          message:
            'The shields load needs 200 MW, and the router has 193.6 MW free beside the loads above it.',
        });

        // Level 0.17 gives 205.7 MW, enough for the grid's 200 MW.
        await advance(url, 1, 17);
        const raised = await post(url, '/commands', raise);
        expect(raised.status).toBe(202);
        expect(await raised.json()).toEqual({ tick: 18 });

        await advance(url, 1, 18);
        const read = await fetch(`${url}/sim`);
        expect(read.status).toBe(200);
        const ship = (await read.json()) as ShipSnapshot;
        expect(ship.reactor.level).toBe(0.18);
        expect(ship.power.loads).toContainEqual(
          expect.objectContaining({ id: 'shields', allocated: 2e8 }),
        );

        // The refused raise was never queued, so the log holds two entries.
        const log = await fetch(`${url}/commands`);
        expect(log.status).toBe(200);
        expect(await log.json()).toEqual([
          { tick: 1, change: { reactor: { throttle: 1 } } },
          { tick: 18, change: { shields: { raised: true } } },
        ]);
      }));
  },
);
