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
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { stream } from 'hono/streaming';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NexusHttpError, nexus } from './index.js';

interface Mission {
  id: string;
  target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
interface INavRoutes {
  find(sector: string): string;
}

const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const NAV_ROUTES = new Token<INavRoutes>('NavRoutes');
const UNCHARTED = new Token<string>('Uncharted');

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
      useFactory: (request: NexusRequest) => request.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
  exports: [FLIGHT_LOG],
});

const Navigation = defineModule({
  name: 'Navigation',
  providers: [
    provide(NAV_ROUTES, {
      useValue: { find: (sector: string) => `route to ${sector}` },
    }),
  ],
  exports: [NAV_ROUTES],
});

const survey = (c: { req: { header(name: string): string | undefined } }) => ({
  mission: {
    id: c.req.header('x-mission-id') ?? 'survey-7',
    target: 'Kepler-442b',
  },
});

const ships: Nexus[] = [];
async function ship(events: TraceEvent[] = [], plugins: NexusPlugin[] = []) {
  const built = await Nexus.create(
    defineModule({ name: 'Meridian', imports: [BridgeApi] }),
    {
      plugins: [trace((event) => events.push(event)), ...plugins],
    },
  );
  ships.push(built);
  return built;
}
afterEach(async () => {
  await Promise.all(ships.splice(0).map((s) => s[Symbol.asyncDispose]()));
});

const count = (events: TraceEvent[], type: TraceEvent['type']) =>
  events.filter((event) => event.type === type).length;
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

