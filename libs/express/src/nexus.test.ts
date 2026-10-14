import { EventEmitter } from 'node:events';

import type { NextFunction, Request, Response } from 'express';
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

import { NexusHttpError, nexus } from './index.js';

interface Mission {
  id: string;
  target: string;
}
interface IFlightLog {
  record(entry: string): void;
  entries(): readonly string[];
}
interface NavRoute {
  sector: string;
}

const MISSION = new Token<Mission>('Mission');
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const NAV_ROUTES = new Token<readonly NavRoute[]>('NavRoutes');

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
  providers: [provide(NAV_ROUTES, { useValue: [{ sector: 'Kepler' }] })],
  exports: [NAV_ROUTES],
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

/** A response that emits close when the test says so. */
function fakeResponse(closed = false) {
  const res = new EventEmitter() as EventEmitter & {
    closed: boolean;
    body?: unknown;
    json(body: unknown): void;
    end: ReturnType<typeof vi.fn>;
  };
  res.closed = closed;
  res.end = vi.fn();
  res.json = (body) => {
    res.body = body;
  };
  return res as unknown as Response & {
    body?: unknown;
    end: ReturnType<typeof vi.fn>;
    emit(event: 'close'): boolean;
  };
}

function fakeRequest(headers: Record<string, string> = {}) {
  return {
    get: (name: string) => headers[name.toLowerCase()],
    params: {},
  } as unknown as Request;
}

const mapping = (req: Request): NexusRequest => ({
  mission: {
    id: req.get('x-mission-id') ?? 'survey-7',
    target: 'Kepler-442b',
  },
});

async function run(
  handler: (req: Request, res: Response, next: NextFunction) => unknown,
  req: Request,
  res: Response,
) {
  const next = vi.fn();
  await handler(req, res, next);
  return next;
}

