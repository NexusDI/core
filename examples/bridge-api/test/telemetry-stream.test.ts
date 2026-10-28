import type { Scope } from '@nexusdi/core';
import {
  FTL_DRIVE,
  type FtlStatus,
  type ITelemetryFeed,
  type ShipReading,
  type TelemetrySink,
} from '@nexusdi/meridian-systems';
import { describe, expect, it, vi } from 'vitest';

import { ftlRating } from '../src/bridge/ftl';
import { SSE_HEADERS, telemetryStream } from '../src/bridge/telemetry-stream';
import type { TelemetryEvent } from '../src/ship/contracts';

/** A frame of tick and time only: the stream frames whatever JSON it gets. */
const frameAt = (tick: number) => ({ tick, time: tick / 2 }) as ShipReading;

const sse = (event: TelemetryEvent, data: string) =>
  `event: ${event}\ndata: ${data}\n\n`;

/** Records the one sink the stream subscribes and counts its unsubscribes. */
class RecordingStreamFeed implements ITelemetryFeed {
  sink: TelemetrySink | undefined;
  readonly unsubscribe = vi.fn();
  constructor(private readonly first: ShipReading = frameAt(0)) {}
  subscribe(sink: TelemetrySink) {
    this.sink = sink;
    sink.next(this.first);
    return this.unsubscribe;
  }
}

const decoder = new TextDecoder();
async function read(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { done, value } = await reader.read();
  return done ? 'done' : decoder.decode(value);
}

