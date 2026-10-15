import { get } from 'node:http';
import { Readable } from 'node:stream';

import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  defineModule,
  errorBase,
  Nexus,
  NEXUS_PLUGIN_API,
  provide,
  REQUEST,
  Token,
  type NexusPlugin,
  type NexusRequest,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { nodeScopes } from '@nexusdi/node';

import { nexus } from './index.js';

interface Mission {
  id: string;
  target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
interface INavCharts {
  plot(to: string): { to: string; heading: number };
}

const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const NAV_ROUTES = new Token<readonly string[]>('NavRoutes');

class ShuttleFlightLog implements IFlightLog {
  static deps = [MISSION] as const;
  readonly #entries: string[] = [];
  constructor(private readonly mission: Mission) {}
  record(entry: string) {
    this.#entries.push(`${this.mission.id}: ${entry}`);
  }
  entries() {
    return this.#entries;
  }
}

const BridgeApi = defineModule({
  name: 'BridgeApi',
  providers: [
    provide(MISSION, {
      useFactory: (request: NexusRequest) =>
        request.mission ?? { id: 'survey-7', target: 'Kepler-442b' },
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
    provide(NAV_CHARTS, {
      useValue: { plot: (to: string) => ({ to, heading: 42 }) },
    }),
  ],
  exports: [FLIGHT_LOG, NAV_CHARTS],
});

const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(NAV_ROUTES, { useValue: ['Kepler', 'Gliese'] })],
  exports: [NAV_ROUTES],
});

const StardockOffline = errorBase<'ACME_STARDOCK_OFFLINE', { dock: string }>(
  'ACME_STARDOCK_OFFLINE',
  'StardockOfflineError',
);
const stardock: NexusPlugin = {
  name: 'acme:stardock',
  apiVersion: NEXUS_PLUGIN_API,
  construct: (_instance, _provider, scope) => {
    if (scope !== null) throw new StardockOffline({ dock: '7' });
    return undefined;
  },
};

const mapping = (req: FastifyRequest): NexusRequest => ({
  mission: {
    id: String(req.headers['x-mission-id'] ?? 'survey-7'),
    target: 'Kepler-442b',
  },
});

const apps: FastifyInstance[] = [];
afterEach(async () => {
  for (const app of apps.splice(0)) {
    // Every test has awaited its requests by now. On Node 22.12, plain
    // Fastify's close() waits forever for the socket of a request whose
    // client aborted (Node 24 closes it), so the remaining connections are
    // closed first.
    app.server.closeAllConnections();
    await app.close();
  }
});

async function serve(app: FastifyInstance) {
  apps.push(app);
  return app.listen({ port: 0, host: '127.0.0.1' });
}

async function bridgeWith(plugins: NexusPlugin[] = []) {
  const events: TraceEvent[] = [];
  const ship = await Nexus.create(BridgeApi, {
    plugins: [trace((event) => events.push(event)), ...plugins],
  });
  const count = (type: TraceEvent['type']) =>
    events.filter((event) => event.type === type).length;
  return { ship, count };
}