describe('middleware', () => {
  it('creates no scope and never calls the mapping for a request that resolves nothing', async () => {
    const { ship, count } = await shipWithTrace();
    const request = vi.fn(mapping);
    const di = nexus(ship, { request });
    const req = fakeRequest();
    const res = fakeResponse();
    const next = await run(di.middleware, req, res);
    expect(next).toHaveBeenCalledWith();
    res.emit('close');
    await vi.waitFor(() => expect(req.nexus?.started).toBe(false));
    expect(request).not.toHaveBeenCalled();
    expect(count('scope:create')).toBe(0);
    await ship[Symbol.asyncDispose]();
  });

  it('ends a request whose client left before the middleware ran, with no scope and no next()', async () => {
    const { ship, count } = await shipWithTrace();
    const request = vi.fn(mapping);
    const di = nexus(ship, { request });
    const req = fakeRequest();
    const next = await run(di.middleware, req, fakeResponse(true));
    expect(next).not.toHaveBeenCalled();
    expect(req.nexus).toBeUndefined();
    expect(request).not.toHaveBeenCalled();
    expect(count('scope:create')).toBe(0);
    await ship[Symbol.asyncDispose]();
  });

  it('disposes the scope once when the response closes', async () => {
    const { ship, count } = await shipWithTrace();
    const di = nexus(ship, { request: mapping });
    const req = fakeRequest({ 'x-mission-id': 'survey-9' });
    const res = fakeResponse();
    await run(di.middleware, req, res);
    const handler = di.inject({ log: FLIGHT_LOG }, ({ log }, _req, r) => {
      log.record('docked');
      r.json(log.entries());
    });
    await run(handler, req, res);
    expect((res as { body?: unknown }).body).toEqual(['survey-9: docked']);
    res.emit('close');
    res.emit('close');
    await vi.waitFor(() => expect(count('scope:dispose')).toBe(1));
    expect(count('scope:create')).toBe(1);
    await ship[Symbol.asyncDispose]();
  });

  it('runs the rest of the request inside scopes.run when scopes is set', async () => {
    const { ship } = await shipWithTrace();
    const scopes = nodeScopes();
    const di = nexus(ship, { request: mapping, scopes });
    const req = fakeRequest({ 'x-mission-id': 'survey-3' });
    const seen = await new Promise<string | undefined>((resolve) => {
      void di.middleware(req, fakeResponse(), () =>
        resolve(scopes.current()?.get(MISSION).id),
      );
    });
    expect(seen).toBe('survey-3');
    await ship[Symbol.asyncDispose]();
  });

  it('hands next() a 503 when the container is disposed and scopes is set', async () => {
    const { ship } = await shipWithTrace();
    const log = vi.fn();
    const di = nexus(ship, { request: mapping, scopes: nodeScopes(), log });
    await ship[Symbol.asyncDispose]();
    const next = await run(di.middleware, fakeRequest(), fakeResponse());
    const error = next.mock.calls[0]?.[0] as NexusHttpError;
    expect(error).toBeInstanceOf(NexusHttpError);
    expect(error.status).toBe(503);
    expect(log).toHaveBeenCalledOnce();
  });

  it('logs a disposer error with phase dispose and never rethrows it', async () => {
    const HATCH = new Token<AsyncDisposable>('Hatch');
    await using ship = await Nexus.create([
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
    const req = fakeRequest();
    const res = fakeResponse();
    await run(di.middleware, req, res);
    await di.scope(req);
    res.emit('close');
    await vi.waitFor(() => expect(log).toHaveBeenCalledOnce());
    expect(log.mock.calls[0]?.[1]).toEqual({
      adapter: '@nexusdi/express',
      phase: 'dispose',
    });
  });
});

describe('a log that throws', () => {
  it('leaves disposal without an unhandled rejection', async () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unhandled: unknown[] = [];
    const record = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', record);
    const HATCH = new Token<AsyncDisposable>('Hatch');
    await using ship = await Nexus.create([
      provide(HATCH, {
        useFactory: () => ({
          [Symbol.asyncDispose]: () =>
            Promise.reject(new Error('hatch jammed')),
        }),
        lifetime: 'scoped',
      }),
    ]);
    const di = nexus(ship, {
      log: () => {
        throw new Error('log sink offline');
      },
    });
    const req = fakeRequest();
    const res = fakeResponse();
    await run(di.middleware, req, res);
    await di.scope(req);
    res.emit('close');
    await vi.waitFor(() =>
      expect(write).toHaveBeenCalledWith(
        '[@nexusdi/express] log threw:',
        expect.objectContaining({ message: 'log sink offline' }),
        expect.anything(),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    process.off('unhandledRejection', record);
    expect(unhandled).toEqual([]);
    write.mockRestore();
  });

  it('still hands next() the NexusHttpError for a 503', async () => {
    const write = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ship } = await shipWithTrace();
    const di = nexus(ship, {
      request: mapping,
      scopes: nodeScopes(),
      log: () => {
        throw new Error('log sink offline');
      },
    });
    await ship[Symbol.asyncDispose]();
    const next = await run(di.middleware, fakeRequest(), fakeResponse());
    const error = next.mock.calls[0]?.[0] as NexusHttpError;
    expect(error).toBeInstanceOf(NexusHttpError);
    expect(error.status).toBe(503);
    expect(write).toHaveBeenCalledOnce();
    write.mockRestore();
  });
});

describe('inject', () => {
  it('throws at definition, and logs each missing entry, when a token has no provider', async () => {
    const { ship } = await shipWithTrace();
    const log = vi.fn();
    const di = nexus(ship, { request: mapping, log });
    expect(() =>
      di.inject({ routes: NAV_ROUTES, log: FLIGHT_LOG }, () => undefined),
    ).toThrow(/NEXUS_BLUEPRINT_INVALID/);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0]?.[1]).toEqual({
      adapter: '@nexusdi/express',
      phase: 'validate',
    });
    await ship[Symbol.asyncDispose]();
  });

  it('validates on the first request with the function form, and answers 500', async () => {
    const { ship } = await shipWithTrace();
    const log = vi.fn();
    const di = nexus(() => Promise.resolve(ship), { request: mapping, log });
    const handler = di.inject({ routes: NAV_ROUTES }, () => undefined);
    const req = fakeRequest();
    await run(di.middleware, req, fakeResponse());
    const next = await run(handler, req, fakeResponse());
    expect((next.mock.calls[0]?.[0] as NexusHttpError).status).toBe(500);
    await ship[Symbol.asyncDispose]();
  });

  it('logs each failing entry once when the first request validates', async () => {
    const { ship } = await shipWithTrace();
    const log = vi.fn();
    const di = nexus(() => Promise.resolve(ship), { request: mapping, log });
    const absent = new Token<string>('Absent');
    const handler = di.inject({ routes: NAV_ROUTES, absent }, () => undefined);
    const req = fakeRequest();
    await run(di.middleware, req, fakeResponse());
    const next = await run(handler, req, fakeResponse());
    const error = next.mock.calls[0]?.[0] as NexusHttpError;
    expect(error).toBeInstanceOf(NexusHttpError);
    expect(error.status).toBe(500);
    expect(log.mock.calls.map(([, context]) => context)).toEqual([
      { adapter: '@nexusdi/express', phase: 'validate' },
      { adapter: '@nexusdi/express', phase: 'validate' },
    ]);
    await ship[Symbol.asyncDispose]();
  });

  it('logs and ends a request whose response closed before its first inject', async () => {
    const { ship, count } = await shipWithTrace();
    const log = vi.fn();
    const di = nexus(ship, { request: mapping, log });
    const body = vi.fn();
    const handler = di.inject({ log: FLIGHT_LOG }, body);
    const req = fakeRequest();
    const res = fakeResponse();
    await run(di.middleware, req, res);
    res.emit('close');
    const next = await run(handler, req, res);
    expect(next).not.toHaveBeenCalled();
    expect(body).not.toHaveBeenCalled();
    expect(res.end).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'RequestFinishedError' }),
      { adapter: '@nexusdi/express', phase: 'scope' },
    );
    expect(count('scope:create')).toBe(0);
    await ship[Symbol.asyncDispose]();
  });

  it('answers 503 for every request while the function form fails to build, then recovers', async () => {
    const { ship } = await shipWithTrace();
    const build = vi
      .fn<() => Promise<Nexus>>()
      .mockRejectedValueOnce(new Error('charts offline'))
      .mockResolvedValue(ship);
    const log = vi.fn();
    const di = nexus(build, { request: mapping, log });
    const handler = di.inject({ log: FLIGHT_LOG }, ({ log }, _req, res) =>
      res.json(log.entries()),
    );
    const first = fakeRequest();
    await run(di.middleware, first, fakeResponse());
    const failed = await run(handler, first, fakeResponse());
    expect((failed.mock.calls[0]?.[0] as NexusHttpError).status).toBe(503);
    expect(log.mock.calls[0]?.[1]).toEqual({
      adapter: '@nexusdi/express',
      phase: 'build',
      status: 503,
    });
    const second = fakeRequest();
    const res = fakeResponse();
    await run(di.middleware, second, res);
    const ok = await run(handler, second, res);
    expect(ok).not.toHaveBeenCalled();
    expect((res as { body?: unknown }).body).toEqual([]);
    await ship[Symbol.asyncDispose]();
  });

  it('refuses a request on which the middleware never ran', async () => {
    const { ship } = await shipWithTrace();
    const di = nexus(ship, { request: mapping });
    const next = await run(
      di.inject({ log: FLIGHT_LOG }, () => undefined),
      fakeRequest(),
      fakeResponse(),
    );
    expect(String(next.mock.calls[0]?.[0])).toMatch(
      /register di\.middleware before this route/,
    );
    await expect(di.scope(fakeRequest())).rejects.toThrow(
      /register di\.middleware before this route/,
    );
    await ship[Symbol.asyncDispose]();
  });
});