describe('nexus', () => {
  it('creates one scope per request and disposes it after the body', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request: survey, log: () => {} });
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }, c) => {
        log.record('arrived');
        return c.json(log.entries());
      }),
    );
    const res = await app.request('/log', {
      headers: { 'x-mission-id': 'survey-9' },
    });
    expect(await res.json()).toEqual(['survey-9: arrived']);
    await settle();
    expect(count(events, 'scope:create')).toBe(1);
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('creates no scope and never maps the request when nothing resolves', async () => {
    const events: TraceEvent[] = [];
    const request = vi.fn(survey);
    const di = nexus(await ship(events), { request });
    const app = new Hono()
      .use(di.middleware)
      .get('/ping', (c) => c.text('pong'));
    expect(await (await app.request('/ping')).text()).toBe('pong');
    await settle();
    expect(request).not.toHaveBeenCalled();
    expect(count(events, 'scope:create')).toBe(0);
  });

  it('keeps the scope open while a stream reads a scoped instance', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request: survey, log: () => {} });
    const app = new Hono().use(di.middleware).get(
      '/stream',
      di.inject({ log: FLIGHT_LOG }, ({ log }, c) =>
        stream(c, async (s) => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          log.record('late entry');
          await s.write(log.entries().join(','));
        }),
      ),
    );
    const res = await app.request('/stream');
    expect(count(events, 'scope:dispose')).toBe(0);
    expect(await res.text()).toBe('survey-7: late entry');
    await settle();
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('disposes once when the consumer cancels the stream', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request: survey, log: () => {} });
    const app = new Hono().use(di.middleware).get(
      '/stream',
      di.inject({ log: FLIGHT_LOG }, (_, c) =>
        stream(c, async (s) => {
          await s.write('first');
          await new Promise((resolve) => setTimeout(resolve, 50));
          await s.write('second');
        }),
      ),
    );
    const res = await app.request('/stream');
    const reader = res.body?.getReader();
    if (reader === undefined) throw new Error('no body');
    await reader.read();
    await reader.cancel('client gone');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('ends a request whose client left before the middleware ran', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request: survey });
    const handler = vi.fn();
    const app = new Hono().use(di.middleware).get('/log', handler);
    const res = await app.request(
      new Request('http://bridge/log', { signal: AbortSignal.abort() }),
    );
    expect(res.status).toBe(499);
    expect(handler).not.toHaveBeenCalled();
    expect(count(events, 'scope:create')).toBe(0);
  });

  it('answers 503 while a function-form build fails, then retries', async () => {
    const built = await ship();
    const source = vi
      .fn<() => Promise<Nexus>>()
      .mockRejectedValueOnce(new Error('charts unreachable'))
      .mockResolvedValue(built);
    const log = vi.fn();
    const di = nexus(source, { request: survey, log });
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log: l }, c) => c.json(l.entries())),
    );
    expect((await app.request('/log')).status).toBe(503);
    expect((await app.request('/log')).status).toBe(200);
    expect(source).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ phase: 'build', status: 503 }),
    );
  });

  it('answers 500 with no core text when the request mapping misses a field', async () => {
    const di = nexus(await ship(), {
      request: () => undefined as unknown as NexusRequest,
      log: () => {},
    });
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }, c) => c.json(log.entries())),
    );
    const res = await app.request('/log');
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain('NEXUS_');
  });

  it('answers 500 for a third-party code a construct hook throws', async () => {
    class SensorOfflineError extends errorBase<
      'MERIDIAN_SENSOR_OFFLINE',
      { sensor: string }
    >('MERIDIAN_SENSOR_OFFLINE', 'SensorOfflineError') {}
    const sensors: NexusPlugin = {
      name: 'meridian-sensors',
      apiVersion: NEXUS_PLUGIN_API,
      construct(_, provider, scope) {
        if (scope !== null)
          throw new SensorOfflineError({ sensor: provider.id });
        return undefined;
      },
    };
    const di = nexus(await ship([], [sensors]), {
      request: survey,
      log: () => {},
    });
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }, c) => c.json(log.entries())),
    );
    const res = await app.request('/log');
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain('NEXUS_');
    expect(body).not.toContain('MERIDIAN_');
  });

  it('answers 503 once the container is disposed', async () => {
    const built = await ship();
    const di = nexus(built, { request: survey, log: () => {} });
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }, c) => c.json(log.entries())),
    );
    await built[Symbol.asyncDispose]();
    expect((await app.request('/log')).status).toBe(503);
  });

  it('throws at definition for a token with no provider, and logs it once', async () => {
    const log = vi.fn();
    const di = nexus(await ship(), { request: survey, log });
    expect(() =>
      di.inject({ route: NAV_ROUTES }, (_, c) => c.text('x')),
    ).toThrow(/NEXUS_BLUEPRINT_INVALID/);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ phase: 'validate' }),
    );
  });

  it('rejects di.scope without the middleware', async () => {
    const di = nexus(await ship(), { request: survey });
    const app = new Hono().get('/raw', async (c) => {
      await di.scope(c);
      return c.text('unreachable');
    });
    app.onError((error, c) => c.text(String(error.message), 500));
    expect(await (await app.request('/raw')).text()).toBe(
      '[@nexusdi/hono] no scope on this request: register di.middleware before this route',
    );
  });

  it('hands the disposal to executionCtx.waitUntil where the platform has one', async () => {
    const di = nexus(await ship(), { request: survey, log: () => {} });
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }, c) => c.json(log.entries())),
    );
    const waitUntil = vi.fn();
    const res = await app.request(
      '/log',
      {},
      {},
      // Hono 4.13's ExecutionContext requires props, which 4.3's lacks, so
      // the fake goes through unknown to fit both.
      {
        waitUntil,
        passThroughOnException() {},
        props: {},
      } as unknown as Parameters<typeof app.request>[3],
    );
    await res.text();
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(waitUntil.mock.calls[0][0]).toBeInstanceOf(Promise);
  });

  it('probes executionCtx once per adapter instance where the platform has none', async () => {
    // Hono's getter throws a new Error on Node, Bun and Deno on every read.
    // The prototype comes from a live context: Hono exports Context as a
    // value only from 4.8.
    let prototype: object = {};
    await new Hono()
      .get('/', (c) => {
        prototype = Object.getPrototypeOf(c) as object;
        return c.text('');
      })
      .request('/');
    const getter = vi.spyOn(
      prototype as { executionCtx: unknown },
      'executionCtx',
      'get',
    );
    const di = nexus(await ship(), { request: survey, log: () => {} });
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }, c) => c.json(log.entries())),
    );
    for (let i = 0; i < 3; i += 1) await (await app.request('/log')).text();
    expect(getter).toHaveBeenCalledTimes(1);
    getter.mockRestore();
  });

  it('runs the rest of the request inside scopes.run when scopes is set', async () => {
    const seen: string[] = [];
    let current: { id: string } | undefined;
    const scopes = {
      run<R>(scope: { id: string }, fn: () => R): R {
        current = scope;
        seen.push(scope.id);
        return fn();
      },
    };
    const di = nexus(await ship(), { request: survey, scopes, log: () => {} });
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, async (_, c) => {
        const scope = await di.scope(c);
        return c.text(String(scope.id === current?.id));
      }),
    );
    expect(await (await app.request('/log')).text()).toBe('true');
    expect(seen).toHaveLength(1);
  });

  it('serves the first request into a lazily loaded section', async () => {
    const events: TraceEvent[] = [];
    const built = await ship(events);
    const di = nexus(built, { request: survey, log: () => {} });
    const navigation = di.load(Navigation);
    const section = new Hono<{ Variables: { nexus: never } }>()
      .use(navigation)
      .get(
        '/:sector',
        navigation.inject({ routes: NAV_ROUTES }, ({ routes }, c) =>
          c.text(routes.find(c.req.param('sector') ?? '')),
        ),
      );
    const app = new Hono().use(di.middleware).route('/nav', section);
    expect(await (await app.request('/nav/kepler')).text()).toBe(
      'route to kepler',
    );
    expect(await (await app.request('/nav/vega')).text()).toBe('route to vega');
    expect(count(events, 'scope:extend')).toBe(0);
  });

  it("loads a section with a grant once and lets its handler inject a token built from the granted module's export", async () => {
    const HELM = new Token<string>('Helm');
    const COURSE = new Token<string>('Course');
    const Helm = defineModule({
      name: 'Helm',
      providers: [provide(HELM, { useValue: 'helm-1' })],
      exports: [HELM],
    });
    const Chart = defineModule({
      name: 'Chart',
      providers: [
        provide(COURSE, {
          useFactory: (helm: string) => `course by ${helm}`,
          deps: [HELM],
        }),
      ],
      exports: [COURSE],
    });
    const built = await Nexus.create(
      defineModule({ name: 'Root', imports: [BridgeApi, Helm] }),
    );
    ships.push(built);
    const load = vi.spyOn(built, 'load');
    const di = nexus(built, { request: survey, log: () => {} });
    const chart = di.load(Chart, { imports: [Helm] });
    const section = new Hono<{ Variables: { nexus: never } }>().use(chart).get(
      '/',
      chart.inject({ course: COURSE }, ({ course }, c) => c.text(course)),
    );
    const app = new Hono().use(di.middleware).route('/chart', section);
    expect(await (await app.request('/chart')).text()).toBe('course by helm-1');
    expect(await (await app.request('/chart')).text()).toBe('course by helm-1');
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith(Chart, { imports: [Helm] });
  });

  it('extends a scope created before the section loaded', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request: survey, log: () => {} });
    const navigation = di.load(Navigation);
    const app = new Hono()
      .use(di.middleware)
      .use(async (c, next) => {
        (await di.scope(c)).get(FLIGHT_LOG).record('early');
        await next();
      })
      .use(navigation)
      .get(
        '/nav/:sector',
        navigation.inject(
          { routes: NAV_ROUTES, log: FLIGHT_LOG },
          ({ routes, log }, c) =>
            c.json({
              route: routes.find(c.req.param('sector') ?? ''),
              log: log.entries(),
            }),
        ),
      );
    expect(await (await app.request('/nav/kepler')).json()).toEqual({
      route: 'route to kepler',
      log: ['survey-7: early'],
    });
    expect(count(events, 'scope:extend')).toBe(1);
  });

  it('disposes the scope when an onError handler rethrows', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request: survey, log: () => {} });
    const app = new Hono()
      .use(di.middleware)
      .get(
        '/log',
        di.inject({ log: FLIGHT_LOG }, () => {
          throw new Error('sector not charted');
        }),
      )
      .onError((error) => {
        throw error;
      });
    await Promise.resolve(app.request('/log')).catch(() => undefined);
    await settle();
    expect(count(events, 'scope:create')).toBe(1);
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('disposes the scope when a handler throws a value that is not an Error', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request: survey, log: () => {} });
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, () => {
        throw 'sector not charted';
      }),
    );
    await Promise.resolve(app.request('/log')).catch(() => undefined);
    await settle();
    expect(count(events, 'scope:create')).toBe(1);
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('disposes the ambient scope when next rejects under scopes', async () => {
    const events: TraceEvent[] = [];
    const scopes = { run: <R>(_scope: unknown, fn: () => R): R => fn() };
    const di = nexus(await ship(events), {
      request: survey,
      scopes,
      log: () => {},
    });
    const app = new Hono()
      .use(di.middleware)
      .get('/log', () => {
        throw new Error('sector not charted');
      })
      .onError((error) => {
        throw error;
      });
    await Promise.resolve(app.request('/log')).catch(() => undefined);
    await settle();
    expect(count(events, 'scope:create')).toBe(1);
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('disposes the ambient scope when the scope runner throws synchronously', async () => {
    const events: TraceEvent[] = [];
    const scopes = {
      run: (): never => {
        throw new Error('runner down');
      },
    };
    const di = nexus(await ship(events), {
      request: survey,
      scopes,
      log: () => {},
    });
    const app = new Hono()
      .use(di.middleware)
      .get('/log', (c) => c.text('unreached'))
      .onError((error) => {
        throw error;
      });
    await Promise.resolve(app.request('/log')).catch(() => undefined);
    await settle();
    expect(count(events, 'scope:create')).toBe(1);
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('shares one scope between two first uses in one request', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request: survey, log: () => {} });
    const app = new Hono().use(di.middleware).get('/both', async (c) => {
      const [a, b] = await Promise.all([di.scope(c), di.scope(c)]);
      return c.text(String(a === b));
    });
    expect(await (await app.request('/both')).text()).toBe('true');
    await settle();
    expect(count(events, 'scope:create')).toBe(1);
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('defers a section inject check until the section has loaded', async () => {
    const di = nexus(await ship(), { request: survey, log: () => {} });
    expect(() =>
      di.load(Navigation).inject({ x: UNCHARTED }, (_, c) => c.text('x')),
    ).not.toThrow();
  });

  it('disposes once when the body ends and the request signal then aborts', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request: survey, log: () => {} });
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }, c) => c.json(log.entries())),
    );
    const abort = new AbortController();
    const res = await app.request(
      new Request('http://bridge/log', { signal: abort.signal }),
    );
    await res.text();
    abort.abort();
    await settle();
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('logs one RequestFinishedError and answers 499 when the client leaves before the first inject', async () => {
    const events: TraceEvent[] = [];
    const log = vi.fn();
    const di = nexus(await ship(events), { request: survey, log });
    const abort = new AbortController();
    const body = vi.fn();
    const app = new Hono()
      .use(di.middleware)
      .use(async (_c, next) => {
        abort.abort();
        await next();
      })
      .get('/log', di.inject({ log: FLIGHT_LOG }, body));
    const res = await app.request(
      new Request('http://bridge/log', { signal: abort.signal }),
    );
    expect(res.status).toBe(499);
    expect(body).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'RequestFinishedError' }),
      { adapter: '@nexusdi/hono', phase: 'scope' },
    );
    expect(count(events, 'scope:create')).toBe(0);
  });

  it('logs each failing entry once when the first request validates', async () => {
    const built = await ship();
    const log = vi.fn();
    const di = nexus(() => Promise.resolve(built), { request: survey, log });
    const app = new Hono().use(di.middleware).get(
      '/nav',
      di.inject({ routes: NAV_ROUTES, uncharted: UNCHARTED }, (_, c) =>
        c.text('x'),
      ),
    );
    expect((await app.request('/nav')).status).toBe(500);
    expect(log.mock.calls.map(([, context]) => context)).toEqual([
      { adapter: '@nexusdi/hono', phase: 'validate' },
      { adapter: '@nexusdi/hono', phase: 'validate' },
    ]);
  });

  it('extends an ambient scope from section.inject alone, with no section middleware', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), {
      request: survey,
      scopes: nodeScopes(),
      log: () => {},
    });
    const app = new Hono().use(di.middleware).get(
      '/nav/:sector',
      di
        .load(Navigation)
        .inject({ routes: NAV_ROUTES }, ({ routes }, c) =>
          c.text(routes.find(c.req.param('sector') ?? '')),
        ),
    );
    expect(await (await app.request('/nav/kepler')).text()).toBe(
      'route to kepler',
    );
    expect(count(events, 'scope:create')).toBe(1);
    expect(count(events, 'scope:extend')).toBe(1);
  });

  it("writes one log line for a mapped 500 under Hono's default error handler", async () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => {});
    const di = nexus(await ship(), {
      request: () => undefined as unknown as NexusRequest,
    });
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }, c) => c.json(log.entries())),
    );
    const res = await app.request('/log');
    expect(res.status).toBe(500);
    expect(await res.text()).toBe('Internal Server Error');
    // Hono's default handler sends an HTTPException's response and logs
    // nothing, so the adapter's line is the only one.
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0]?.slice(0, 2)).toEqual([
      '[@nexusdi/hono] scope:',
      'NEXUS_REQUEST_MISSING',
    ]);
    write.mockRestore();
  });

  it('hands the HTTPException the NexusHttpError as its cause', async () => {
    const di = nexus(await ship(), { request: survey, log: () => {} });
    let caught: unknown;
    const built = ships.at(-1) as Nexus;
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }, c) => c.json(log.entries())),
    );
    app.onError((error, c) => {
      caught = error;
      return c.text('handled', 500);
    });
    await built[Symbol.asyncDispose]();
    expect(await (await app.request('/log')).text()).toBe('handled');
    expect(caught).toBeInstanceOf(HTTPException);
    expect((caught as HTTPException).status).toBe(503);
    expect((caught as HTTPException).cause).toBeInstanceOf(NexusHttpError);
  });

  it('still answers 503 when the log throws', async () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => {});
    const built = await ship();
    const di = nexus(built, {
      request: survey,
      log: () => {
        throw new Error('log sink offline');
      },
    });
    const app = new Hono().use(di.middleware).get(
      '/log',
      di.inject({ log: FLIGHT_LOG }, ({ log }, c) => c.json(log.entries())),
    );
    await built[Symbol.asyncDispose]();
    expect((await app.request('/log')).status).toBe(503);
    expect(write).toHaveBeenCalledWith(
      '[@nexusdi/hono] log threw:',
      expect.objectContaining({ message: 'log sink offline' }),
      expect.anything(),
    );
    write.mockRestore();
  });

  it('logs a disposer error with phase dispose and never rethrows it', async () => {
    const HATCH = new Token<AsyncDisposable>('Hatch');
    const built = await Nexus.create([
      provide(HATCH, {
        useFactory: () => ({
          [Symbol.asyncDispose]: () =>
            Promise.reject(new Error('hatch jammed')),
        }),
        lifetime: 'scoped',
      }),
    ]);
    ships.push(built);
    const log = vi.fn();
    const di = nexus(built, { request: survey, log });
    const app = new Hono().use(di.middleware).get('/hatch', async (c) => {
      (await di.scope(c)).get(HATCH);
      return c.text('open');
    });
    expect(await (await app.request('/hatch')).text()).toBe('open');
    await vi.waitFor(() => expect(log).toHaveBeenCalledOnce());
    expect(log.mock.calls[0]?.[1]).toEqual({
      adapter: '@nexusdi/hono',
      phase: 'dispose',
    });
  });
});
