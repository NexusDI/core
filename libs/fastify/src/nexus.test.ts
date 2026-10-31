import { EventEmitter } from 'node:events';

import Fastify, {
  type FastifyReply,
  type FastifyRequest,
  type onRequestHookHandler,
} from 'fastify';
import { describe, expect, it, vi } from 'vitest';

import {
  defineModule,
  Nexus,
  provide,
  REQUEST,
  Token,
  type NexusRequest,
  type TraceEvent,
} from '@nexusdi/core';
import { trace } from '@nexusdi/devtools';
import { nodeScopes } from '@nexusdi/node';

import { nexus, type LogContext, type NexusFastify } from './index.js';

interface Mission {
  id: string;
  target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}

const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
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

const bridge = [
  provide(MISSION, {
    useFactory: (request: NexusRequest) =>
      request.mission ?? { id: 'survey-7', target: 'Kepler-442b' },
    deps: [REQUEST],
    lifetime: 'scoped',
  }),
  provide(FLIGHT_LOG, { useClass: ShuttleFlightLog, lifetime: 'scoped' }),
];

const Navigation = defineModule({
  name: 'Navigation',
  providers: [provide(NAV_ROUTES, { useValue: ['Kepler'] })],
  exports: [NAV_ROUTES],
});

const mapping = (req: FastifyRequest): NexusRequest => ({
  mission: {
    id: String(req.headers['x-mission-id'] ?? 'survey-7'),
    target: 'Kepler-442b',
  },
});

async function shipWithTrace() {
  const events: TraceEvent[] = [];
  const ship = await Nexus.create(bridge, {
    plugins: [trace((event) => events.push(event))],
  });
  const count = (type: TraceEvent['type']) =>
    events.filter((event) => event.type === type).length;
  return { ship, count };
}

/**
 * The onRequest hook `di.encapsulatedPlugin` registers, read off a stand-in
 * Fastify instance, so a case can call it on a request whose client has
 * already gone, which a live server never hands a route.
 */
async function onRequestOf(di: NexusFastify): Promise<onRequestHookHandler> {
  let hook: onRequestHookHandler | undefined;
  const fastify = {
    decorateRequest: vi.fn(),
    addHook: (name: string, handler: onRequestHookHandler) => {
      if (name === 'onRequest') hook = handler;
    },
  };
  await di.encapsulatedPlugin.call(undefined as never, fastify as never, {});
  if (hook === undefined) throw new Error('the plugin added no onRequest hook');
  return hook;
}

