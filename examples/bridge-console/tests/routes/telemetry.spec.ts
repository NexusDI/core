import { describe, expect, vi } from 'vitest';

import { FakeBridgeLink } from '../doubles';
import { loaderArgs, test, withLink } from '../support/console';

vi.mock('../../app/nexus.server', () => import('../support/nexus-server'));

const { loader } = await import('../../app/routes/telemetry');

/** A link whose backend refuses the telemetry stream. */
class RefusedTelemetry extends FakeBridgeLink {
  override async telemetry(): Promise<ReadableStream<Uint8Array>> {
    throw new Error('bridge-api answered 500 for /telemetry');
  }
}

describe('the telemetry resource route', () => {
  test("answers 200 with the SSE headers and the link's body", async ({
    openScope,
  }) => {
    const scope = await openScope();
    const res = await loader(loaderArgs(scope, '/telemetry'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    // react-router-serve compresses a response it may transform, and the
    // compression buffers the stream.
    expect(res.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(await res.text()).toMatch(/^event: snapshot\ndata: \{"tick":0,/);
  });

  test('answers 503 when the backend refuses the stream', async ({
    openScope,
  }) => {
    const scope = await openScope({ overrides: withLink(RefusedTelemetry) });
    const res = await loader(loaderArgs(scope, '/telemetry'));
    expect(res.status).toBe(503);
  });
});
