import {
  defineModule,
  Nexus,
  provide,
  REQUEST,
  NEXUS_PLUGIN_API,
  errorBase,
  type NexusPlugin,
  Token,
  type NexusRequest,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { nodeScopes } from '@nexusdi/node';
import { RouterContextProvider, type MiddlewareFunction } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { existingScope, NEXUS_SCOPE, nexus } from './index.js';

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
const Meridian = defineModule({
  name: 'Meridian',
  providers: [
    provide(MISSION, {
      useFactory: (r: NexusRequest) => r.mission,
      deps: [REQUEST],
      lifetime: 'scoped',
    }),
    provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
  ],
});
const Navigation = defineModule({
  name: 'Navigation',
  providers: [
    provide(NAV_ROUTES, { useValue: { find: (s: string) => `route to ${s}` } }),
  ],
  exports: [NAV_ROUTES],
});

const request = ({ request: r }: { request: Request }) => ({
  mission: {
    id: r.headers.get('x-mission-id') ?? 'survey-7',
    target: 'Kepler-442b',
  },
});

const ships: Nexus[] = [];
async function ship(events: TraceEvent[] = []) {
  const built = await Nexus.create(Meridian, {
    plugins: [trace((e) => events.push(e))],
  });
  ships.push(built);
  return built;
}
afterEach(async () => {
  await Promise.all(ships.splice(0).map((s) => s[Symbol.asyncDispose]()));
});
const count = (events: TraceEvent[], type: TraceEvent['type']) =>
  events.filter((e) => e.type === type).length;
const settle = () => new Promise((r) => setTimeout(r, 10));

/** Runs one middleware with a next() that calls `downstream`, the way React Router's chain does. */
async function run(
  middleware: MiddlewareFunction<Response>,
  downstream: (context: RouterContextProvider) => Promise<Response>,
  init: RequestInit = {},
) {
  const context = new RouterContextProvider();
  const req = new Request('http://bridge/course/Kepler-442b', init);
  const result = await middleware(
    {
      request: req,
      context,
      params: { to: 'Kepler-442b' },
      unstable_pattern: '/course/:to',
    } as never,
    () => downstream(context),
  );
  return { response: result as Response, context };
}

describe('nexus() for React Router', () => {
  it('resolves loader deps from the request scope and disposes at body end', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request, log: () => {} });
    const loader = di.inject(
      { log: FLIGHT_LOG },
      (
        { log },
        {
          params,
        }: { params: { to: string }; context: Readonly<RouterContextProvider> },
      ) => {
        log.record(`plotting ${params.to}`);
        return log.entries();
      },
    );
    const { response } = await run(di.middleware, async (context) =>
      Response.json(await loader({ params: { to: 'Kepler-442b' }, context })),
    );
    expect(count(events, 'scope:dispose')).toBe(0);
    expect(await response.json()).toEqual(['survey-7: plotting Kepler-442b']);
    await settle();
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('keeps the scope open while a streamed response reads a scoped instance', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request, log: () => {} });
    const loader = di.inject({ log: FLIGHT_LOG }, ({ log }) => log);
    const { response } = await run(di.middleware, async (context) => {
      const log = await loader({ context });
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream({
          async start(controller) {
            await new Promise((r) => setTimeout(r, 20));
            log.record('deferred');
            controller.enqueue(encoder.encode(log.entries().join(',')));
            controller.close();
          },
        }),
      );
    });
    expect(await response.text()).toBe('survey-7: deferred');
    await settle();
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('creates no scope when no loader resolves anything', async () => {
    const events: TraceEvent[] = [];
    const mapping = vi.fn(request);
    const di = nexus(await ship(events), { request: mapping });
    await run(di.middleware, async () => new Response('static'));
    await settle();
    expect(mapping).not.toHaveBeenCalled();
    expect(count(events, 'scope:create')).toBe(0);
  });

  it('sets NEXUS_SCOPE and answers without next() when the client left before the middleware ran', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request, log: () => {} });
    const downstream = vi.fn(async () => new Response(null, { status: 204 }));
    const { response, context } = await run(di.middleware, downstream, {
      signal: AbortSignal.abort(),
    });
    expect(downstream).not.toHaveBeenCalled();
    expect(response.status).toBe(499);
    expect(context.get(NEXUS_SCOPE).started).toBe(false);
    await expect(context.get(NEXUS_SCOPE).scope()).rejects.toThrow(
      'the request has finished',
    );
    expect(count(events, 'scope:create')).toBe(0);
  });

  it('shares one scope between parallel loaders', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request, log: () => {} });
    const a = di.inject({ log: FLIGHT_LOG }, ({ log }) => log);
    const b = di.inject({ log: FLIGHT_LOG }, ({ log }) => log);
    const { response } = await run(di.middleware, async (context) => {
      const [x, y] = await Promise.all([a({ context }), b({ context })]);
      return new Response(String(x === y));
    });
    expect(await response.text()).toBe('true');
    await settle();
    expect(count(events, 'scope:create')).toBe(1);
  });

  it('throws a 500 Response with no core text for a request that misses its mapping', async () => {
    const di = nexus(await ship(), {
      request: () => undefined as unknown as NexusRequest,
      log: () => {},
    });
    const loader = di.inject({ log: FLIGHT_LOG }, ({ log }) => log.entries());
    const thrown = await run(di.middleware, async (context) =>
      Response.json(await loader({ context })),
    ).catch((e: unknown) => e);
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(500);
    expect(await (thrown as Response).text()).not.toContain('NEXUS_');
  });

  it('throws a 503 Response once the container is disposed', async () => {
    const built = await ship();
    const di = nexus(built, { request, log: () => {} });
    const loader = di.inject({ log: FLIGHT_LOG }, ({ log }) => log.entries());
    await built[Symbol.asyncDispose]();
    const thrown = await run(di.middleware, async (context) =>
      Response.json(await loader({ context })),
    ).catch((e: unknown) => e);
    expect((thrown as Response).status).toBe(503);
  });

  it('serves the first request into a lazy route with di.load', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request, log: () => {} });
    const navigation = di.load(Navigation);
    const loader = navigation.inject({ routes: NAV_ROUTES }, ({ routes }) =>
      routes.find('kepler'),
    );
    const { response } = await run(di.middleware, async (context) => {
      const result = await navigation(
        {
          request: new Request('http://bridge/nav'),
          context,
          params: {},
          unstable_pattern: '/nav',
        } as never,
        async () => new Response(await loader({ context })),
      );
      return result as Response;
    });
    expect(await response.text()).toBe('route to kepler');
    expect(count(events, 'scope:extend')).toBe(0);
  });

  it('reads a scope the test owns through existingScope and disposes nothing', async () => {
    const built = await ship();
    const di = nexus(built, { request, log: () => {} });
    const loader = di.inject({ log: FLIGHT_LOG }, ({ log }) => {
      log.record('from test');
      return log.entries();
    });
    await using scope = await built.createScope({
      request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
    });
    const context = new RouterContextProvider(
      new Map([[NEXUS_SCOPE, existingScope(scope)]]),
    );
    expect(await loader({ context })).toEqual(['survey-7: from test']);
    expect(scope.get(FLIGHT_LOG).entries()).toEqual(['survey-7: from test']);
  });

  it('rejects di.scope when the middleware did not run', async () => {
    const di = nexus(await ship(), { request });
    await expect(di.scope(new RouterContextProvider())).rejects.toThrow(
      '[@nexusdi/react-router] no scope on this request: register di.middleware before this route',
    );
  });

  it('disposes once when the body ends and the request signal then aborts', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), { request, log: () => {} });
    const loader = di.inject({ log: FLIGHT_LOG }, ({ log }) => log.entries());
    const abort = new AbortController();
    const { response } = await run(
      di.middleware,
      async (context) => Response.json(await loader({ context })),
      { signal: abort.signal },
    );
    await response.text();
    abort.abort();
    await settle();
    expect(count(events, 'scope:dispose')).toBe(1);
  });

  it('logs one RequestFinishedError and throws a 499 when the client leaves before the first loader', async () => {
    const events: TraceEvent[] = [];
    const log = vi.fn();
    const di = nexus(await ship(events), { request, log });
    const body = vi.fn();
    const loader = di.inject({ log: FLIGHT_LOG }, body);
    const abort = new AbortController();
    const thrown = await run(
      di.middleware,
      async (context) => {
        abort.abort();
        return Response.json(await loader({ context }));
      },
      { signal: abort.signal },
    ).catch((e: unknown) => e);
    expect((thrown as Response).status).toBe(499);
    expect(body).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'RequestFinishedError' }),
      { adapter: '@nexusdi/react-router', phase: 'scope' },
    );
    expect(count(events, 'scope:create')).toBe(0);
  });

  it('logs each failing entry once when the first loader validates', async () => {
    const built = await ship();
    const log = vi.fn();
    const di = nexus(() => Promise.resolve(built), { request, log });
    const UNCHARTED = new Token<string>('Uncharted');
    const loader = di.inject(
      { routes: NAV_ROUTES, uncharted: UNCHARTED },
      () => 'x',
    );
    const thrown = await run(di.middleware, async (context) =>
      Response.json(await loader({ context })),
    ).catch((e: unknown) => e);
    expect((thrown as Response).status).toBe(500);
    expect(await (thrown as Response).text()).toBe('Internal Server Error');
    expect(log.mock.calls.map(([, context]) => context)).toEqual([
      { adapter: '@nexusdi/react-router', phase: 'validate' },
      { adapter: '@nexusdi/react-router', phase: 'validate' },
    ]);
  });

  it('throws a 500 Response with no core text for a third-party construct code', async () => {
    class SensorOfflineError extends errorBase<
      'ACME_SENSOR_OFFLINE',
      { sensor: string }
    >('ACME_SENSOR_OFFLINE', 'SensorOfflineError') {}
    const sensors: NexusPlugin = {
      name: 'acme:sensors',
      apiVersion: NEXUS_PLUGIN_API,
      construct(_, provider, scope) {
        if (scope !== null)
          throw new SensorOfflineError({ sensor: provider.id });
        return undefined;
      },
    };
    const built = await Nexus.create(Meridian, { plugins: [sensors] });
    ships.push(built);
    const di = nexus(built, { request, log: () => {} });
    const loader = di.inject({ log: FLIGHT_LOG }, ({ log }) => log.entries());
    const thrown = await run(di.middleware, async (context) =>
      Response.json(await loader({ context })),
    ).catch((e: unknown) => e);
    expect((thrown as Response).status).toBe(500);
    const text = await (thrown as Response).text();
    expect(text).not.toContain('NEXUS_');
    expect(text).not.toContain('ACME_');
    expect(text).not.toContain('FlightLog');
  });

  it('extends an ambient scope from section.inject alone, with no section middleware', async () => {
    const events: TraceEvent[] = [];
    const di = nexus(await ship(events), {
      request,
      scopes: nodeScopes(),
      log: () => {},
    });
    const loader = di
      .load(Navigation)
      .inject({ routes: NAV_ROUTES }, ({ routes }) => routes.find('kepler'));
    const { response } = await run(
      di.middleware,
      async (context) => new Response(await loader({ context })),
    );
    expect(await response.text()).toBe('route to kepler');
    expect(count(events, 'scope:create')).toBe(1);
    expect(count(events, 'scope:extend')).toBe(1);
  });

  it('still throws the 503 Response when the log throws', async () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => {});
    const built = await ship();
    const di = nexus(built, {
      request,
      log: () => {
        throw new Error('log sink offline');
      },
    });
    const loader = di.inject({ log: FLIGHT_LOG }, ({ log }) => log.entries());
    await built[Symbol.asyncDispose]();
    const thrown = await run(di.middleware, async (context) =>
      Response.json(await loader({ context })),
    ).catch((e: unknown) => e);
    expect((thrown as Response).status).toBe(503);
    expect(write).toHaveBeenCalledWith(
      '[@nexusdi/react-router] log threw:',
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
    const di = nexus(built, { request, log });
    const { response } = await run(di.middleware, async (context) => {
      (await di.scope(context)).get(HATCH);
      return new Response('open');
    });
    expect(await response.text()).toBe('open');
    await vi.waitFor(() => expect(log).toHaveBeenCalledOnce());
    expect(log.mock.calls[0]?.[1]).toEqual({
      adapter: '@nexusdi/react-router',
      phase: 'dispose',
    });
  });
});
