import type { ShipReading } from '@nexusdi/meridian-systems';
import { expect } from 'vitest';

import type { TelemetryEvent } from '../src/ship/contracts';

export interface TelemetryMessage {
  readonly event: TelemetryEvent;
  readonly data: string;
}

/**
 * Reads the server-sent events of a `GET /telemetry` body one at a time. A
 * socket may split one event over two chunks or join two in one, so the
 * reader buffers text up to each blank line.
 */
export function events(res: Response) {
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
    /** Cancels the body, which ends the stream on the server. */
    cancel: () => reader.cancel(),
  };
}
