import { Readable } from 'node:stream';

import type { ITelemetryFeed } from '@nexusdi/meridian-systems';

import { type FrameRating, telemetryStream } from './telemetry-stream';

/**
 * `telemetryStream` as a Node `Readable`, for the Express and Fastify routes.
 * Destroying the `Readable` cancels the stream, which unsubscribes it from
 * the feed, and `shutdown` and `rating` act as `telemetryStream` says. A zero
 * high-water mark keeps the `Readable` from pulling frames ahead of a slow
 * client, so the stream still holds only the latest. The `Readable` pulls
 * through the stream's reader because `Readable.fromWeb` takes Node's
 * `ReadableStream` type, and the Workers types in `worker-configuration.d.ts`
 * declare a global one that does not match it.
 */
export function telemetryReadable(
  feed: ITelemetryFeed,
  shutdown?: AbortSignal,
  rating?: FrameRating,
): Readable {
  const reader = telemetryStream(feed, shutdown, rating).getReader();
  return new Readable({
    highWaterMark: 0,
    read() {
      reader
        .read()
        .then(({ done, value }) => this.push(done ? null : value))
        .catch((error: unknown) => this.destroy(asError(error)));
    },
    destroy(error, done) {
      reader.cancel().then(
        () => done(error),
        (failure: unknown) => done(asError(failure)),
      );
    },
  });
}

const asError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));
