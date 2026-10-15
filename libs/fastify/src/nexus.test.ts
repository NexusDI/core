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

import { nexus, type NexusFastify } from './index.js';

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
});