describe('telemetryStream', () => {
  it('sends the frame the feed gives at subscribe as a snapshot event', async () => {
    const reader = telemetryStream(new RecordingStreamFeed()).getReader();
    expect(await read(reader)).toBe(
      sse('snapshot', JSON.stringify(frameAt(0))),
    );
  });

  it('keeps only the latest frame while nobody reads', async () => {
    const feed = new RecordingStreamFeed();
    const reader = telemetryStream(feed).getReader();
    for (let tick = 1; tick <= 600; tick += 1) feed.sink?.next(frameAt(tick));
    expect(await read(reader)).toBe(
      sse('snapshot', JSON.stringify(frameAt(600))),
    );
  });

  it('waits for the next frame once the reader has the latest', async () => {
    const feed = new RecordingStreamFeed();
    const reader = telemetryStream(feed).getReader();
    await read(reader);
    const next = read(reader);
    feed.sink?.next(frameAt(1));
    expect(await next).toBe(sse('snapshot', JSON.stringify(frameAt(1))));
  });

  it('sends an offline event on close and then ends', async () => {
    const feed = new RecordingStreamFeed();
    const reader = telemetryStream(feed).getReader();
    await read(reader);
    feed.sink?.close('ship offline');
    expect(await read(reader)).toBe(sse('offline', 'ship offline'));
    expect(await read(reader)).toBe('done');
  });

  it('sends the unsent frame before the offline event', async () => {
    const feed = new RecordingStreamFeed();
    const reader = telemetryStream(feed).getReader();
    feed.sink?.close('ship offline');
    expect(await read(reader)).toBe(
      sse('snapshot', JSON.stringify(frameAt(0))),
    );
    expect(await read(reader)).toBe(sse('offline', 'ship offline'));
    expect(await read(reader)).toBe('done');
  });

  it('ends when the feed closes during subscribe', async () => {
    const closed: ITelemetryFeed = {
      subscribe(sink) {
        sink.close('ship offline');
        return () => {};
      },
    };
    const reader = telemetryStream(closed).getReader();
    expect(await read(reader)).toBe(sse('offline', 'ship offline'));
    expect(await read(reader)).toBe('done');
  });

  it('writes each line of a reason on its own data line', async () => {
    const feed = new RecordingStreamFeed();
    const reader = telemetryStream(feed).getReader();
    await read(reader);
    feed.sink?.close('reactor\nscram');
    expect(await read(reader)).toBe(
      'event: offline\ndata: reactor\ndata: scram\n\n',
    );
  });

  it('splits data at CRLF and CR as well as LF', async () => {
    const feed = new RecordingStreamFeed();
    const reader = telemetryStream(feed).getReader();
    await read(reader);
    feed.sink?.close('reactor\r\nscram\rcold');
    expect(await read(reader)).toBe(
      'event: offline\ndata: reactor\ndata: scram\ndata: cold\n\n',
    );
  });

  it('unsubscribes once on cancel and ends a waiting read', async () => {
    const feed = new RecordingStreamFeed();
    const stream = telemetryStream(feed);
    const reader = stream.getReader();
    await read(reader);
    const pending = read(reader);
    await reader.cancel();
    expect(await pending).toBe('done');
    expect(feed.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('ignores a frame after close', async () => {
    const feed = new RecordingStreamFeed();
    const reader = telemetryStream(feed).getReader();
    await read(reader);
    feed.sink?.close('ship offline');
    expect(() => feed.sink?.next(frameAt(1))).not.toThrow();
    expect(await read(reader)).toBe(sse('offline', 'ship offline'));
    expect(await read(reader)).toBe('done');
  });

  it('unsubscribes and sends ship offline when the shutdown signal aborts', async () => {
    const feed = new RecordingStreamFeed();
    const shutdown = new AbortController();
    const reader = telemetryStream(feed, shutdown.signal).getReader();
    await read(reader);
    shutdown.abort();
    expect(feed.unsubscribe).toHaveBeenCalledTimes(1);
    expect(await read(reader)).toBe(sse('offline', 'ship offline'));
    expect(await read(reader)).toBe('done');
  });

  it('sends ship offline at once and never subscribes after the shutdown signal aborted', async () => {
    const feed = new RecordingStreamFeed();
    const reader = telemetryStream(feed, AbortSignal.abort()).getReader();
    expect(await read(reader)).toBe(sse('offline', 'ship offline'));
    expect(await read(reader)).toBe('done');
    expect(feed.sink).toBeUndefined();
  });

  it('stops listening to the shutdown signal once the stream is cancelled or offline', async () => {
    const feed = new RecordingStreamFeed();
    const shutdown = new AbortController();
    const remove = vi.spyOn(shutdown.signal, 'removeEventListener');
    const cancelled = telemetryStream(feed, shutdown.signal).getReader();
    await read(cancelled);
    await cancelled.cancel();
    const offline = telemetryStream(feed, shutdown.signal).getReader();
    feed.sink?.close('ship offline');
    expect(remove).toHaveBeenCalledTimes(2);

    shutdown.abort();
    expect(feed.unsubscribe).toHaveBeenCalledTimes(1);
    expect(await read(offline)).toBe(
      sse('snapshot', JSON.stringify(frameAt(0))),
    );
    expect(await read(offline)).toBe(sse('offline', 'ship offline'));
  });

  it('leaves no shutdown listener on a stream the feed closes during subscribe', async () => {
    const unsubscribe = vi.fn();
    const closed: ITelemetryFeed = {
      subscribe(sink) {
        sink.close('ship offline');
        return unsubscribe;
      },
    };
    const shutdown = new AbortController();
    const add = vi.spyOn(shutdown.signal, 'addEventListener');
    const remove = vi.spyOn(shutdown.signal, 'removeEventListener');
    const reader = telemetryStream(closed, shutdown.signal).getReader();
    expect(await read(reader)).toBe(sse('offline', 'ship offline'));
    expect(remove.mock.calls.map(([, listener]) => listener)).toEqual(
      add.mock.calls.map(([, listener]) => listener),
    );
    shutdown.abort();
    expect(unsubscribe).not.toHaveBeenCalled();
  });

  it('names the event-stream type and turns off proxy transforms', () => {
    expect(SSE_HEADERS).toEqual({
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
    });
  });
});

describe('telemetryStream with the FTL rating', () => {
  const rating = {
    energy: 90e9,
    power: 900e6,
    pulseShare: 0.1,
    reactorLevel: 0.9,
    coolantLimit: 1_300,
  };
  /** A frame of tick and FTL status only. */
  const ftlAt = (tick: number, status: FtlStatus) =>
    ({ tick, ftl: { status } }) as ShipReading;

  /** A scope that records its extend and get calls and answers the drive's rating. */
  function fakeScope(extend: () => Promise<void> = async () => {}) {
    const calls: string[] = [];
    const scope = {
      extend: vi.fn(async () => {
        calls.push('extend');
        await extend();
      }),
      get: vi.fn((token: unknown) => {
        calls.push('get');
        expect(token).toBe(FTL_DRIVE);
        return { rating };
      }),
    };
    return { calls, scope, frameRating: ftlRating(scope as unknown as Scope) };
  }

  it('calls no extend for a frame whose FTL record reads offline', async () => {
    const { calls, frameRating } = fakeScope();
    const reader = telemetryStream(
      new RecordingStreamFeed(ftlAt(0, 'offline')),
      undefined,
      frameRating,
    ).getReader();
    expect(await read(reader)).toBe(
      sse('snapshot', JSON.stringify(ftlAt(0, 'offline'))),
    );
    expect(calls).toEqual([]);
  });

  it('extends the scope once before it reads the drive on the first frame past offline', async () => {
    const { calls, frameRating } = fakeScope();
    const feed = new RecordingStreamFeed(ftlAt(0, 'offline'));
    const reader = telemetryStream(feed, undefined, frameRating).getReader();
    await read(reader);
    feed.sink?.next(ftlAt(1, 'idle'));
    expect(await read(reader)).toBe(
      sse(
        'snapshot',
        JSON.stringify({ ...ftlAt(1, 'idle'), ftlRating: rating }),
      ),
    );
    expect(calls).toEqual(['extend', 'get']);
  });

  it('reuses the rating for every later frame', async () => {
    const { calls, scope, frameRating } = fakeScope();
    const feed = new RecordingStreamFeed(ftlAt(1, 'idle'));
    const reader = telemetryStream(feed, undefined, frameRating).getReader();
    await read(reader);
    feed.sink?.next(ftlAt(2, 'spooling'));
    expect(await read(reader)).toBe(
      sse(
        'snapshot',
        JSON.stringify({ ...ftlAt(2, 'spooling'), ftlRating: rating }),
      ),
    );
    expect(calls).toEqual(['extend', 'get']);
    expect(scope.extend).toHaveBeenCalledTimes(1);
  });

  it('errors the stream when the extend rejects', async () => {
    const { frameRating } = fakeScope(async () => {
      throw new Error('the scope closed');
    });
    const reader = telemetryStream(
      new RecordingStreamFeed(ftlAt(1, 'idle')),
      undefined,
      frameRating,
    ).getReader();
    await expect(reader.read()).rejects.toThrow('the scope closed');
  });
});