describe('nexus', () => {
  describe('the plugin', () => {
    it('resolves typed deps per request and disposes the scope after the reply', async () => {
      const { ship, count } = await shipWithTrace();
      const di = nexus(ship, { request: mapping });
      const app = Fastify();
      await app.register(di.plugin);
      app.get(
        '/log',
        di.inject({ log: FLIGHT_LOG }, ({ log }) => {
          log.record('docked');
          return log.entries();
        }),
      );
      const res = await app.inject({
        url: '/log',
        headers: { 'x-mission-id': 'survey-9' },
      });
      expect(res.json()).toEqual(['survey-9: docked']);
      await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
      await app.close();
      await ship[Symbol.asyncDispose]();
    });

    it('creates no scope for a route that resolves nothing', async () => {
      const { ship, count } = await shipWithTrace();
      const request = vi.fn(mapping);
      const di = nexus(ship, { request });
      const app = Fastify();
      await app.register(di.plugin);
      app.get('/ping', () => 'pong');
      expect((await app.inject({ url: '/ping' })).body).toBe('pong');
      expect(count('scope:create')).toBe(0);
      expect(request).not.toHaveBeenCalled();
      await app.close();
      await ship[Symbol.asyncDispose]();
    });

    it('calls done() and creates nothing when the client left before the hook ran', async () => {
      const { ship, count } = await shipWithTrace();
      const request = vi.fn(mapping);
      const hook = await onRequestOf(nexus(ship, { request }));
      const raw = Object.assign(new EventEmitter(), { closed: true });
      const req = {
        nexus: null,
        log: { error: vi.fn() },
      } as unknown as FastifyRequest;
      const done = vi.fn();
      hook.call(
        undefined as never,
        req,
        { raw } as unknown as FastifyReply,
        done,
      );
      expect(done).toHaveBeenCalledWith();
      expect(req.nexus?.started).toBe(false);
      expect(request).not.toHaveBeenCalled();
      expect(count('scope:create')).toBe(0);
      await ship[Symbol.asyncDispose]();
    });

    it('logs one RequestFinishedError and ends the reply for a route after an early-closed hook', async () => {
      const { ship, count } = await shipWithTrace();
      const log = vi.fn();
      const di = nexus(ship, { request: mapping, log });
      const hook = await onRequestOf(di);
      const raw = Object.assign(new EventEmitter(), {
        closed: true,
        writableEnded: false,
        end: vi.fn(),
      });
      const req = { nexus: null, log: {} } as unknown as FastifyRequest;
      const reply = { raw, hijack: vi.fn() } as unknown as FastifyReply;
      hook.call(undefined as never, req, reply, vi.fn());
      const body = vi.fn();
      const handler = di.inject({ log: FLIGHT_LOG }, body);
      await expect(
        handler.call(undefined as never, req as never, reply),
      ).resolves.toBe(reply);
      expect(body).not.toHaveBeenCalled();
      expect(raw.end).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: 'RequestFinishedError' }),
        { adapter: '@nexusdi/fastify', phase: 'scope' },
      );
      expect(count('scope:create')).toBe(0);
      await ship[Symbol.asyncDispose]();
    });

    it('carries the scope through the lifecycle when scopes is set', async () => {
      const { ship } = await shipWithTrace();
      const scopes = nodeScopes();
      const di = nexus(ship, { request: mapping, scopes });
      const app = Fastify();
      await app.register(di.plugin);
      app.get('/mission', async () => {
        await Promise.resolve();
        return { id: scopes.current()?.get(MISSION).id };
      });
      const res = await app.inject({
        url: '/mission',
        headers: { 'x-mission-id': 'survey-3' },
      });
      expect(res.json()).toEqual({ id: 'survey-3' });
      await app.close();
      await ship[Symbol.asyncDispose]();
    });

    it('answers 503 with no code field once the container is disposed', async () => {
      const { ship } = await shipWithTrace();
      const di = nexus(ship, { request: mapping, log: () => {} });
      const app = Fastify();
      await app.register(di.plugin);
      app.get(
        '/log',
        di.inject({ log: FLIGHT_LOG }, ({ log }) => log.entries()),
      );
      await ship[Symbol.asyncDispose]();
      const res = await app.inject({ url: '/log' });
      expect(res.statusCode).toBe(503);
      expect(res.json()).not.toHaveProperty('code');
      expect(res.body).not.toContain('NEXUS_');
      await app.close();
    });

    it('applies the encapsulated plugin only inside its context', async () => {
      const { ship } = await shipWithTrace();
      const di = nexus(ship, { request: mapping });
      const app = Fastify();
      await app.register(async (bridgeApi) => {
        await bridgeApi.register(di.encapsulatedPlugin);
        bridgeApi.get('/inside', async (req) => req.nexus !== null);
      });
      app.get('/outside', async (req) => req.nexus ?? null);
      expect((await app.inject({ url: '/inside' })).json()).toBe(true);
      expect((await app.inject({ url: '/outside' })).json()).toBeNull();
      await app.close();
      await ship[Symbol.asyncDispose]();
    });

    it("lets a section's first request inject a token from the loaded module", async () => {
      const { ship } = await shipWithTrace();
      const di = nexus(ship, { request: mapping });
      const app = Fastify();
      await app.register(di.plugin);
      const navigation = di.load(Navigation);
      await app.register(async (section) => {
        section.addHook('onRequest', navigation);
        section.get(
          '/navigation',
          navigation.inject({ routes: NAV_ROUTES }, ({ routes }) => routes),
        );
      });
      expect((await app.inject({ url: '/navigation' })).json()).toEqual([
        'Kepler',
      ]);
      await app.close();
      await ship[Symbol.asyncDispose]();
    });

    it("loads a section with a load import once and lets its handler inject a token built from the imported module's export", async () => {
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
      const ship = await Nexus.create(
        defineModule({ name: 'Root', imports: [Helm], providers: bridge }),
      );
      const load = vi.spyOn(ship, 'load');
      const di = nexus(ship, { request: mapping });
      const app = Fastify();
      await app.register(di.plugin);
      const chart = di.load(Chart, { imports: [Helm] });
      await app.register(async (section) => {
        section.addHook('onRequest', chart);
        section.get(
          '/course',
          chart.inject({ course: COURSE }, ({ course }) => course),
        );
      });
      for (let i = 0; i < 2; i++)
        expect((await app.inject({ url: '/course' })).body).toBe(
          'course by helm-1',
        );
      expect(load).toHaveBeenCalledTimes(1);
      expect(load).toHaveBeenCalledWith(Chart, { imports: [Helm] });
      await app.close();
      await ship[Symbol.asyncDispose]();
    });

    it('extends an ambient scope from section.inject alone, with no section hook', async () => {
      const { ship, count } = await shipWithTrace();
      const di = nexus(ship, { request: mapping, scopes: nodeScopes() });
      const app = Fastify();
      await app.register(di.plugin);
      app.get(
        '/navigation',
        di
          .load(Navigation)
          .inject({ routes: NAV_ROUTES }, ({ routes }) => routes),
      );
      expect((await app.inject({ url: '/navigation' })).json()).toEqual([
        'Kepler',
      ]);
      expect(count('scope:create')).toBe(1);
      expect(count('scope:extend')).toBe(1);
      await app.close();
      await ship[Symbol.asyncDispose]();
    });

    it('refuses scope() on a request the plugin never saw', async () => {
      const { ship } = await shipWithTrace();
      const di = nexus(ship, { request: mapping });
      await expect(di.scope({ nexus: null } as FastifyRequest)).rejects.toThrow(
        /register di\.plugin before this route/,
      );
      await ship[Symbol.asyncDispose]();
    });
  });

  describe('logging', () => {
    it('logs through req.log by default, with the code and the fields as keys', async () => {
      const { ship } = await shipWithTrace();
      const lines: Record<string, unknown>[] = [];
      const app = Fastify({
        logger: {
          level: 'warn',
          stream: { write: (line: string) => lines.push(JSON.parse(line)) },
        },
      });
      const di = nexus(ship, { request: mapping });
      await app.register(di.plugin);
      app.get(
        '/log',
        di.inject({ log: FLIGHT_LOG }, ({ log }) => log.entries()),
      );
      await ship[Symbol.asyncDispose]();
      expect((await app.inject({ url: '/log' })).statusCode).toBe(503);
      expect(lines).toContainEqual(
        expect.objectContaining({
          level: 40,
          code: 'NEXUS_DISPOSED',
          adapter: '@nexusdi/fastify',
          phase: 'scope',
          status: 503,
        }),
      );
      await app.close();
    });

    it('logs each failing entry once when the first request validates', async () => {
      const { ship } = await shipWithTrace();
      const log = vi.fn();
      const di = nexus(() => Promise.resolve(ship), { request: mapping, log });
      const app = Fastify();
      await app.register(di.plugin);
      const absent = new Token<string>('Absent');
      app.get(
        '/routes',
        di.inject({ routes: NAV_ROUTES, absent }, ({ routes }) => routes),
      );
      expect((await app.inject({ url: '/routes' })).statusCode).toBe(500);
      expect(log.mock.calls.map(([, context]) => context)).toEqual([
        { adapter: '@nexusdi/fastify', phase: 'validate' },
        { adapter: '@nexusdi/fastify', phase: 'validate' },
      ]);
      await app.close();
      await ship[Symbol.asyncDispose]();
    });

    it('still answers 503 when the log throws', async () => {
      const write = vi.spyOn(console, 'error').mockImplementation(() => {});
      const { ship } = await shipWithTrace();
      const di = nexus(ship, {
        request: mapping,
        log: () => {
          throw new Error('log sink offline');
        },
      });
      const app = Fastify();
      await app.register(di.plugin);
      app.get(
        '/log',
        di.inject({ log: FLIGHT_LOG }, ({ log }) => log.entries()),
      );
      await ship[Symbol.asyncDispose]();
      expect((await app.inject({ url: '/log' })).statusCode).toBe(503);
      expect(write).toHaveBeenCalledWith(
        '[@nexusdi/fastify] log threw:',
        expect.objectContaining({ message: 'log sink offline' }),
        expect.anything(),
      );
      write.mockRestore();
      await app.close();
    });

    it('logs a disposer error with phase dispose and never rethrows it', async () => {
      const HATCH = new Token<AsyncDisposable>('Hatch');
      const ship = await Nexus.create([
        provide(HATCH, {
          useFactory: () => ({
            [Symbol.asyncDispose]: () =>
              Promise.reject(new Error('hatch jammed')),
          }),
          lifetime: 'scoped',
        }),
      ]);
      const log = vi.fn();
      const di = nexus(ship, { log });
      const app = Fastify();
      await app.register(di.plugin);
      app.get('/hatch', async (req) => {
        (await di.scope(req)).get(HATCH);
        return 'open';
      });
      expect((await app.inject({ url: '/hatch' })).body).toBe('open');
      await vi.waitFor(() => expect(log).toHaveBeenCalledOnce());
      expect(log.mock.calls[0]?.[1]).toEqual({
        adapter: '@nexusdi/fastify',
        phase: 'dispose',
      });
      await app.close();
      await ship[Symbol.asyncDispose]();
    });

    it('logs and ends a request whose client left before its first inject', async () => {
      const { ship, count } = await shipWithTrace();
      const log = vi.fn();
      const di = nexus(ship, { request: mapping, log });
      const hook = await onRequestOf(di);
      const raw = Object.assign(new EventEmitter(), {
        closed: false,
        writableEnded: false,
        end: vi.fn(),
      });
      const req = { nexus: null, log: {} } as unknown as FastifyRequest;
      const reply = { raw, hijack: vi.fn() } as unknown as FastifyReply;
      hook.call(undefined as never, req, reply, vi.fn());
      raw.emit('close');
      const body = vi.fn();
      const handler = di.inject({ log: FLIGHT_LOG }, body);
      await handler.call(undefined as never, req as never, reply);
      expect(body).not.toHaveBeenCalled();
      expect(reply.hijack).toHaveBeenCalledOnce();
      expect(raw.end).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ name: 'RequestFinishedError' }),
        { adapter: '@nexusdi/fastify', phase: 'scope' },
      );
      expect(count('scope:create')).toBe(0);
      await ship[Symbol.asyncDispose]();
    });
  });

  describe('disposing the adapter', () => {
    /** An app with the plugin and one di.inject route at /log. */
    async function appOf(di: NexusFastify) {
      const app = Fastify();
      await app.register(di.plugin);
      app.get(
        '/log',
        di.inject({ log: FLIGHT_LOG }, ({ log }) => log.entries()),
      );
      return app;
    }

    it('answers 503 from injectHook and a section injectHook after dispose, and never runs them', async () => {
      const { ship } = await shipWithTrace();
      const di = nexus(() => Promise.resolve(ship), {
        request: mapping,
        log: () => {},
      });
      const hook = vi.fn(async () => {});
      const sectionHook = vi.fn(async () => {});
      const app = Fastify();
      await app.register(di.plugin);
      app.get(
        '/navigation',
        {
          preHandler: [
            di.injectHook({ log: FLIGHT_LOG }, hook),
            di.load(Navigation).injectHook({ routes: NAV_ROUTES }, sectionHook),
          ],
        },
        () => 'ok',
      );
      expect((await app.inject({ url: '/navigation' })).statusCode).toBe(200);
      await di[Symbol.asyncDispose]();
      expect((await app.inject({ url: '/navigation' })).statusCode).toBe(503);
      expect(hook).toHaveBeenCalledOnce();
      expect(sectionHook).toHaveBeenCalledOnce();
      await app.close();
    });

    it('disposes a container it built once, and answers 503 after', async () => {
      const { ship, count } = await shipWithTrace();
      const source = vi.fn(() => Promise.resolve(ship));
      const log = vi.fn();
      const di = nexus(source, { request: mapping, log });
      const app = await appOf(di);
      expect((await app.inject({ url: '/log' })).statusCode).toBe(200);
      await di[Symbol.asyncDispose]();
      expect(count('dispose')).toBe(1);
      expect(count('scope:create')).toBe(1);
      expect((await app.inject({ url: '/log' })).statusCode).toBe(503);
      expect(source).toHaveBeenCalledTimes(1);
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'AdapterDisposedError' }),
        expect.objectContaining({ phase: 'validate', status: 503 }),
      );
      await app.close();
    });

    it('serves two apps in a row, since closing an app leaves the adapter open', async () => {
      const { ship } = await shipWithTrace();
      const di = nexus(() => Promise.resolve(ship), { request: mapping });
      for (let i = 0; i < 2; i += 1) {
        const app = await appOf(di);
        expect((await app.inject({ url: '/log' })).statusCode).toBe(200);
        await app.close();
      }
      expect(ship.has(FLIGHT_LOG)).toBe(true);
      await di[Symbol.asyncDispose]();
    });

    it('returns the first promise on a second call, rejected with a disposer error', async () => {
      const cause = new Error('coolant pump stuck');
      const PUMP = new Token<object>('CoolantPump');
      const di = nexus(
        () =>
          Nexus.create([
            provide(PUMP, {
              useFactory: () => ({
                [Symbol.asyncDispose]: () => Promise.reject(cause),
              }),
            }),
          ]),
        { request: mapping, log: () => {} },
      );
      const app = Fastify();
      await app.register(di.plugin);
      app.get(
        '/pump',
        di.inject({ pump: PUMP }, () => 'ok'),
      );
      expect((await app.inject({ url: '/pump' })).statusCode).toBe(200);
      await app.close();
      const first = di[Symbol.asyncDispose]();
      expect(di[Symbol.asyncDispose]()).toBe(first);
      await expect(first).rejects.toBe(cause);
    });

    it('answers 503 at phase load for a section after dispose', async () => {
      const { ship } = await shipWithTrace();
      const log = vi.fn();
      const di = nexus(ship, { request: mapping, log });
      const navigation = di.load(Navigation);
      const app = Fastify();
      await app.register(di.plugin);
      await app.register(async (section) => {
        section.addHook('onRequest', navigation);
        section.get('/navigation', () => 'ok');
      });
      await di[Symbol.asyncDispose]();
      expect((await app.inject({ url: '/navigation' })).statusCode).toBe(503);
      expect(log).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'AdapterDisposedError' }),
        expect.objectContaining({ phase: 'load', status: 503 }),
      );
      await app.close();
      await ship[Symbol.asyncDispose]();
    });

    it('never calls a function no request called', async () => {
      const source = vi.fn(() => Nexus.create(bridge));
      const di = nexus(source, { request: mapping, log: () => {} });
      const app = await appOf(di);
      await di[Symbol.asyncDispose]();
      expect((await app.inject({ url: '/log' })).statusCode).toBe(503);
      await app.close();
      expect(source).not.toHaveBeenCalled();
    });

    it('answers 503 to a request that waited on the build the dispose raced', async () => {
      const { ship } = await shipWithTrace();
      let finish!: (built: Nexus) => void;
      const gate = new Promise<Nexus>((resolve) => (finish = resolve));
      const log = vi.fn();
      const source = vi.fn(() => gate);
      const di = nexus(source, { request: mapping, log });
      const app = await appOf(di);
      const answer = app.inject({ url: '/log' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(source).toHaveBeenCalledOnce(); // the request started the build
      const disposed = di[Symbol.asyncDispose]();
      finish(ship);
      expect((await answer).statusCode).toBe(503);
      // The step that reaches the container last decides which error it is.
      const [error, context] = log.mock.calls[0] as [Error, LogContext];
      expect(['AdapterDisposedError', 'DisposedError']).toContain(error.name);
      expect(context.status).toBe(503);
      await disposed;
      expect(() => ship.has(FLIGHT_LOG)).toThrow();
      await app.close();
    });

    it('leaves a given container open, serves a scope that exists, and refuses a new request', async () => {
      const { ship } = await shipWithTrace();
      const di = nexus(ship, { request: mapping, log: () => {} });
      let resume!: () => void;
      const paused = new Promise<void>((resolve) => (resume = resolve));
      const app = await appOf(di);
      app.get(
        '/paused',
        di.inject({ log: FLIGHT_LOG }, async (_, req) => {
          await paused;
          return (await di.scope(req)).get(FLIGHT_LOG).entries();
        }),
      );
      const open = app.inject({ url: '/paused' });
      await new Promise((resolve) => setTimeout(resolve, 10));
      await di[Symbol.asyncDispose]();
      resume();
      expect((await open).statusCode).toBe(200);
      expect((await app.inject({ url: '/log' })).statusCode).toBe(503);
      await app.close();
      expect(ship.has(FLIGHT_LOG)).toBe(true);
      await ship[Symbol.asyncDispose]();
    });

    it('answers 503 to a request that resolves nothing when scopes is set', async () => {
      const { ship } = await shipWithTrace();
      const di = nexus(ship, {
        request: mapping,
        scopes: nodeScopes(),
        log: () => {},
      });
      const app = Fastify();
      await app.register(di.plugin);
      app.get('/ping', () => 'pong');
      await di[Symbol.asyncDispose]();
      expect((await app.inject({ url: '/ping' })).statusCode).toBe(503);
      await app.close();
      await ship[Symbol.asyncDispose]();
    });
  });

  describe('injectHook', () => {
    const ACCESS = new Token<{
      mayFire(operator: string | undefined): boolean;
    }>('AccessControl');
    const access = provide(ACCESS, {
      useValue: { mayFire: (operator) => operator === 'helm' },
    });
    async function guarded() {
      return Nexus.create([...bridge, access]);
    }

    it('ends the request from a preHandler hook, and the route never runs', async () => {
      const ship = await guarded();
      const di = nexus(ship, { request: mapping });
      const route = vi.fn(() => 'fired');
      const later = vi.fn(async () => {});
      const app = Fastify();
      await app.register(di.plugin);
      app.post(
        '/drive/fire',
        {
          preHandler: [
            di.injectHook(
              { access: ACCESS },
              async ({ access }, req, reply) => {
                if (!access.mayFire(req.headers['x-operator'] as string))
                  return reply.code(403).send({ error: 'Forbidden' });
              },
            ),
            later,
          ],
        },
        route,
      );
      const res = await app.inject({ method: 'POST', url: '/drive/fire' });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toEqual({ error: 'Forbidden' });
      expect(later).not.toHaveBeenCalled();
      expect(route).not.toHaveBeenCalled();
      const ok = await app.inject({
        method: 'POST',
        url: '/drive/fire',
        headers: { 'x-operator': 'helm' },
      });
      expect(ok.body).toBe('fired');
      await app.close();
      await ship[Symbol.asyncDispose]();
    });

    it('lets the route see the scoped instance the hook saw', async () => {
      const ship = await guarded();
      const di = nexus(ship, { request: mapping });
      const app = Fastify();
      await app.register(di.plugin);
      let seen: IFlightLog | undefined;
      app.addHook(
        'preHandler',
        di.injectHook({ log: FLIGHT_LOG }, async ({ log }) => {
          seen = log;
          log.record('cleared');
        }),
      );
      app.get(
        '/log',
        di.inject({ log: FLIGHT_LOG }, ({ log }) => {
          expect(log).toBe(seen);
          return log.entries();
        }),
      );
      expect((await app.inject({ url: '/log' })).json()).toEqual([
        'survey-7: cleared',
      ]);
      await app.close();
      await ship[Symbol.asyncDispose]();
    });

    it('runs as an instance onRequest hook added after the plugin was registered', async () => {
      const ship = await guarded();
      const di = nexus(ship, { request: mapping });
      const app = Fastify();
      void app.register(di.plugin);
      app.addHook(
        'onRequest',
        di.injectHook({ access: ACCESS }, async ({ access }, req, reply) => {
          if (!access.mayFire(req.headers['x-operator'] as string))
            return reply.code(403).send();
        }),
      );
      app.get('/drive', () => 'fired');
      expect((await app.inject({ url: '/drive' })).statusCode).toBe(403);
      await app.close();
      await ship[Symbol.asyncDispose]();
    });

    it('tells the user to register the plugin first when an onRequest hook was added before it', async () => {
      const ship = await guarded();
      const di = nexus(ship, { request: mapping });
      const app = Fastify();
      app.addHook(
        'onRequest',
        di.injectHook({ access: ACCESS }, async () => {}),
      );
      await app.register(di.plugin);
      app.get('/drive', () => 'fired');
      const res = await app.inject({ url: '/drive' });
      expect(res.statusCode).toBe(500);
      expect(res.json().message).toMatch(
        /Register di\.plugin \(or di\.encapsulatedPlugin, in this context or a parent\) before addHook\('onRequest'/,
      );
      await app.close();
      await ship[Symbol.asyncDispose]();
    });

    it('passes a resolve failure to the error handler with no core text', async () => {
      const ship = await guarded();
      const di = nexus(ship, {
        request: () => undefined as unknown as NexusRequest,
        log: () => {},
      });
      const route = vi.fn(() => 'fired');
      const app = Fastify();
      await app.register(di.plugin);
      app.get(
        '/log',
        { preHandler: di.injectHook({ log: FLIGHT_LOG }, async () => {}) },
        route,
      );
      const res = await app.inject({ url: '/log' });
      expect(res.statusCode).toBe(500);
      expect(res.body).not.toContain('NEXUS_');
      expect(route).not.toHaveBeenCalled();
      await app.close();
      await ship[Symbol.asyncDispose]();
    });

    it('passes an error the hook throws to the error handler', async () => {
      const ship = await guarded();
      const di = nexus(ship, { request: mapping });
      const app = Fastify();
      await app.register(di.plugin);
      app.get(
        '/drive',
        {
          preHandler: di.injectHook({ access: ACCESS }, async () => {
            throw Object.assign(new Error('no badge'), { statusCode: 401 });
          }),
        },
        () => 'fired',
      );
      const res = await app.inject({ url: '/drive' });
      expect(res.statusCode).toBe(401);
      expect(res.json().message).toBe('no badge');
      await app.close();
      await ship[Symbol.asyncDispose]();
    });

    it('returns an async function of two parameters, which Fastify requires of an async hook', async () => {
      const ship = await guarded();
      const di = nexus(ship, { request: mapping });
      expect(di.injectHook({ access: ACCESS }, async () => {})).toHaveLength(2);
      expect(
        di.load(Navigation).injectHook({ routes: NAV_ROUTES }, async () => {}),
      ).toHaveLength(2);
      await ship[Symbol.asyncDispose]();
    });

    it('throws at definition for a token with no provider', async () => {
      const ship = await guarded();
      const di = nexus(ship, { request: mapping, log: () => {} });
      expect(() =>
        di.injectHook({ routes: NAV_ROUTES }, async () => {}),
      ).toThrow(/NEXUS_BLUEPRINT_INVALID/);
      await ship[Symbol.asyncDispose]();
    });

    it('checks a section hook at its first request, and answers 500 for a token no module provides', async () => {
      const ship = await guarded();
      const di = nexus(ship, { request: mapping, log: () => {} });
      const navigation = di.load(Navigation);
      const absent = new Token<string>('Absent');
      const app = Fastify();
      await app.register(di.plugin);
      await app.register(async (section) => {
        section.addHook('onRequest', navigation);
        section.get(
          '/navigation',
          { preHandler: navigation.injectHook({ absent }, async () => {}) },
          () => 'in sector',
        );
      });
      const res = await app.inject({ url: '/navigation' });
      expect(res.statusCode).toBe(500);
      expect(res.body).not.toContain('NEXUS_');
      await app.close();
      await ship[Symbol.asyncDispose]();
    });

    it("resolves a section hook's exports after the section loads", async () => {
      const ship = await guarded();
      const di = nexus(ship, { request: mapping });
      const navigation = di.load(Navigation);
      const app = Fastify();
      await app.register(di.plugin);
      await app.register(async (section) => {
        section.addHook('onRequest', navigation);
        section.get(
          '/navigation',
          {
            preHandler: navigation.injectHook(
              { routes: NAV_ROUTES },
              async ({ routes }, req, reply) => {
                if (req.headers['x-sector'] === undefined)
                  return reply.code(400).send(routes);
              },
            ),
          },
          () => 'in sector',
        );
      });
      const res = await app.inject({ url: '/navigation' });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual(['Kepler']);
      expect(
        (
          await app.inject({
            url: '/navigation',
            headers: { 'x-sector': 'vega' },
          })
        ).body,
      ).toBe('in sector');
      await app.close();
      await ship[Symbol.asyncDispose]();
    });
  });
});
