import type {
  FtlRating,
  ITelemetryFeed,
  ShipReading,
} from '@nexusdi/meridian-systems';

import type { TelemetryEvent, TelemetryFrame } from '../ship/contracts';

/** The FTL rating of the frame of `reading`, or undefined for a frame with none. */
export type FrameRating = (
  reading: ShipReading,
) => Promise<FtlRating | undefined>;

/**
 * The headers of `GET /telemetry`. `no-transform` stops a compressing proxy
 * from buffering the stream.
 */
export const SSE_HEADERS = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache, no-transform',
} as const;

const encoder = new TextEncoder();

/**
 * One server-sent event. Each line of `data` gets its own `data:` field, and
 * SSE ends a line at CRLF, CR or LF.
 */
const sse = (event: TelemetryEvent, data: string): Uint8Array =>
  encoder.encode(
    `event: ${event}\n${data
      .split(/\r\n|\r|\n/)
      .map((line) => `data: ${line}\n`)
      .join('')}\n`,
  );

/**
 * Streams `feed` as server-sent events: a `snapshot` event per frame, then
 * one `offline` event with the feed's reason, then the end. The stream keeps
 * only the latest frame the client has not read and enqueues it when the
 * client reads, so a `POST /sim/advance` of 600 ticks queues one frame per
 * client and never 600. A cancel unsubscribes from the feed. When `shutdown`
 * aborts, the stream unsubscribes and ends as the feed's own close does, with
 * `ship offline`, so a server that stops can close before the ship disposes.
 * With `rating`, the stream awaits the rating of each frame before it sends
 * it and adds a defined one as `ftlRating`. A rating that rejects errors the
 * stream.
 */
export function telemetryStream(
  feed: ITelemetryFeed,
  shutdown?: AbortSignal,
  rating?: FrameRating,
): ReadableStream<Uint8Array> {
  let latest: ShipReading | undefined;
  let offline: string | undefined;
  let ended = false;
  let wake: (() => void) | undefined;
  let unsubscribe: () => void = () => {};

  const notify = () => {
    const resolve = wake;
    wake = undefined;
    resolve?.();
  };

  const close = (reason: string) => {
    if (ended || offline !== undefined) return;
    offline = reason;
    shutdown?.removeEventListener('abort', stop);
    notify();
  };

  const stop = () => {
    unsubscribe();
    close('ship offline');
  };

  return new ReadableStream<Uint8Array>(
    {
      start() {
        if (shutdown?.aborted) return close('ship offline');
        // The listener goes on first, so a feed that closes the sink inside
        // subscribe removes it again.
        shutdown?.addEventListener('abort', stop, { once: true });
        unsubscribe = feed.subscribe({
          next(frame) {
            if (ended || offline !== undefined) return;
            latest = frame;
            notify();
          },
          close,
        });
      },
      async pull(controller) {
        while (latest === undefined && offline === undefined && !ended) {
          await new Promise<void>((resolve) => (wake = resolve));
        }
        if (ended) return;
        if (latest !== undefined) {
          const reading = latest;
          latest = undefined;
          const ftlRating =
            rating === undefined ? undefined : await rating(reading);
          const frame: TelemetryFrame =
            ftlRating === undefined ? reading : { ...reading, ftlRating };
          controller.enqueue(sse('snapshot', JSON.stringify(frame)));
          return;
        }
        if (offline !== undefined) {
          ended = true;
          controller.enqueue(sse('offline', offline));
          controller.close();
        }
      },
      cancel() {
        if (ended) return;
        ended = true;
        latest = undefined;
        shutdown?.removeEventListener('abort', stop);
        unsubscribe();
        notify();
      },
    },
    // A zero high-water mark makes the stream pull only for a waiting read,
    // so no frame waits in the queue beside `latest`.
    { highWaterMark: 0 },
  );
}
