import { Nexus } from '@nexusdi/core';
import {
  SHIP_STATE,
  SUBSPACE_LINK,
  TICK_LOOP,
} from '@nexusdi/meridian-systems';
import { createTestingContainer } from '@nexusdi/testing';
import { expect, it } from 'vitest';

import { COMMS_LOG } from '../src/ship/contracts';
import { Meridian } from '../src/ship/meridian.module';
import { bridgePlugins } from '../src/ship/plugins';
import { FailingLink } from './doubles';

/** A linked ship over `link`, running at a throttle so the reactor can power a sign-off. */
async function powered(
  link: FailingLink,
  attempts = 3,
  retry: { delayMs: number; deadlineMs?: number } = { delayMs: 0 },
) {
  const ship = await createTestingContainer(Meridian)
    // The plugin wraps class and factory instances, so the double comes from a factory.
    .override(SUBSPACE_LINK, { useFactory: () => link })
    .create({
      plugins: bridgePlugins({ retry: { attempts, ...retry } }),
    });
  ship.get(SHIP_STATE).queue({ reactor: { throttle: 1 } });
  ship.get(TICK_LOOP).advance(20);
  return ship;
}

it('gives up after the configured attempts, rejects with the last failure and still lets the ship dispose', async () => {
  const link = new FailingLink(Infinity);
  await using ship: Nexus = await powered(link, 2);
  await expect(
    ship.get(SUBSPACE_LINK).signOff({ tick: 1, output: 1 }),
  ).rejects.toThrow('the relay dropped sign-off 2');
  expect(link.calls).toBe(2);
  const log = ship.get(COMMS_LOG);
  expect(log.entries).toEqual([
    'link signOff attempt 1 failed',
    'link signOff attempt 2 failed',
  ]);
});

it('leaves the charts download alone: the ship starts and logs nothing', async () => {
  const link = new FailingLink(0);
  await using ship: Nexus = await powered(link);
  await ship.get(SUBSPACE_LINK).signOff({ tick: 1, output: 1 });
  expect(link.calls).toBe(1);
  expect(ship.get(COMMS_LOG).entries).toEqual([]);
});

it('logs a failed attempt and the late answer, which only a bound retry writes', async () => {
  const link = new FailingLink(1);
  await using ship: Nexus = await powered(link);
  await ship.get(SUBSPACE_LINK).signOff({ tick: 1, output: 1 });
  expect(ship.get(COMMS_LOG).entries).toEqual([
    'link signOff attempt 1 failed',
    'link signOff answered on attempt 2',
  ]);
});

it('stops retrying when another attempt would pass the deadline', async () => {
  // A silent relay, scaled down: each call fails only after its 50 ms timeout.
  const link = new FailingLink(Infinity);
  link.signOff = async () => {
    link.calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 50));
    throw new Error('the relay timed out');
  };
  await using ship: Nexus = await powered(link, 3, {
    delayMs: 1,
    deadlineMs: 60,
  });
  const started = Date.now();
  await expect(
    ship.get(SUBSPACE_LINK).signOff({ tick: 1, output: 1 }),
  ).rejects.toThrow('the relay timed out');
  expect(link.calls).toBe(1);
  expect(Date.now() - started).toBeLessThan(100);
});

it('gives a fast-refusing relay every attempt inside the deadline', async () => {
  const link = new FailingLink(Infinity);
  await using ship: Nexus = await powered(link, 3, {
    delayMs: 1,
    deadlineMs: 6000,
  });
  await expect(
    ship.get(SUBSPACE_LINK).signOff({ tick: 1, output: 1 }),
  ).rejects.toThrow('the relay dropped sign-off 3');
  expect(link.calls).toBe(3);
});
