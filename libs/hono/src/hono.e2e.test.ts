import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

import { serve, type ServerType } from '@hono/node-server';
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
import { errors } from '@nexusdi/errors';
import { nodeScopes } from '@nexusdi/node';
import { Hono } from 'hono';
import { stream, streamSSE } from 'hono/streaming';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { nexus, type NexusHonoOptions } from './index.js';

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

const request: NexusHonoOptions['request'] = (c) => ({
  mission: {
    id: c.req.header('x-mission-id') ?? 'survey-7',
    target: 'Kepler-442b',
  },
});

const open: { server: ServerType; ship: Nexus }[] = [];
afterEach(async () => {
  for (const { server, ship } of open.splice(0)) {
    server.close();
    await once(server, 'close');
    await ship[Symbol.asyncDispose]();
  }
});

async function start(
  build: (di: ReturnType<typeof nexus>) => {
    fetch: (request: Request) => Response | Promise<Response>;
  },
  extra: Partial<NexusHonoOptions> = {},
  plugins: NexusPlugin[] = [],
) {
  const events: TraceEvent[] = [];
  const ship = await Nexus.create(Meridian, {
    plugins: [errors(), trace((event) => events.push(event)), ...plugins],
  });
  const di = nexus(ship, {
    request,
    log: () => {},
    ...extra,
  } as NexusHonoOptions);
  const server = serve({ fetch: build(di).fetch, port: 0 });
  await once(server, 'listening');
  open.push({ server, ship });
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, events };
}

const count = (events: TraceEvent[], type: TraceEvent['type']) =>
  events.filter((e) => e.type === type).length;
const until = async (check: () => boolean) => {
  for (let i = 0; i < 100 && !check(); i++)
    await new Promise((r) => setTimeout(r, 10));
  expect(check()).toBe(true);
};

