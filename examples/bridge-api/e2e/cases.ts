import type { Nexus, NexusPlugin, TraceEvent } from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { nodeScopes } from '@nexusdi/node';
import { Context } from 'hono';

import type { StartBridge } from './servers';

/**
 * What a leg gives the cases: how to serve a container, which graph to
 * build, and how to report a mismatch. The Node suite (bridge.e2e.ts) runs
 * the cases under Vitest for each framework; Deno and Bun run them through
 * test/runtime/smoke.ts.
 */
export interface Leg {
  /** The framework the leg serves. The probe case is Hono's alone. */
  readonly framework: 'hono' | 'express' | 'fastify';
  readonly start: StartBridge;
  /** The leg's graph, built with `plugins`. */
  ship(plugins?: NexusPlugin[]): Promise<Nexus>;
  /** Fails the case when `actual` differs from `expected`. */
  check(what: string, actual: unknown, expected: unknown): void;
  /** Runs after a function-form case, for checks of the leg's own graph. */
  afterFunctionForm?(): void;
}

export interface Case {
  readonly name: string;
  readonly frameworks?: readonly Leg['framework'][];
  run(leg: Leg): Promise<void>;
}

interface Running {
  readonly url: string;
  readonly ship: Nexus;
  count(type: TraceEvent['type']): number;
}

/** Starts the leg's graph with a trace, runs `body`, then stops the server and the container. */
async function withBridge(
  leg: Leg,
  body: (running: Running) => Promise<void>,
  scopes?: ReturnType<typeof nodeScopes>,
): Promise<void> {
  const events: TraceEvent[] = [];
  const ship = await leg.ship([trace((event) => events.push(event))]);
  const count = (type: TraceEvent['type']) =>
    events.filter((e) => e.type === type).length;
  const bridge = await leg.start(ship, scopes);
  try {
    await body({ url: bridge.url, ship, count });
  } finally {
    await bridge.close();
    await ship[Symbol.asyncDispose]();
  }
}

/** Waits up to 2 s for `test`, for disposal that runs after the response ends. */
async function eventually(
  leg: Leg,
  what: string,
  test: () => boolean,
): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!test() && Date.now() <= deadline)
    await new Promise((resolve) => setTimeout(resolve, 10));
  leg.check(what, test(), true);
}

