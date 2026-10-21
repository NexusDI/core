import { once } from 'node:events';

import { Nexus } from '@nexusdi/core';
import type { ShipSnapshot } from '@nexusdi/meridian-systems';
import { describe, expect, it, vi } from 'vitest';

import { offlineMeridian, type ShipSetup } from '../../src/ship/meridian';
import { bridgePlugins } from '../../src/ship/plugins';
import { start, urlOf } from '../entry-process';
import { servers } from '../servers';

const manual: ShipSetup = { sim: { seed: 7, dt: 0.5 }, mode: 'manual' };
const live: ShipSetup = { ...manual, mode: 'live' };

/** POSTs `body` as JSON to `/sim/advance`. */
const advance = (url: string, body: unknown) =>
  fetch(`${url}/sim/advance`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/** Advances the ship behind `url` 600 ticks, then reads it back with GET /sim. */
async function sixHundredTicks(url: string) {
  const advanced = await advance(url, { ticks: 600 });
  expect(advanced.status).toBe(200);
  expect(await advanced.json()).toMatchObject({ tick: 600, time: 300 });

  const read = await fetch(`${url}/sim`);
  expect(read.status).toBe(200);
  const ship = (await read.json()) as ShipSnapshot;
  expect(ship.tick).toBe(600);
  // The idle ship has no system yet, so the air holds the deck's 293 K.
  expect(ship.compartments.habitat.temperature).toBe(293);
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
  'the simulation on %s',
  (framework) => {
    it('advances a manual ship 600 ticks and reads it back', () =>
      withShip(framework, manual, sixHundredTicks));

    it.each([0, 1.5, 10_001])('answers 400 for %s ticks', (ticks) =>
      withShip(framework, manual, async (url) => {
        expect((await advance(url, { ticks })).status).toBe(400);
      }),
    );

    it('answers 404 on a live ship and clears its timer on disposal', async () => {
      const set = vi.spyOn(globalThis, 'setInterval');
      const clear = vi.spyOn(globalThis, 'clearInterval');
      try {
        await withShip(framework, live, async (url) => {
          expect((await advance(url, { ticks: 3 })).status).toBe(404);
        });
        // The live driver's interval is the one timer the ship starts.
        const timers = set.mock.results.map((result) => result.value);
        expect(timers).toHaveLength(1);
        expect(clear.mock.calls.map(([timer]) => timer)).toContain(timers[0]);
      } finally {
        set.mockRestore();
        clear.mockRestore();
      }
    });
  },
);

describe('the Hono server entry', () => {
  it('runs the manual ship SIM_MODE asks for, 600 ticks over HTTP', async () => {
    const child = start('server.hono.ts');
    const { url } = await urlOf(child);
    await sixHundredTicks(url);

    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    const [code, signal] = await exited;
    expect({ code, signal }).toEqual({ code: 0, signal: null });
  });
});
