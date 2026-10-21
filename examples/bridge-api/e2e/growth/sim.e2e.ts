import { once } from 'node:events';

import { describe, expect, it, vi } from 'vitest';

import type { ShipSetup } from '../../src/ship/meridian';
import { start, urlOf } from '../entry-process';
import { advance, manual, post, readShip, withShip } from './ship';

const live: ShipSetup = { ...manual, mode: 'live' };

/** Advances the ship behind `url` 600 ticks, then reads it back with GET /sim. */
async function sixHundredTicks(url: string) {
  expect(await advance(url, 600, 600)).toMatchObject({ time: 300 });

  const ship = await readShip(url);
  expect(ship.tick).toBe(600);
  // The idle ship has no system yet, so the air holds the deck's 293 K.
  expect(ship.compartments.habitat.temperature).toBe(293);
  expect(ship.compartments.habitat.pressure).toBe(101_300);
}

describe.each(['hono', 'express', 'fastify'] as const)(
  'the simulation on %s',
  (framework) => {
    it('advances a manual ship 600 ticks and reads it back', () =>
      withShip(framework, manual, sixHundredTicks));

    it.each([0, 1.5, 10_001])('answers 400 for %s ticks', (ticks) =>
      withShip(framework, manual, async (url) => {
        expect((await post(url, '/sim/advance', { ticks })).status).toBe(400);
      }),
    );

    it('answers 404 on a live ship and clears its timer on disposal', async () => {
      const set = vi.spyOn(globalThis, 'setInterval');
      const clear = vi.spyOn(globalThis, 'clearInterval');
      try {
        await withShip(framework, live, async (url) => {
          expect((await post(url, '/sim/advance', { ticks: 3 })).status).toBe(
            404,
          );
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
