import { Nexus } from '@nexusdi/core';
import {
  createExecutionContext,
  env,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { describe, expect, it, vi } from 'vitest';

import { honoMissionRoutes } from '../../e2e/fixtures/mission-routes';
import { createBridge } from '../../src/hono';
import { OfflineMeridian } from '../../src/ship/meridian';
import { recorder, until } from './harness';

describe('scope disposal on workerd', () => {
  it('hands the disposal to waitUntil, so it finishes after the response', async () => {
    const seen = recorder();
    const app = createBridge(
      await Nexus.create(OfflineMeridian, { plugins: [seen.plugin] }),
    );
    const ctx = createExecutionContext();
    const res = await app.fetch(
      new Request('https://bridge.test/course/Kepler-442b'),
      env,
      ctx,
    );
    await res.text();
    await waitOnExecutionContext(ctx);
    expect(seen.count('scope:create')).toBe(1);
    expect(seen.count('scope:dispose')).toBe(1);
  });

  it('finds the execution context on every request, so the probe never gives up on it', async () => {
    const app = createBridge(await Nexus.create(OfflineMeridian));
    for (let i = 0; i < 3; i += 1) {
      const ctx = createExecutionContext();
      const waitUntil = vi.spyOn(ctx, 'waitUntil');
      const res = await app.fetch(
        new Request('https://bridge.test/course/Kepler-442b'),
        env,
        ctx,
      );
      await res.text();
      await waitOnExecutionContext(ctx);
      // A probe that had found no context would stop calling waitUntil.
      expect(waitUntil).toHaveBeenCalledTimes(1);
    }
  });

  it('disposes a streaming response when the client aborts', async () => {
    const seen = recorder();
    const app = createBridge(
      await Nexus.create(OfflineMeridian, { plugins: [seen.plugin] }),
      { mount: honoMissionRoutes() },
    );
    const controller = new AbortController();
    const ctx = createExecutionContext();
    const res = await app.fetch(
      new Request('https://bridge.test/log/stream', {
        signal: controller.signal,
      }),
      env,
      ctx,
    );
    const reader = res.body?.getReader();
    if (reader === undefined) throw new Error('no body');
    await reader.read(); // the first entry: the scope is open
    expect(seen.count('scope:dispose')).toBe(0);

    controller.abort();
    if (env.SIGNAL === 'off') await reader.cancel(); // without the flag only the wrapper sees it
    await until(() => seen.count('scope:dispose') === 1);
    await waitOnExecutionContext(ctx);
    expect(seen.count('scope:create')).toBe(1);
  });
});
