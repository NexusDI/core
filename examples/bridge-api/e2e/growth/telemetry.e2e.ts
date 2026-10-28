import { once } from 'node:events';
import { connect } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';

import { Nexus } from '@nexusdi/core';
import {
  DECK_PLAN,
  readShip,
  SHIP_STATE,
  TELEMETRY,
} from '@nexusdi/meridian-systems';
import { createTestingContainer } from '@nexusdi/testing';
import { describe, expect, it, vi } from 'vitest';

import {
  offlineMeridian,
  type ShipSetup,
} from '../../src/ship/meridian.module';
import { bridgePlugins } from '../../src/ship/plugins';
import { RecordingFeed } from '../../test/doubles';
import { events } from '../../test/sse';
import { FRAMEWORKS } from '../../test/support';
import { start, urlOf } from '../entry-process';
import { servers } from '../servers';

const manual: ShipSetup = { sim: { seed: 7, dt: 0.5 }, mode: 'manual' };

const advance = (url: string, ticks: number) =>
  fetch(`${url}/sim/advance`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ticks }),
  });

describe.each(FRAMEWORKS)('GET /telemetry on %s', (framework) => {
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
});

describe.each(FRAMEWORKS)('the %s server entry', (framework) => {
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

  it('answers 200 to a request whose body arrives after SIGTERM', async () => {
    const child = start(`server.${framework}.ts`);
    const { port, stderr } = await urlOf(child);
    // An IPv4 client, since a server on `localhost` can listen on ::1
    // alone or on both ::1 and 127.0.0.1.
    const socket = connect(port, '127.0.0.1');
    await once(socket, 'connect');
    let response = '';
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => (response += chunk));
    const body = JSON.stringify({ ticks: 1 });
    socket.write(
      'POST /sim/advance HTTP/1.1\r\nHost: localhost\r\n' +
        `Content-Type: application/json\r\nContent-Length: ${body.length}\r\n\r\n`,
    );
    // The headers reach the server before the signal, and the body after.
    await sleep(200);
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await sleep(200);
    socket.write(body);

    const closed = once(socket, 'close');
    const [[code, signal]] = await Promise.all([exited, closed]);
    expect(response.split('\r\n')[0], stderr()).toBe('HTTP/1.1 200 OK');
    expect({ code, signal }, stderr()).toEqual({ code: 0, signal: null });
  });
});
