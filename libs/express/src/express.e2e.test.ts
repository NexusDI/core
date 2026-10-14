import { once } from 'node:events';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import express from 'express';
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

const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };

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
    provide(NAV_CHARTS, { useValue: fakeCharts }),
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
/** A third-party plugin whose construct hook fails every scoped build. */
const stardock: NexusPlugin = {
  name: 'acme:stardock',
  apiVersion: NEXUS_PLUGIN_API,
  construct: (_instance, _provider, scope) => {
    if (scope !== null) throw new StardockOffline({ dock: '7' });
    return undefined;
  },
};

const servers: Server[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

async function listen(app: express.Express) {
  const server = app.listen(0);
  servers.push(server);
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
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

const mapping = (req: express.Request): NexusRequest => ({
  mission: { id: req.get('x-mission-id') ?? 'survey-7', target: 'Kepler-442b' },
});

describe('@nexusdi/express on a real server', () => {
  it('disposes the scope after a JSON response is sent', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/course/:to',
          di.inject(
            { charts: NAV_CHARTS, log: FLIGHT_LOG },
            ({ charts, log }, req, res) => {
              log.record(`plotting ${req.params.to}`);
              res.json({
                course: charts.plot(String(req.params.to)),
                log: log.entries(),
              });
            },
          ),
        ),
    );
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

  it('keeps the scope open while a streamed body is still being written', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/stream',
          di.inject({ log: FLIGHT_LOG }, async ({ log }, _req, res) => {
            res.write('[');
            await new Promise((resolve) => setTimeout(resolve, 30));
            log.record('late');
            expect(count('scope:dispose')).toBe(0);
            res.end(`${JSON.stringify(log.entries())}]`);
          }),
        ),
    );
    const body = await (await fetch(`${url}/stream`)).text();
    expect(body).toBe('[["survey-7: late"]]');
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    await ship[Symbol.asyncDispose]();
  });

  it('disposes the scope when the client aborts mid-stream', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/stream',
          di.inject({ log: FLIGHT_LOG }, async (_deps, _req, res) => {
            res.write('first chunk');
            await gate;
            res.end();
          }),
        ),
    );
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
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/fail',
          di.inject({ log: FLIGHT_LOG }, () => {
            throw new Error('sector not charted');
          }),
        ),
    );
    expect((await fetch(`${url}/fail`)).status).toBe(500);
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    await ship[Symbol.asyncDispose]();
  });

  it('gives 50 concurrent requests 50 scopes and shares no scoped instance', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/log',
          di.inject({ log: FLIGHT_LOG }, ({ log }, req, res) => {
            log.record(String(req.get('x-mission-id')));
            res.json(log.entries());
          }),
        ),
    );
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

  it('creates no scope and never maps a request that resolves nothing', async () => {
    const { ship, count } = await bridgeWith();
    const request = vi.fn(mapping);
    const di = nexus(ship, { request });
    const url = await listen(
      express()
        .use(di.middleware)
        .get('/ping', (_req, res) => {
          res.send('pong');
        }),
    );
    expect(await (await fetch(`${url}/ping`)).text()).toBe('pong');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(request).not.toHaveBeenCalled();
    expect(count('scope:create')).toBe(0);
    await ship[Symbol.asyncDispose]();
  });

  it('disposes a scope the handler created late when the client aborts', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    let created!: () => void;
    const started = new Promise<void>((resolve) => {
      created = resolve;
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const url = await listen(
      express()
        .use(di.middleware)
        .get('/stream', async (req, res) => {
          res.write('first chunk');
          await new Promise((resolve) => setTimeout(resolve, 20));
          await di.scope(req);
          created();
          await gate;
          res.end();
        }),
    );
    const abort = new AbortController();
    const res = await fetch(`${url}/stream`, { signal: abort.signal });
    await res.body?.getReader().read();
    await started;
    expect(count('scope:create')).toBe(1);
    abort.abort();
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    release();
    await ship[Symbol.asyncDispose]();
  });

  it('logs and ends a request whose client left before its first inject, with nothing uncaught', async () => {
    const { ship, count } = await bridgeWith();
    const log = vi.fn();
    const di = nexus(ship, { request: mapping, log });
    const uncaught: unknown[] = [];
    const record = (reason: unknown) => uncaught.push(reason);
    process.on('uncaughtException', record);
    process.on('unhandledRejection', record);
    const handler = vi.fn();
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/late',
          (_req, res, next) => {
            res.once('close', () => next());
          },
          di.inject({ log: FLIGHT_LOG }, handler),
        ),
    );
    const abort = new AbortController();
    const pending = fetch(`${url}/late`, { signal: abort.signal }).catch(
      () => undefined,
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    abort.abort();
    await pending;
    await vi.waitFor(() =>
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'RequestFinishedError' }),
        { adapter: '@nexusdi/express', phase: 'scope' },
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    process.off('uncaughtException', record);
    process.off('unhandledRejection', record);
    expect(uncaught).toEqual([]);
    expect(handler).not.toHaveBeenCalled();
    expect(count('scope:create')).toBe(0);
    await ship[Symbol.asyncDispose]();
  });

  it('shares one scope between two first uses in one request', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const url = await listen(
      express()
        .use(di.middleware)
        .get('/twice', async (req, res) => {
          const [a, b] = await Promise.all([di.scope(req), di.scope(req)]);
          res.json(a === b);
        }),
    );
    expect(await (await fetch(`${url}/twice`)).json()).toBe(true);
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    expect(count('scope:create')).toBe(1);
    await ship[Symbol.asyncDispose]();
  });

  it("answers a section's first request with a token from the loaded module", async () => {
    const { ship } = await bridgeWith();
    const di = nexus(ship, { request: mapping });
    const navigation = di.load(Navigation);
    const sector = express.Router();
    sector.use(navigation);
    sector.get(
      '/',
      navigation.inject({ routes: NAV_ROUTES }, ({ routes }, _req, res) =>
        res.json(routes),
      ),
    );
    const url = await listen(
      express().use(di.middleware).use('/navigation', sector),
    );
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
    let before: unknown;
    const url = await listen(
      express()
        .use(di.middleware)
        .use((_req, _res, next) => {
          before = scopes.current();
          next();
        })
        .use(navigation)
        .get('/', (_req, res) => {
          const current = scopes.current();
          res.json({
            same: current === before,
            routes: current?.get(NAV_ROUTES),
          });
        }),
    );
    expect(await (await fetch(url)).json()).toEqual({
      same: true,
      routes: ['Kepler', 'Gliese'],
    });
    expect(count('scope:create')).toBe(1);
    expect(count('scope:extend')).toBe(1);
    await ship[Symbol.asyncDispose]();
  });

  it('extends the ambient scope from section.inject alone', async () => {
    const { ship, count } = await bridgeWith();
    const di = nexus(ship, { request: mapping, scopes: nodeScopes() });
    const navigation = di.load(Navigation);
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/navigation',
          navigation.inject({ routes: NAV_ROUTES }, ({ routes }, _req, res) =>
            res.json(routes),
          ),
        ),
    );
    expect(await (await fetch(`${url}/navigation`)).json()).toEqual([
      'Kepler',
      'Gliese',
    ]);
    expect(count('scope:create')).toBe(1);
    expect(count('scope:extend')).toBe(1);
    await ship[Symbol.asyncDispose]();
  });

  it('builds the function form once for ten concurrent first requests', async () => {
    const { ship } = await bridgeWith();
    const build = vi.fn(() => Promise.resolve(ship));
    const di = nexus(build, { request: mapping });
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/log',
          di.inject({ log: FLIGHT_LOG }, ({ log }, _req, res) =>
            res.json(log.entries()),
          ),
        ),
    );
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
      const url = await listen(
        express()
          .use(di.middleware)
          .get(
            '/log',
            di.inject({ log: FLIGHT_LOG }, ({ log: flightLog }, _req, res) =>
              res.json(flightLog.entries()),
            ),
          ),
      );
      expect((await fetch(`${url}/log`)).status).toBe(503);
      expect(log.mock.calls[0]?.[1]).toEqual({
        adapter: '@nexusdi/express',
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

  it('answers 500 with no core text when a third-party plugin fails scope creation', async () => {
    const { ship } = await bridgeWith([stardock]);
    const log = vi.fn();
    const di = nexus(ship, { request: mapping, log });
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/log',
          di.inject({ log: FLIGHT_LOG }, ({ log: flightLog }, _req, res) =>
            res.json(flightLog.entries()),
          ),
        ),
    );
    const res = await fetch(`${url}/log`);
    const body = await res.text();
    expect(res.status).toBe(500);
    expect(body).not.toContain('NEXUS_');
    expect(body).not.toContain('ACME_');
    expect(log).toHaveBeenCalledOnce();
    await ship[Symbol.asyncDispose]();
  });

  it('answers 500 with no token name when a token has no provider', async () => {
    const { ship } = await bridgeWith();
    const di = nexus(() => Promise.resolve(ship), {
      request: mapping,
      log: () => {},
    });
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/routes',
          di.inject({ routes: NAV_ROUTES }, ({ routes }, _req, res) =>
            res.json(routes),
          ),
        ),
    );
    const res = await fetch(`${url}/routes`);
    const body = await res.text();
    expect(res.status).toBe(500);
    expect(body).not.toContain('NEXUS_');
    expect(body).not.toContain('NavRoutes');
    await ship[Symbol.asyncDispose]();
  });

  it('answers 503 once the container is disposed', async () => {
    const { ship } = await bridgeWith();
    const di = nexus(ship, { request: mapping, log: () => {} });
    const url = await listen(
      express()
        .use(di.middleware)
        .get(
          '/log',
          di.inject({ log: FLIGHT_LOG }, ({ log }, _req, res) =>
            res.json(log.entries()),
          ),
        ),
    );
    await ship[Symbol.asyncDispose]();
    expect((await fetch(`${url}/log`)).status).toBe(503);
  });
});