describe('@nexusdi/hono on @hono/node-server', () => {
  it('disposes a JSON response scope after the body is sent', async () => {
    const { url, events } = await start((di) =>
      new Hono().use(di.middleware).get(
        '/log',
        di.inject({ log: FLIGHT_LOG }, ({ log }, c) => {
          log.record('arrived');
          return c.json(log.entries());
        }),
      ),
    );
    expect(await (await fetch(`${url}/log`)).json()).toEqual([
      'survey-7: arrived',
    ]);
    await until(() => count(events, 'scope:dispose') === 1);
  });

  it('keeps the scope open until an SSE stream closes', async () => {
    const { url, events } = await start((di) =>
      new Hono().use(di.middleware).get(
        '/feed',
        di.inject({ log: FLIGHT_LOG }, ({ log }, c) =>
          streamSSE(c, async (s) => {
            for (const n of [1, 2, 3]) {
              await new Promise((r) => setTimeout(r, 20));
              log.record(`ping ${n}`);
              await s.writeSSE({ data: log.entries().join('|') });
            }
          }),
        ),
      ),
    );
    const text = await (await fetch(`${url}/feed`)).text();
    expect(text).toContain(
      'survey-7: ping 1|survey-7: ping 2|survey-7: ping 3',
    );
    expect(text).not.toContain('NEXUS_DISPOSED');
    await until(() => count(events, 'scope:dispose') === 1);
  });

  it('disposes the scope when the client aborts mid-stream', async () => {
    const { url, events } = await start((di) =>
      new Hono().use(di.middleware).get(
        '/feed',
        di.inject({ log: FLIGHT_LOG }, (_, c) =>
          streamSSE(c, async (s) => {
            for (;;) {
              await s.writeSSE({ data: 'tick' });
              await new Promise((r) => setTimeout(r, 20));
              if (s.aborted) return;
            }
          }),
        ),
      ),
    );
    const controller = new AbortController();
    const res = await fetch(`${url}/feed`, { signal: controller.signal });
    await res.body?.getReader().read();
    controller.abort();
    await until(() => count(events, 'scope:dispose') === 1);
  });

  it('disposes the scope and answers 500 when a handler throws', async () => {
    const { url, events } = await start((di) =>
      new Hono().use(di.middleware).get(
        '/fail',
        di.inject({ log: FLIGHT_LOG }, () => {
          throw new Error('sector not charted');
        }),
      ),
    );
    expect((await fetch(`${url}/fail`)).status).toBe(500);
    await until(() => count(events, 'scope:dispose') === 1);
  });

  it('answers 500 with no NEXUS_ in the body for a third-party construct code', async () => {
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
    const { url } = await start(
      (di) =>
        new Hono().use(di.middleware).get(
          '/log',
          di.inject({ log: FLIGHT_LOG }, ({ log }, c) => c.json(log.entries())),
        ),
      {},
      [sensors],
    );
    const res = await fetch(`${url}/log`);
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).not.toContain('NEXUS_');
    expect(body).not.toContain('ACME_');
    expect(body).not.toContain('FlightLog');
  });

  it('gives 50 concurrent requests 50 scopes and no shared scoped instance', async () => {
    const { url, events } = await start((di) =>
      new Hono().use(di.middleware).get(
        '/log',
        di.inject({ log: FLIGHT_LOG }, async ({ log }, c) => {
          log.record('in');
          await new Promise((r) => setTimeout(r, 5));
          return c.json(log.entries());
        }),
      ),
    );
    const bodies = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        fetch(`${url}/log`, {
          headers: { 'x-mission-id': `survey-${i}` },
        }).then((r) => r.json()),
      ),
    );
    bodies.forEach((body, i) => expect(body).toEqual([`survey-${i}: in`]));
    await until(() => count(events, 'scope:dispose') === 50);
    expect(count(events, 'scope:create')).toBe(50);
  });

  it('makes scopes.current() return the request scope inside a service call', async () => {
    const scopes = nodeScopes();
    const logArrival = () =>
      scopes.current()?.get(FLIGHT_LOG).record('arrived');
    const { url } = await start(
      (di) =>
        new Hono().use(di.middleware).get(
          '/log',
          di.inject({ log: FLIGHT_LOG }, async ({ log }, c) => {
            await new Promise((r) => setTimeout(r, 1));
            logArrival();
            return c.json(log.entries());
          }),
        ),
      { scopes },
    );
    expect(await (await fetch(`${url}/log`)).json()).toEqual([
      'survey-7: arrived',
    ]);
  });

  it('serves the first request into a lazy section with scopes set, extending the scope once', async () => {
    const scopes = nodeScopes();
    const ids: string[] = [];
    const { url, events } = await start(
      (di) => {
        const navigation = di.load(Navigation);
        return new Hono()
          .use(di.middleware)
          .use(async (c, next) => {
            ids.push(scopes.current()?.id ?? 'none');
            await next();
            ids.push(scopes.current()?.id ?? 'none');
          })
          .use(navigation)
          .get(
            '/nav/:sector',
            navigation.inject({ routes: NAV_ROUTES }, ({ routes }, c) =>
              c.text(routes.find(c.req.param('sector') ?? '')),
            ),
          );
      },
      { scopes },
    );
    expect(await (await fetch(`${url}/nav/kepler`)).text()).toBe(
      'route to kepler',
    );
    expect(count(events, 'scope:create')).toBe(1);
    const extend = events.filter((e) => e.type === 'scope:extend');
    expect(extend).toHaveLength(1);
    expect(extend[0]).toMatchObject({ modules: ['Navigation'] });
    expect(new Set(ids).size).toBe(1);
  });

  it('keeps the scope through a POST whose handler reads the body and then waits', async () => {
    let disposedMidHandler = -1;
    const { url, events } = await start((di) =>
      new Hono().use(di.middleware).post(
        '/log',
        di.inject({ log: FLIGHT_LOG }, async ({ log }, c) => {
          const { entry } = await c.req.json<{ entry: string }>();
          await new Promise((r) => setTimeout(r, 50));
          disposedMidHandler = count(events, 'scope:dispose');
          log.record(entry);
          return c.json(log.entries());
        }),
      ),
    );
    const res = await fetch(`${url}/log`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entry: 'docked' }),
    });
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toEqual(['survey-7: docked']);
    expect(text).not.toContain('NEXUS_DISPOSED');
    expect(disposedMidHandler).toBe(0);
    await until(() => count(events, 'scope:dispose') === 1);
  });

  it('disposes once when the consumer cancels a stream the handler already returned', async () => {
    let failures = 0;
    const { url, events } = await start((di) =>
      new Hono().use(di.middleware).get(
        '/feed',
        di.inject({ log: FLIGHT_LOG }, ({ log }, c) =>
          stream(c, async (s) => {
            for (let n = 0; n < 20 && !s.aborted; n++) {
              try {
                log.record(`tick ${n}`);
                await s.write(`${log.entries().length}\n`);
              } catch {
                failures += 1;
              }
              await new Promise((r) => setTimeout(r, 10));
            }
          }),
        ),
      ),
    );
    const controller = new AbortController();
    const res = await fetch(`${url}/feed`, { signal: controller.signal });
    const reader = res.body?.getReader();
    const first = await reader?.read();
    const text = new TextDecoder().decode(first?.value);
    await reader?.cancel();
    controller.abort();
    await until(() => count(events, 'scope:dispose') === 1);
    await new Promise((r) => setTimeout(r, 100));
    expect(count(events, 'scope:dispose')).toBe(1);
    expect(text).not.toContain('NEXUS_DISPOSED');
    expect(failures).toBe(0);
  });

  it('logs one RequestFinishedError when the client leaves before the first inject, with nothing uncaught', async () => {
    const log = vi.fn();
    const uncaught: unknown[] = [];
    const record = (reason: unknown) => uncaught.push(reason);
    process.on('uncaughtException', record);
    process.on('unhandledRejection', record);
    const body = vi.fn();
    let ran!: () => void;
    const handled = new Promise<void>((resolve) => {
      ran = resolve;
    });
    const { url, events } = await start(
      (di) =>
        new Hono()
          .use(di.middleware)
          .use(async (c, next) => {
            const signal = c.req.raw.signal;
            if (!signal.aborted)
              await new Promise((resolve) =>
                signal.addEventListener('abort', resolve, { once: true }),
              );
            try {
              await next();
            } finally {
              ran();
            }
          })
          .get('/late', di.inject({ log: FLIGHT_LOG }, body)),
      { log },
    );
    const controller = new AbortController();
    const pending = fetch(`${url}/late`, { signal: controller.signal }).catch(
      () => undefined,
    );
    await new Promise((r) => setTimeout(r, 20));
    controller.abort();
    await pending;
    await handled;
    await new Promise((r) => setTimeout(r, 20));
    process.off('uncaughtException', record);
    process.off('unhandledRejection', record);
    expect(uncaught).toEqual([]);
    expect(body).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'RequestFinishedError' }),
      { adapter: '@nexusdi/hono', phase: 'scope' },
    );
    expect(count(events, 'scope:create')).toBe(0);
  });

  it('answers 500 with no core text and no token name for a missing provider, logging one line', async () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => {});
    const events: TraceEvent[] = [];
    const ship = await Nexus.create(Meridian, {
      plugins: [trace((event) => events.push(event))],
    });
    const di = nexus(() => Promise.resolve(ship), { request });
    const app = new Hono().use(di.middleware).get(
      '/nav',
      di.inject({ routes: NAV_ROUTES }, ({ routes }, c) =>
        c.text(routes.find('kepler')),
      ),
    );
    const server = serve({ fetch: app.fetch, port: 0 });
    await once(server, 'listening');
    open.push({ server, ship });
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/nav`);
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).toBe('Internal Server Error');
    expect(text).not.toContain('NavRoutes');
    // One line: the adapter's, per failing entry. Hono's default handler
    // sends the HTTPException's response without logging.
    expect(write).toHaveBeenCalledOnce();
    expect(write.mock.calls[0]?.slice(0, 2)).toEqual([
      '[@nexusdi/hono] validate:',
      'NEXUS_MISSING_PROVIDER',
    ]);
    write.mockRestore();
  });
});
