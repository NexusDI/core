import { Readable } from 'node:stream';
import type { ReadableStream as NodeWebStream } from 'node:stream/web';

import type { ITelemetryFeed } from '@nexusdi/meridian-systems';

import { type FrameRating, telemetryStream } from './telemetry-stream';

/**
 * `telemetryStream` as a Node `Readable`, for the Express and Fastify routes.
 * Destroying the `Readable` cancels the stream, which unsubscribes it from
 * the feed, and `shutdown` and `rating` act as `telemetryStream` says. A zero
 * high-water mark keeps the `Readable` from pulling frames ahead of a slow
 * client, so the stream still holds only the latest. The cast bridges the
 * Workers types' global `ReadableStream`, which `worker-configuration.d.ts`
 * declares, and Node's own.
 */
export const telemetryReadable = (
  feed: ITelemetryFeed,
  shutdown?: AbortSignal,
  rating?: FrameRating,
): Readable =>
  Readable.fromWeb(
    telemetryStream(feed, shutdown, rating) as unknown as NodeWebStream,
    { highWaterMark: 0 },
  );
