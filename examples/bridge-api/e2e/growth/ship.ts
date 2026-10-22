import { Nexus } from '@nexusdi/core';
import type { ShipReading } from '@nexusdi/meridian-systems';
import { nodeScopes } from '@nexusdi/node';
import { expect } from 'vitest';

import { offlineMeridian, type ShipSetup } from '../../src/ship/meridian';
import { bridgePlugins } from '../../src/ship/plugins';
import { servers } from '../servers';

/** The seeded manual ship every growth case starts from. */
export const manual: ShipSetup = { sim: { seed: 7, dt: 0.5 }, mode: 'manual' };

/** POSTs `body` as JSON to `path` on `url`. */
export const post = (url: string, path: string, body: unknown) =>
  fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

/**
 * Advances the ship behind `url` by `ticks`, checks that it reaches `tick`
 * and returns the ship `/sim/advance` answers.
 */
export async function advance(
  url: string,
  ticks: number,
  tick: number,
): Promise<ShipReading> {
  const advanced = await post(url, '/sim/advance', { ticks });
  expect(advanced.status).toBe(200);
  const ship = (await advanced.json()) as ShipReading;
  expect(ship.tick).toBe(tick);
  return ship;
}

/** Reads the ship behind `url` with GET /sim. */
export async function readShip(url: string): Promise<ShipReading> {
  const read = await fetch(`${url}/sim`);
  expect(read.status).toBe(200);
  return (await read.json()) as ShipReading;
}

/**
 * Serves a fresh offline ship on `framework`, runs `body`, then stops both.
 * The ship and the bridge share one `nodeScopes()`, as the Node entries do,
 * so a door command answers its flight log entry.
 */
export async function withShip(
  framework: keyof typeof servers,
  setup: ShipSetup,
  body: (url: string) => Promise<void>,
): Promise<void> {
  const scopes = nodeScopes();
  await using ship = await Nexus.create(offlineMeridian(setup), {
    plugins: bridgePlugins({ scopes }),
  });
  const bridge = await servers[framework](ship, scopes);
  try {
    await body(bridge.url);
  } finally {
    await bridge.close();
  }
}
