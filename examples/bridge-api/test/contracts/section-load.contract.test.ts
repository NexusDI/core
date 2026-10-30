import { isNexusError, Nexus, type TraceEvent } from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { FTL_DRIVE } from '@nexusdi/meridian-systems';
import { nodeScopes } from '@nexusdi/node';
import { expect, it } from 'vitest';

import { servers } from '../../e2e/servers';
import { OfflineMeridian } from '../../src/ship/meridian.module';
import { bridgePlugins } from '../../src/ship/plugins';
import { calls, scopedShip } from '../route-helpers';
import { events } from '../sse';
import type { TelemetryFrame } from '../../src/ship/contracts';

it('twenty concurrent POST /sections/ftl build the FTL drive once and each answers 200', async () => {
  const traced: TraceEvent[] = [];
  await using ship = await Nexus.create(OfflineMeridian, {
    plugins: [...bridgePlugins(), trace((event) => traced.push(event))],
  });
  const answers = await Promise.all(
    Array.from({ length: 20 }, () => calls.hono(ship, 'POST', '/sections/ftl')),
  );
  expect(answers.map(({ status }) => status)).toEqual(Array(20).fill(200));
  const built = traced.filter(
    (event) => event.type === 'construct' && event.token === 'FtlDrive',
  );
  expect(built).toHaveLength(1);
  expect(ship.get(FTL_DRIVE)).toBeDefined();
});

it('a telemetry stream opened before the load reads the drive after extend, and the same read without extend throws NEXUS_LOADED_AFTER_SCOPE', async () => {
  const scopes = nodeScopes();
  await using ship = await scopedShip(scopes);
  const bridge = await servers.hono(ship, scopes);
  const abort = new AbortController();
  try {
    const stream = events(
      await fetch(`${bridge.url}/telemetry`, { signal: abort.signal }),
    );
    const frame = async (tick: number): Promise<TelemetryFrame> => {
      for (;;) {
        const message = await stream.next();
        const read = JSON.parse(message?.data ?? '') as TelemetryFrame;
        if (read.tick >= tick) return read;
      }
    };
    expect(await frame(0)).not.toHaveProperty('ftlRating');
    const load = await fetch(`${bridge.url}/sections/ftl`, { method: 'POST' });
    expect(load.status).toBe(200);
    await fetch(`${bridge.url}/sim/advance`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ticks: 1 }),
    });
    // The stream's scope opened before the load, and the bridge extends it.
    expect((await frame(1)).ftlRating?.power).toBe(900_000_000);
  } finally {
    abort.abort();
    await bridge.close();
  }

  await using other = await scopedShip(nodeScopes());
  await using scope = await other.createScope({
    request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
  });
  await other.load((await import('../../src/ship/meridian.module')).FtlDrive);
  let thrown: unknown;
  try {
    scope.get(FTL_DRIVE);
  } catch (error) {
    thrown = error;
  }
  expect(isNexusError(thrown, 'NEXUS_LOADED_AFTER_SCOPE')).toBe(true);
  await scope.extend();
  expect(scope.get(FTL_DRIVE)).toBe(other.get(FTL_DRIVE));
});