describe('load', () => {
  it("lets a section's first request inject a token from the loaded module", async () => {
    const { ship } = await shipWithTrace();
    const di = nexus(ship, { request: mapping });
    const section = di.load(Navigation);
    const handler = section.inject(
      { routes: NAV_ROUTES },
      ({ routes }, _req, res) => res.json(routes),
    );
    const req = fakeRequest();
    const res = fakeResponse();
    await run(di.middleware, req, res);
    const loaded = await run(section, req, res);
    expect(loaded).toHaveBeenCalledWith();
    await run(handler, req, res);
    expect((res as { body?: unknown }).body).toEqual([{ sector: 'Kepler' }]);
    await ship[Symbol.asyncDispose]();
  });

  it('extends a scope that started before the section loaded', async () => {
    const { ship, count } = await shipWithTrace();
    const di = nexus(ship, { request: mapping, scopes: nodeScopes() });
    const section = di.load(Navigation);
    const req = fakeRequest();
    const res = fakeResponse();
    await new Promise<void>((resolve) => {
      void di.middleware(req, res, () => resolve());
    });
    const before = await di.scope(req);
    await run(section, req, res);
    const after = await di.scope(req);
    expect(after).toBe(before);
    expect(after.get(NAV_ROUTES)).toEqual([{ sector: 'Kepler' }]);
    expect(count('scope:extend')).toBe(1);
    await ship[Symbol.asyncDispose]();
  });

  it('extends an ambient scope from section.inject alone, with no section middleware', async () => {
    const { ship, count } = await shipWithTrace();
    const di = nexus(ship, { request: mapping, scopes: nodeScopes() });
    const handler = di
      .load(Navigation)
      .inject({ routes: NAV_ROUTES }, ({ routes }, _req, res) =>
        res.json(routes),
      );
    const req = fakeRequest();
    const res = fakeResponse();
    await new Promise<void>((resolve) => {
      void di.middleware(req, res, () => resolve());
    });
    const next = await run(handler, req, res);
    expect(next).not.toHaveBeenCalled();
    expect((res as { body?: unknown }).body).toEqual([{ sector: 'Kepler' }]);
    expect(count('scope:create')).toBe(1);
    expect(count('scope:extend')).toBe(1);
    await ship[Symbol.asyncDispose]();
  });
});
