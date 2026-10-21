import type {
  ITelemetryFeed,
  ShipReading,
  TelemetrySink,
} from '@nexusdi/meridian-systems';
import { describe, expect, it, vi } from 'vitest';

import { SSE_HEADERS, telemetryStream } from '../src/bridge/telemetry-stream';
import type { TelemetryEvent } from '../src/ship/contracts';

/** A frame with no compartments: the stream frames whatever JSON it gets. */
const frameAt = (tick: number): ShipReading => ({
  tick,
  time: tick / 2,
  compartments: {} as ShipReading['compartments'],
});

const sse = (event: TelemetryEvent, data: string) =>
  `event: ${event}\ndata: ${data}\n\n`;

/** Records the one sink the stream subscribes and counts its unsubscribes. */
class FakeFeed implements ITelemetryFeed {
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
    const reader = telemetryStream(new FakeFeed()).getReader();
    expect(await read(reader)).toBe(
      sse('snapshot', JSON.stringify(frameAt(0))),
    );
  });

  it('keeps only the latest frame while nobody reads', async () => {
    const feed = new FakeFeed();
    const reader = telemetryStream(feed).getReader();
    for (let tick = 1; tick <= 600; tick += 1) feed.sink?.next(frameAt(tick));
    expect(await read(reader)).toBe(
      sse('snapshot', JSON.stringify(frameAt(600))),
    );
  });

  it('waits for the next frame once the reader has the latest', async () => {
    const feed = new FakeFeed();
    const reader = telemetryStream(feed).getReader();
    await read(reader);
    const next = read(reader);
    feed.sink?.next(frameAt(1));
    expect(await next).toBe(sse('snapshot', JSON.stringify(frameAt(1))));
  });

  it('sends an offline event on close and then ends', async () => {
    const feed = new FakeFeed();
    const reader = telemetryStream(feed).getReader();
    await read(reader);
    feed.sink?.close('ship offline');
    expect(await read(reader)).toBe(sse('offline', 'ship offline'));
    expect(await read(reader)).toBe('done');
  });

  it('sends the unsent frame before the offline event', async () => {
    const feed = new FakeFeed();
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
    const feed = new FakeFeed();
    const reader = telemetryStream(feed).getReader();
    await read(reader);
    feed.sink?.close('reactor\nscram');
    expect(await read(reader)).toBe(
      'event: offline\ndata: reactor\ndata: scram\n\n',
    );
  });

  it('splits data at CRLF and CR as well as LF', async () => {
    const feed = new FakeFeed();
    const reader = telemetryStream(feed).getReader();
    await read(reader);
    feed.sink?.close('reactor\r\nscram\rcold');
    expect(await read(reader)).toBe(
      'event: offline\ndata: reactor\ndata: scram\ndata: cold\n\n',
    );
  });

  it('unsubscribes once on cancel and ends a waiting read', async () => {
    const feed = new FakeFeed();
    const stream = telemetryStream(feed);
    const reader = stream.getReader();
    await read(reader);
    const pending = read(reader);
    await reader.cancel();
    expect(await pending).toBe('done');
    expect(feed.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('ignores a frame after close', async () => {
    const feed = new FakeFeed();
    const reader = telemetryStream(feed).getReader();
    await read(reader);
    feed.sink?.close('ship offline');
    expect(() => feed.sink?.next(frameAt(1))).not.toThrow();
    expect(await read(reader)).toBe(sse('offline', 'ship offline'));
    expect(await read(reader)).toBe('done');
  });

  it('names the event-stream type and turns off proxy transforms', () => {
    expect(SSE_HEADERS).toEqual({
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
    });
  });
});
