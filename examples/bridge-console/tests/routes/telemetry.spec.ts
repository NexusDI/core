import { afterAll, describe, expect, it, vi } from 'vitest';

import { FakeBridgeLink } from '../doubles';
import { built } from '../support/testing-di';
import { loaderArgs, scopeWith } from './scope-with';

vi.mock('../../app/nexus.server', async () =>
  (await import('../support/testing-di')).shipServer(),
);

const { loader } = await import('../../app/routes/telemetry');

afterAll(() => Promise.all(built.map((s) => s[Symbol.asyncDispose]())));

/** A link whose backend refuses the telemetry stream. */
class RefusedTelemetry extends FakeBridgeLink {
  override async telemetry(): Promise<ReadableStream<Uint8Array>> {
    throw new Error('bridge-api answered 500 for /telemetry');
  }
}

describe('the telemetry resource route', () => {
  it("answers 200 with the SSE headers and the link's body", async () => {
    await using scope = await scopeWith(FakeBridgeLink, built);
    const res = await loader(loaderArgs(scope, '/telemetry'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    // react-router-serve compresses a response it may transform, and the
    // compression buffers the stream.
    expect(res.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(await res.text()).toMatch(/^event: snapshot\ndata: \{"tick":0,/);
  });

  it('answers 503 when the backend refuses the stream', async () => {
    await using scope = await scopeWith(RefusedTelemetry, built);
    const res = await loader(loaderArgs(scope, '/telemetry'));
    expect(res.status).toBe(503);
  });
});