describe('@nexusdi/fastify on a real server', () => {
  it('disposes the scope after a JSON response', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const app = Fastify();
    await app.register(di.plugin);
    app.get<{ Params: { to: string } }>(
      '/course/:to',
      di.inject(
        { charts: NAV_CHARTS, log: FLIGHT_LOG },
        ({ charts, log }, req) => {
          log.record(`plotting ${req.params.to}`);
          return { course: charts.plot(req.params.to), log: log.entries() };
        },
      ),
    );
    const url = await serve(app);
    const res = await fetch(`${url}/course/Kepler-442b`, {
      headers: { 'x-mission-id': 'survey-9' },
    });
    expect(await res.json()).toEqual({
      course: { to: 'Kepler-442b', heading: 42 },
      log: ['survey-9: plotting Kepler-442b'],
    });
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    await ship[Symbol.asyncDispose]();
  });

  it('keeps the scope open while reply.send(stream) is still reading it', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const app = Fastify();
    await app.register(di.plugin);
    app.get(
      '/stream',
      di.inject({ log: FLIGHT_LOG }, async ({ log }, _req, reply) => {
        async function* chunks() {
          yield '[';
          await new Promise((resolve) => setTimeout(resolve, 30));
          log.record('late');
          yield `${JSON.stringify(log.entries())}]`;
        }
        return reply.send(Readable.from(chunks()));
      }),
    );
    const url = await serve(app);
    expect(await (await fetch(`${url}/stream`)).text()).toBe(
      '[["survey-7: late"]]',
    );
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    await ship[Symbol.asyncDispose]();
  });

  it('disposes the scope when the client aborts mid-stream, where onResponse never fires', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const app = Fastify();
    await app.register(di.plugin);
    app.get(
      '/stream',
      di.inject({ log: FLIGHT_LOG }, async (_deps, _req, reply) => {
        async function* chunks() {
          yield 'first chunk';
          await gate;
        }
        return reply.send(Readable.from(chunks()));
      }),
    );
    const url = await serve(app);
    const abort = new AbortController();
    const res = await fetch(`${url}/stream`, { signal: abort.signal });
    await res.body?.getReader().read();
    abort.abort();
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    release();
    await ship[Symbol.asyncDispose]();
  });

  it('disposes the scope and answers 500 when a handler throws', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const app = Fastify();
    await app.register(di.plugin);
    app.get(
      '/fail',
      di.inject({ log: FLIGHT_LOG }, () => {
        throw new Error('sector not charted');
      }),
    );
    const url = await serve(app);
    expect((await fetch(`${url}/fail`)).status).toBe(500);
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    await ship[Symbol.asyncDispose]();
  });

  it('gives 50 concurrent requests 50 scopes and shares no scoped instance', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const app = Fastify();
    await app.register(di.plugin);
    app.get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }, req) => {
        log.record(String(req.headers['x-mission-id']));
        return log.entries();
      }),
    );
    const url = await serve(app);
    const bodies = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        fetch(`${url}/log`, { headers: { 'x-mission-id': `m${i}` } }).then(
          (r) => r.json(),
        ),
      ),
    );
    bodies.forEach((body, i) => expect(body).toEqual([`m${i}: m${i}`]));
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(50));
    expect(count('scope:create')).toBe(50);
    await ship[Symbol.asyncDispose]();
  });

  it('shares one scope between two first uses in one request', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const app = Fastify();
    await app.register(di.plugin);
    app.get('/twice', async (req) => {
      const [a, b] = await Promise.all([di.scope(req), di.scope(req)]);
      return a === b;
    });
    const url = await serve(app);
    expect(await (await fetch(`${url}/twice`)).json()).toBe(true);
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    expect(count('scope:create')).toBe(1);
    await ship[Symbol.asyncDispose]();
  });

  it("answers a section's first request with a token from the loaded module", async () => {
    const { ship } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const navigation = di.load(Navigation);
    const app = Fastify();
    await app.register(di.plugin);
    await app.register(async (section) => {
      section.addHook('onRequest', navigation);
      section.get(
        '/navigation',
        navigation.inject({ routes: NAV_ROUTES }, ({ routes }) => routes),
      );
    });
    const url = await serve(app);
    expect(await (await fetch(`${url}/navigation`)).json()).toEqual([
      'Kepler',
      'Gliese',
    ]);
    await ship[Symbol.asyncDispose]();
  });

  it('extends the ambient scope for a lazy section, keeping its identity', async () => {
    const { ship, count } = await bridgeWith();
    const scopes = nodeScopes();
    const di = nexus(ship, { request: mapping, scopes });
    const navigation = di.load(Navigation);
    const app = Fastify();
    await app.register(di.plugin);
    await app.register(async (section) => {
      let before: unknown;
      section.addHook('onRequest', async () => {
        before = scopes.current();
      });
      section.addHook('onRequest', navigation);
      section.get('/navigation', async () => {
        const current = scopes.current();
        return { same: current === before, routes: current?.get(NAV_ROUTES) };
      });
    });
    const url = await serve(app);
    expect(await (await fetch(`${url}/navigation`)).json()).toEqual({
      same: true,
      routes: ['Kepler', 'Gliese'],
    });
    expect(count('scope:create')).toBe(1);
    expect(count('scope:extend')).toBe(1);
    await ship[Symbol.asyncDispose]();
  });

  it('answers 500 with no core text and no code when a third-party plugin fails scope creation', async () => {
    const { ship } = await bridgeWith([stardock]);
    const log = vi.fn();
    const di = nexus(ship, { request: mapping, log });
    const app = Fastify();
    await app.register(di.plugin);
    app.get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log: flightLog }) =>
        flightLog.entries(),
      ),
    );
    const url = await serve(app);
    const res = await fetch(`${url}/log`);
    const body = await res.text();
    expect(res.status).toBe(500);
    expect(body).not.toContain('NEXUS_');
    expect(body).not.toContain('ACME_');
    expect(JSON.parse(body)).not.toHaveProperty('code');
    expect(log).toHaveBeenCalledOnce();
    await ship[Symbol.asyncDispose]();
  });

  it('drains in-flight requests on close before the container is disposed in onClose', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const app = Fastify();
    await app.register(di.plugin);
    app.addHook('onClose', () => ship[Symbol.asyncDispose]());
    app.get(
      '/slow',
      di.inject({ log: FLIGHT_LOG }, async ({ log }) => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        log.record('drained');
        return log.entries();
      }),
    );
    const url = await app.listen({ port: 0, host: '127.0.0.1' });
    // A request on its own connection. fetch keeps its connection alive,
    // and close() then waits out Fastify's keep-alive timeout after the
    // reply, which has nothing to do with draining.
    const pending = new Promise<unknown>((resolve, reject) => {
      get(`${url}/slow`, { agent: false }, (res) => {
        let text = '';
        res.on('data', (chunk) => (text += chunk));
        res.on('end', () => resolve(JSON.parse(text)));
      }).on('error', reject);
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await app.close();
    expect(await pending).toEqual(['survey-7: drained']);
    expect(count('scope:dispose')).toBe(1);
  });

  it('extends the ambient scope from section.inject alone, with no section hook', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping, scopes: nodeScopes() });
    const app = Fastify();
    await app.register(di.plugin);
    app.get(
      '/navigation',
      di
        .load(Navigation)
        .inject({ routes: NAV_ROUTES }, ({ routes }) => routes),
    );
    const url = await serve(app);
    expect(await (await fetch(`${url}/navigation`)).json()).toEqual([
      'Kepler',
      'Gliese',
    ]);
    expect(count('scope:create')).toBe(1);
    expect(count('scope:extend')).toBe(1);
    await ship[Symbol.asyncDispose]();
  });

  it('loads a section from section.inject alone without an ambient scope', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const app = Fastify();
    await app.register(di.plugin);
    app.get(
      '/navigation',
      di
        .load(Navigation)
        .inject({ routes: NAV_ROUTES }, ({ routes }) => routes),
    );
    const url = await serve(app);
    expect(await (await fetch(`${url}/navigation`)).json()).toEqual([
      'Kepler',
      'Gliese',
    ]);
    expect(count('scope:create')).toBe(1);
    expect(count('scope:extend')).toBe(0);
    await ship[Symbol.asyncDispose]();
  });

  it('applies the encapsulated plugin only inside its context', async () => {
    const { ship } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const app = Fastify();
    await app.register(async (bridgeApi) => {
      await bridgeApi.register(di.encapsulatedPlugin);
      bridgeApi.get(
        '/inside',
        di.inject({ log: FLIGHT_LOG }, ({ log }) => log.entries()),
      );
    });
    app.get('/outside', async (req) => req.nexus ?? null);
    const url = await serve(app);
    expect(await (await fetch(`${url}/inside`)).json()).toEqual([]);
    expect(await (await fetch(`${url}/outside`)).json()).toBeNull();
    await ship[Symbol.asyncDispose]();
  });

  it('builds the function form once for ten concurrent first requests', async () => {
    const { ship } = await bridgeWith();
    const build = vi.fn(() => Promise.resolve(ship));
    const di = nexus(build, { request: mapping });
    const app = Fastify();
    await app.register(di.plugin);
    app.get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }) => log.entries()),
    );
    const url = await serve(app);
    await Promise.all(Array.from({ length: 10 }, () => fetch(`${url}/log`)));
    expect(build).toHaveBeenCalledTimes(1);
    await ship[Symbol.asyncDispose]();
  });

  it.each([
    [
      'rejects',
      (ship: Nexus) =>
        vi
          .fn<() => Promise<Nexus>>()
          .mockRejectedValueOnce(new Error('charts offline'))
          .mockResolvedValue(ship),
    ],
    [
      'throws synchronously',
      (ship: Nexus) =>
        vi
          .fn<() => Promise<Nexus>>()
          .mockImplementationOnce(() => {
            throw new Error('no reactor');
          })
          .mockResolvedValue(ship),
    ],
  ])(
    'answers 503 when the build %s, and builds again on the next request',
    async (_case, buildOf) => {
      const { ship } = await bridgeWith();
      const build = buildOf(ship);
      const log = vi.fn();
      const di = nexus(build, { request: mapping, log });
      const app = Fastify();
      await app.register(di.plugin);
      app.get(
        '/log',
        di.inject({ log: FLIGHT_LOG }, ({ log: flightLog }) =>
          flightLog.entries(),
        ),
      );
      const url = await serve(app);
      expect((await fetch(`${url}/log`)).status).toBe(503);
      expect(log.mock.calls[0]?.[1]).toEqual({
        adapter: '@nexusdi/fastify',
        phase: 'build',
        status: 503,
      });
      const second = await fetch(`${url}/log`);
      expect(second.status).toBe(200);
      expect(await second.json()).toEqual([]);
      expect(build).toHaveBeenCalledTimes(2);
      await ship[Symbol.asyncDispose]();
    },
  );

  it('answers 500 with no core text, no token name and no code when a token has no provider', async () => {
    const { ship } = await bridgeWith();
    const log = vi.fn();
    const di = nexus(() => Promise.resolve(ship), { request: mapping, log });
    const app = Fastify();
    await app.register(di.plugin);
    app.get(
      '/routes',
      di.inject({ routes: NAV_ROUTES }, ({ routes }) => routes),
    );
    const url = await serve(app);
    const res = await fetch(`${url}/routes`);
    const body = await res.text();
    expect(res.status).toBe(500);
    expect(body).not.toContain('NEXUS_');
    expect(body).not.toContain('NavRoutes');
    expect(JSON.parse(body)).not.toHaveProperty('code');
    expect(log).toHaveBeenCalledOnce();
    await ship[Symbol.asyncDispose]();
  });

  it('logs one line from the adapter and one from Fastify for a mapped 500', async () => {
    const { ship } = await bridgeWith([stardock]);
    const lines: Record<string, unknown>[] = [];
    const app = Fastify({
      logger: {
        level: 'error',
        stream: { write: (line: string) => lines.push(JSON.parse(line)) },
      },
    });
    const di = nexus(ship, { request: mapping });
    await app.register(di.plugin);
    app.get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log: flightLog }) =>
        flightLog.entries(),
      ),
    );
    const url = await serve(app);
    expect((await fetch(`${url}/log`)).status).toBe(500);
    await vi.waitFor(() => expect(lines).toHaveLength(2));
    const [adapter, framework] = lines as [
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    // The adapter's line: the NexusError's code and fields as keys, at
    // error, with the request id Fastify's child logger adds.
    expect(adapter).toMatchObject({
      level: 50,
      code: 'NEXUS_PROVIDER_FAILED',
      adapter: '@nexusdi/fastify',
      phase: 'scope',
      status: 500,
      reqId: expect.any(String),
    });
    // Fastify's default error handler logs every 5xx it sends: the
    // NexusHttpError, whose message is the status text, with the
    // NexusError as its cause.
    // pino's err serializer folds each cause's message into the message,
    // so this line carries core's and the plugin's text. It stays in the
    // log: the response body holds only the status text.
    expect(framework).toMatchObject({
      level: 50,
      reqId: adapter.reqId,
      err: expect.objectContaining({ type: 'NexusHttpError' }),
    });
    expect(String((framework.err as { message: string }).message)).toMatch(
      /^Internal Server Error: \[NEXUS_PROVIDER_FAILED\].*\[ACME_STARDOCK_OFFLINE\]/,
    );
    await ship[Symbol.asyncDispose]();
  });

  it('ends a request whose client left before its first inject, with nothing uncaught and no 500 logged', async () => {
    const { ship, count } = await bridgeWith();
    const log = vi.fn();
    const lines: Record<string, unknown>[] = [];
    const uncaught: unknown[] = [];
    const record = (reason: unknown) => uncaught.push(reason);
    process.on('uncaughtException', record);
    process.on('unhandledRejection', record);
    const app = Fastify({
      logger: {
        level: 'warn',
        stream: { write: (line: string) => lines.push(JSON.parse(line)) },
      },
    });
    const di = nexus(ship, { request: mapping, log });
    await app.register(di.plugin);
    const body = vi.fn();
    let ran!: () => void;
    const handled = new Promise<void>((resolve) => {
      ran = resolve;
    });
    const handler = di.inject({ log: FLIGHT_LOG }, body);
    app.get(
      '/late',
      {
        preHandler: (_req, reply, done) => {
          reply.raw.once('close', () => done());
        },
      },
      async function (req, reply) {
        try {
          return await handler.call(this, req, reply);
        } finally {
          ran();
        }
      },
    );
    const url = await serve(app);
    const abort = new AbortController();
    const pending = fetch(`${url}/late`, { signal: abort.signal }).catch(
      () => undefined,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    abort.abort();
    await pending;
    await handled;
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off('uncaughtException', record);
    process.off('unhandledRejection', record);
    expect(uncaught).toEqual([]);
    expect(body).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'RequestFinishedError' }),
      { adapter: '@nexusdi/fastify', phase: 'scope' },
    );
    expect(lines.filter((line) => Number(line.level) >= 50)).toEqual([]);
    expect(count('scope:create')).toBe(0);
    await ship[Symbol.asyncDispose]();
  });
});
