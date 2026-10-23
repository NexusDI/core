import { nodeScopes } from '@nexusdi/node';
import { describe, expect, test } from 'vitest';

import { servers } from '../e2e/servers';
import type { TelemetryFrame } from '../src/ship/contracts';
import { json, type Payload, scopedShip } from './route-helpers';
import { events } from './sse';

/** Reads `stream`'s snapshot frames until the one at `tick`. */
async function frameAt(
  stream: ReturnType<typeof events>,
  tick: number,
): Promise<TelemetryFrame> {
  for (;;) {
    const message = await stream.next();
    expect(message?.event).toBe('snapshot');
    const frame = JSON.parse(message?.data ?? '') as TelemetryFrame;
    if (frame.tick >= tick) return frame;
  }
}

describe.each(['hono', 'express', 'fastify'] as const)(
  'the telemetry stream on %s',
  (framework) => {
    test('sends the rating of the drive a spool loads after the stream opened', async () => {
      const scopes = nodeScopes();
      await using ship = await scopedShip(scopes);
      const bridge = await servers[framework](ship, scopes);
      const post = (path: string, payload?: Payload) =>
        fetch(`${bridge.url}${path}`, {
          method: 'POST',
          ...(payload === undefined
            ? {}
            : {
                headers: { 'content-type': payload.type },
                body: payload.text,
              }),
        });
      try {
        const abort = new AbortController();
        const stream = events(
          await fetch(`${bridge.url}/telemetry`, { signal: abort.signal }),
        );
        const first = await frameAt(stream, 0);
        expect(first.tick).toBe(0);
        expect(first.ftl.status).toBe('offline');
        expect(first).not.toHaveProperty('ftlRating');

        // The cold reactor refuses the spool, and the section has loaded
        // the drive by then.
        expect((await post('/ftl/spool')).status).toBe(409);
        expect((await post('/sim/advance', json({ ticks: 1 }))).status).toBe(
          200,
        );
        const loaded = await frameAt(stream, 1);
        expect(loaded.tick).toBe(1);
        expect(loaded.ftl.status).toBe('idle');
        expect(loaded.ftlRating).toEqual({
          energy: 90_000_000_000,
          power: 900_000_000,
          pulseShare: 0.1,
          reactorLevel: 0.9,
          coolantLimit: 1_300,
        });
        abort.abort();
      } finally {
        await bridge.close();
      }
    });
  },
);
