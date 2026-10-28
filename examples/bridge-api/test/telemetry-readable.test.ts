import { once } from 'node:events';

import type { ITelemetryFeed } from '@nexusdi/meridian-systems';
import { describe, expect, it, vi } from 'vitest';

import { telemetryReadable } from '../src/bridge/telemetry-readable';

const reader = {
  read: vi.fn<() => Promise<ReadableStreamReadResult<Uint8Array>>>(),
  cancel: vi.fn<() => Promise<void>>(),
};

vi.mock('../src/bridge/telemetry-stream', () => ({
  telemetryStream: () => ({ getReader: () => reader }),
}));

const feed = {} as ITelemetryFeed;

describe('telemetryReadable', () => {
  it('errors with the error the reader rejects', async () => {
    const failure = new Error('the stream broke');
    reader.read.mockReset().mockRejectedValue(failure);
    reader.cancel.mockReset().mockResolvedValue();
    const readable = telemetryReadable(feed);
    const [error] = await Promise.all([
      once(readable, 'error'),
      readable.resume(),
    ]);
    expect(error).toEqual([failure]);
  });

  it('cancels the reader when it is destroyed', async () => {
    reader.read.mockReset().mockReturnValue(new Promise(() => {}));
    reader.cancel.mockReset().mockResolvedValue();
    const readable = telemetryReadable(feed);
    readable.resume();
    readable.destroy();
    await once(readable, 'close');
    expect(reader.cancel).toHaveBeenCalledTimes(1);
  });
});