/** The bridge API's cases, the same on every leg (spec 9.8). */
export const cases: readonly Case[] = [
  {
    name: 'plots a course with the charts and the request mission',
    run: (leg) =>
      withBridge(leg, async ({ url }) => {
        const res = await fetch(`${url}/course/Kepler-442b`, {
          headers: { 'x-mission-id': 'survey-7' },
        });
        leg.check('course', await res.json(), {
          course: { to: 'Kepler-442b', heading: 42 },
          entries: ['survey-7: plotting Kepler-442b'],
        });
      }),
  },
  {
    name: 'gives 50 concurrent requests 50 scopes and no shared flight log',
    run: (leg) =>
      withBridge(leg, async ({ url, count }) => {
        const bodies = await Promise.all(
          Array.from({ length: 50 }, (_, i) =>
            fetch(`${url}/course/Proxima-b`, {
              headers: { 'x-mission-id': `survey-${i}` },
            }).then((r) => r.json() as Promise<{ entries: string[] }>),
          ),
        );
        leg.check(
          '50 flight logs',
          bodies.map((body) => body.entries),
          Array.from({ length: 50 }, (_, i) => [
            `survey-${i}: plotting Proxima-b`,
          ]),
        );
        await eventually(
          leg,
          '50 disposals',
          () => count('scope:dispose') === 50,
        );
        leg.check('50 scopes', count('scope:create'), 50);
      }),
  },
  {
    name: 'creates no scope for a route that resolves nothing',
    run: (leg) =>
      withBridge(leg, async ({ url, count }) => {
        leg.check('health', await (await fetch(`${url}/health`)).text(), 'ok');
        leg.check('no scope for health', count('scope:create'), 0);
      }),
  },
  {
    name: 'answers 503 with no NEXUS_ in the body once the container is disposed',
    run: (leg) =>
      withBridge(leg, async ({ url, ship }) => {
        await ship[Symbol.asyncDispose]();
        const res = await fetch(`${url}/course/Kepler-442b`);
        leg.check('disposed status', res.status, 503);
        leg.check(
          'body names no code',
          (await res.text()).includes('NEXUS_'),
          false,
        );
      }),
  },
  {
    name: 'builds a function-form container once for ten first requests',
    async run(leg) {
      let builds = 0;
      let built: Nexus | undefined;
      const bridge = await leg.start(async () => {
        builds += 1;
        built = await leg.ship();
        return built;
      });
      try {
        const statuses = await Promise.all(
          Array.from({ length: 10 }, () =>
            fetch(`${bridge.url}/course/TRAPPIST-1e`).then((r) => r.status),
          ),
        );
        leg.check('statuses', statuses, Array(10).fill(200));
        leg.check('builds', builds, 1);
        leg.afterFunctionForm?.();
      } finally {
        await bridge.close();
        await built?.[Symbol.asyncDispose]();
      }
    },
  },
  {
    name: 'gives a service the request scope through scopes.current()',
    run: (leg) =>
      withBridge(
        leg,
        async ({ url }) => {
          const res = await fetch(`${url}/mission`, {
            headers: { 'x-mission-id': 'survey-3' },
          });
          leg.check('mission', await res.json(), { id: 'survey-3' });
        },
        nodeScopes(),
      ),
  },
  {
    name: 'answers { id: null } on /mission without scopes',
    run: (leg) =>
      withBridge(leg, async ({ url }) => {
        leg.check('mission', await (await fetch(`${url}/mission`)).json(), {
          id: null,
        });
      }),
  },
  {
    name: 'keeps the scope open while the stream writes, then disposes it once',
    run: (leg) =>
      withBridge(leg, async ({ url, count }) => {
        const res = await fetch(`${url}/log/stream`, {
          headers: { 'x-mission-id': 'survey-4' },
        });
        const reader = res.body?.getReader();
        if (reader === undefined) throw new Error('no body');
        const decoder = new TextDecoder();
        let text = decoder.decode((await reader.read()).value);
        // The handler has returned and the first entry is out: the scope
        // stays open for the entries still to come.
        leg.check('open after the first chunk', count('scope:dispose'), 0);
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          text += decoder.decode(value);
        }
        leg.check('tick 3', text.includes('data: survey-4: tick 3'), true);
        await eventually(
          leg,
          'one disposal',
          () => count('scope:dispose') === 1,
        );
      }),
  },
  {
    name: 'disposes the scope when the client aborts mid-stream',
    run: (leg) =>
      withBridge(leg, async ({ url, count }) => {
        const controller = new AbortController();
        const res = await fetch(`${url}/log/stream`, {
          signal: controller.signal,
        });
        await res.body?.getReader().read();
        leg.check('open mid-stream', count('scope:dispose'), 0);
        controller.abort();
        await eventually(
          leg,
          'one disposal',
          () => count('scope:dispose') === 1,
        );
      }),
  },
  {
    name: 'answers 500 with an empty body when the handler resolves an unbound token',
    run: (leg) =>
      withBridge(leg, async ({ url }) => {
        const res = await fetch(`${url}/course/Kepler-442b`, {
          headers: { 'x-mission-id': 'missing-provider' },
        });
        leg.check('status', res.status, 500);
        leg.check('body', await res.text(), '');
      }),
  },
  {
    // A server with no execution context: the adapter reads Hono's getter
    // once, finds nothing and stops looking, and every request still
    // disposes its scope.
    name: 'reads the missing execution context once and still disposes',
    frameworks: ['hono'],
    async run(leg) {
      const descriptor = Object.getOwnPropertyDescriptor(
        Context.prototype,
        'executionCtx',
      );
      let reads = 0;
      Object.defineProperty(Context.prototype, 'executionCtx', {
        ...descriptor,
        get(this: Context) {
          reads += 1;
          return descriptor?.get?.call(this);
        },
      });
      try {
        await withBridge(leg, async ({ url, count }) => {
          for (let i = 0; i < 3; i += 1)
            await (await fetch(`${url}/course/Kepler-442b`)).text();
          await eventually(
            leg,
            'three disposals',
            () => count('scope:dispose') === 3,
          );
          leg.check('executionCtx reads', reads, 1);
        });
      } finally {
        if (descriptor !== undefined)
          Object.defineProperty(Context.prototype, 'executionCtx', descriptor);
      }
    },
  },
];
