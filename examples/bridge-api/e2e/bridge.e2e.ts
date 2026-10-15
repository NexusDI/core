import { Nexus, type TraceEvent } from '@nexusdi/core';
import { nodeScopes, type NodeScopes } from '@nexusdi/node';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { meridian } from '../src/ship/meridian';
import { bridgePlugins } from '../src/ship/plugins';
import { startRelay } from './relay';
import { servers, type StartBridge } from './servers';

let relay: Awaited<ReturnType<typeof startRelay>>;
beforeAll(async () => {
  relay = await startRelay();
});
afterAll(async () => {
  await relay.close();
});

interface Running {
  readonly url: string;
  count(type: TraceEvent['type']): number;
  readonly ship: Nexus;
}

/**
 * Starts `start` over a relay-graph container with a trace, runs `body`,
 * then closes the server and disposes the container.
 */
async function withBridge(
  start: StartBridge,
  body: (running: Running) => Promise<void>,
  scopes?: NodeScopes,
): Promise<void> {
  const events: TraceEvent[] = [];
  const ship = await Nexus.create(meridian(relay.url), {
    plugins: bridgePlugins({ trace: (event) => events.push(event) }),
  });
  const count = (type: TraceEvent['type']) =>
    events.filter((e) => e.type === type).length;
  const bridge = await start(ship, scopes);
  try {
    await body({ url: bridge.url, count, ship });
  } finally {
    await bridge.close();
    await ship[Symbol.asyncDispose]();
  }
}

/** Waits until `check` holds, for disposal that runs after the response ends. */
async function eventually(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('condition not met in 2 s');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe.each(Object.entries(servers))(
  'the bridge API on %s',
  (_name, start) => {
    it('plots a course with the downloaded charts and the request mission', () =>
      withBridge(start, async ({ url }) => {
        const res = await fetch(`${url}/course/Kepler-442b`, {
          headers: { 'x-mission-id': 'survey-7' },
        });
        expect(await res.json()).toEqual({
          course: { to: 'Kepler-442b', heading: 42 },
          entries: ['survey-7: plotting Kepler-442b'],
        });
      }));

    it('gives 50 concurrent requests 50 scopes and no shared flight log', () =>
      withBridge(start, async ({ url, count }) => {
        const bodies = await Promise.all(
          Array.from({ length: 50 }, (_, i) =>
            fetch(`${url}/course/Proxima-b`, {
              headers: { 'x-mission-id': `survey-${i}` },
            }).then((r) => r.json() as Promise<{ entries: string[] }>),
          ),
        );
        bodies.forEach((body, i) =>
          expect(body.entries).toEqual([`survey-${i}: plotting Proxima-b`]),
        );
        await eventually(() => count('scope:dispose') === 50);
        expect(count('scope:create')).toBe(50);
      }));

    it('creates no scope for a route that resolves nothing', () =>
      withBridge(start, async ({ url, count }) => {
        expect(await (await fetch(`${url}/health`)).text()).toBe('ok');
        expect(count('scope:create')).toBe(0);
      }));

    it('answers 503 with no NEXUS_ in the body once the container is disposed', () =>
      withBridge(start, async ({ url, ship }) => {
        await ship[Symbol.asyncDispose]();
        const res = await fetch(`${url}/course/Kepler-442b`);
        expect(res.status).toBe(503);
        expect(await res.text()).not.toContain('NEXUS_');
      }));

    it('builds a function-form container once and downloads the charts once', async () => {
      const before = relay.downloads();
      let builds = 0;
      let built: Nexus | undefined;
      const bridge = await start(async () => {
        builds += 1;
        built = await Nexus.create(meridian(relay.url), {
          plugins: bridgePlugins(),
        });
        return built;
      });
      try {
        await Promise.all(
          Array.from({ length: 10 }, () =>
            fetch(`${bridge.url}/course/TRAPPIST-1e`),
          ),
        );
        expect(builds).toBe(1);
        expect(relay.downloads() - before).toBe(1);
      } finally {
        await bridge.close();
        await built?.[Symbol.asyncDispose]();
      }
    });

    it('gives a service the request scope through scopes.current()', () =>
      withBridge(
        start,
        async ({ url }) => {
          const res = await fetch(`${url}/mission`, {
            headers: { 'x-mission-id': 'survey-3' },
          });
          expect(await res.json()).toEqual({ id: 'survey-3' });
        },
        nodeScopes(),
      ));

    it('answers { id: null } on /mission without scopes', () =>
      withBridge(start, async ({ url }) => {
        expect(await (await fetch(`${url}/mission`)).json()).toEqual({
          id: null,
        });
      }));

    it('keeps the scope open while the stream writes, then disposes it once', () =>
      withBridge(start, async ({ url, count }) => {
        const text = await (
          await fetch(`${url}/log/stream`, {
            headers: { 'x-mission-id': 'survey-4' },
          })
        ).text();
        expect(text).toContain('data: survey-4: tick 3');
        await eventually(() => count('scope:dispose') === 1);
      }));

    it('disposes the scope when the client aborts mid-stream', () =>
      withBridge(start, async ({ url, count }) => {
        const controller = new AbortController();
        const res = await fetch(`${url}/log/stream`, {
          signal: controller.signal,
        });
        const reader = res.body?.getReader();
        if (reader === undefined) throw new Error('no body');
        await reader.read();
        controller.abort();
        await eventually(() => count('scope:dispose') === 1);
      }));

    it('answers 500 with an empty body when the handler resolves an unbound token', () =>
      withBridge(start, async ({ url }) => {
        const res = await fetch(`${url}/course/Kepler-442b`, {
          headers: { 'x-mission-id': 'missing-provider' },
        });
        expect(res.status).toBe(500);
        expect(await res.text()).toBe('');
      }));
  },
);
