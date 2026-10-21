import { once } from 'node:events';

import { Nexus } from '@nexusdi/core';
import {
  DECK_PLAN,
  readShip,
  SHIP_STATE,
  type ShipReading,
  TELEMETRY,
} from '@nexusdi/meridian-systems';
import { createTestingContainer } from '@nexusdi/testing';
import { describe, expect, it, vi } from 'vitest';

import type { TelemetryEvent } from '../../src/ship/contracts';
import { offlineMeridian, type ShipSetup } from '../../src/ship/meridian';
import { bridgePlugins } from '../../src/ship/plugins';
import { RecordingFeed } from '../../test/doubles';
import { start, urlOf } from '../entry-process';
import { servers } from '../servers';

const manual: ShipSetup = { sim: { seed: 7, dt: 0.5 }, mode: 'manual' };

interface TelemetryMessage {
  readonly event: TelemetryEvent;
  readonly data: string;
}

/**
 * Reads the server-sent events of a `GET /telemetry` body one at a time. A
 * socket may split one event over two chunks or join two in one, so the
 * reader buffers text up to each blank line.
 */
function events(res: Response) {
  if (res.body === null) throw new Error('GET /telemetry sent no body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  return {
    /** The next event, or `undefined` once the body ends. */
    async next(): Promise<TelemetryMessage | undefined> {
      while (!buffered.includes('\n\n')) {
        const { done, value } = await reader.read();
        if (done) return undefined;
        buffered += decoder.decode(value, { stream: true });
      }
      const end = buffered.indexOf('\n\n');
      const lines = buffered.slice(0, end).split('\n');
      buffered = buffered.slice(end + 2);
      const field = (name: string) =>
        lines
          .filter((line) => line.startsWith(`${name}: `))
          .map((line) => line.slice(name.length + 2));
      return {
        event: field('event')[0] as TelemetryEvent,
        data: field('data').join('\n'),
      };
    },
    /** The tick of the next event, which must be a `snapshot`. */
    async tick(): Promise<number> {
      const message = await this.next();
      expect(message?.event).toBe('snapshot');
      return (JSON.parse(message?.data ?? '') as ShipReading).tick;
    },
  };
}

const advance = (url: string, ticks: number) =>
  fetch(`${url}/sim/advance`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ticks }),
  });

describe.each(['hono', 'express', 'fastify'] as const)(
  'GET /telemetry on %s',
  (framework) => {
    it('streams tick 0 at once and reaches tick 3 after an advance of 3', async () => {
      await using ship = await Nexus.create(offlineMeridian(manual), {
        plugins: bridgePlugins(),
      });
      const bridge = await servers[framework](ship);
      const abort = new AbortController();
      try {
        const res = await fetch(`${bridge.url}/telemetry`, {
          signal: abort.signal,
        });
        expect(res.status).toBe(200);
        const stream = events(res);
        expect(await stream.tick()).toBe(0);

        expect((await advance(bridge.url, 3)).status).toBe(200);
        // The stream keeps only the latest unread frame, so ticks 1 and 2
        // may never reach the client.
        let tick = 0;
        while (tick < 3) tick = await stream.tick();
        expect(tick).toBe(3);
      } finally {
        abort.abort();
        await bridge.close();
      }
    });

    it('unsubscribes from the feed when the client aborts', async () => {
      await using probe = await createTestingContainer(
        offlineMeridian(manual),
      ).create();
      const feed = new RecordingFeed(
        readShip(probe.get(SHIP_STATE).snapshot(), probe.get(DECK_PLAN)),
      );
      await using ship = await createTestingContainer(offlineMeridian(manual))
        .override(TELEMETRY, { useValue: feed })
        .create();
      const bridge = await servers[framework](ship);
      try {
        const abort = new AbortController();
        const res = await fetch(`${bridge.url}/telemetry`, {
          signal: abort.signal,
        });
        expect(await events(res).tick()).toBe(0);
        expect(feed.sinks.size).toBe(1);
        abort.abort();
        await vi.waitFor(() => expect(feed.sinks.size).toBe(0), {
          timeout: 5_000,
        });
      } finally {
        await bridge.close();
      }
    });

    it('sends ship offline and ends the body when the ship is disposed', async () => {
      // The case disposes the ship itself. A second dispose at the end of
      // the block returns the first one's promise.
      await using ship = await Nexus.create(offlineMeridian(manual), {
        plugins: bridgePlugins(),
      });
      const bridge = await servers[framework](ship);
      try {
        const stream = events(await fetch(`${bridge.url}/telemetry`));
        expect(await stream.tick()).toBe(0);

        await ship[Symbol.asyncDispose]();
        expect(await stream.next()).toEqual({
          event: 'offline',
          data: 'ship offline',
        });
        expect(await stream.next()).toBeUndefined();
      } finally {
        await bridge.close();
      }
    });
  },
);

describe.each(['hono', 'express', 'fastify'])(
  'the %s server entry',
  (framework) => {
    it('ends an open telemetry stream and exits 0 at once on SIGTERM', async () => {
      const child = start(`server.${framework}.ts`);
      const { url, stderr } = await urlOf(child);
      const stream = events(await fetch(`${url}/telemetry`));
      expect(await stream.tick()).toBe(0);

      const exited = once(child, 'exit');
      const sent = performance.now();
      child.kill('SIGTERM');
      expect(await stream.next()).toEqual({
        event: 'offline',
        data: 'ship offline',
      });
      const [code, signal] = await exited;
      expect({ code, signal }, stderr()).toEqual({ code: 0, signal: null });
      // The client's fetch keeps its connection alive. The entry closes it
      // once the stream ends, so the exit waits for no keep-alive timeout.
      expect(performance.now() - sent).toBeLessThan(1_500);
    });
  },
);
