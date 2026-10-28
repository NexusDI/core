import { defineModule, Nexus, Token, optional } from '@nexusdi/core';
import { RouterContextProvider, type MiddlewareFunction } from 'react-router';
import type { GetAnnotations } from 'react-router/internal';
import { describe, expectTypeOf, it } from 'vitest';

import { nexus } from './index.js';

// What React Router 7's typegen writes for an app that enables middleware:
// 7.9 reads the flag as `middleware` and later 7.x as `v8_middleware`.
// Without it, React Router 7 types a route's context as AppLoadContext.
// React Router 8 has no such flag and reads neither key.
declare module 'react-router' {
  interface Future {
    middleware: true;
    v8_middleware: true;
  }
}

interface IFlightLog {
  entries(): readonly string[];
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const RELAY = new Token<string>('Relay');
declare const ship: Nexus;
const di = nexus(ship, {
  request: () => ({ mission: { id: 'survey-7', target: 'Kepler-442b' } }),
});

interface LoaderArgs {
  params: { to: string };
  request: Request;
  context: Readonly<RouterContextProvider>;
}

describe('@nexusdi/react-router types', () => {
  it('types the record and keeps the args type of the wrapped loader', () => {
    const loader = di.inject(
      { log: FLIGHT_LOG, relay: optional(RELAY) },
      (deps, args: LoaderArgs) => {
        expectTypeOf(deps.log).toEqualTypeOf<IFlightLog>();
        expectTypeOf(deps.relay).toEqualTypeOf<string | undefined>();
        expectTypeOf(args.params.to).toEqualTypeOf<string>();
        return { course: args.params.to };
      },
    );
    expectTypeOf(loader).parameter(0).toEqualTypeOf<LoaderArgs>();
    expectTypeOf(loader).returns.resolves.toEqualTypeOf<{ course: string }>();
  });

  it('requires the request mapping when NexusRequest has a required field', () => {
    // @ts-expect-error: test-support makes `mission` required
    nexus(ship, {});
  });

  it('types the middleware to take React Router args and resolve a Response', async () => {
    const context = new RouterContextProvider();
    const request = new Request('http://bridge/course/Kepler-442b');
    // React Router 8 adds url and pattern to the args, which 7.9 lacks, so
    // the object fits either line through the middleware's own parameter.
    const args = {
      request,
      url: new URL(request.url),
      pattern: '/course/:to',
      params: { to: 'Kepler-442b' },
      context,
    } as unknown as Parameters<typeof di.middleware>[0];
    const res = await di.middleware(args, async () => Response.json([]));
    expectTypeOf(res).toEqualTypeOf<Response>();
    expectTypeOf(di.middleware).toExtend<MiddlewareFunction<Response>>();
  });

  it('types the handle as AsyncDisposable', () => {
    expectTypeOf(di).toExtend<AsyncDisposable>();
  });

  it('infers deps, args and next for a middleware in a typed middleware array', () => {
    const middleware: MiddlewareFunction<Response>[] = [
      di.injectMiddleware({ log: FLIGHT_LOG }, async (deps, args, next) => {
        expectTypeOf(deps.log).toEqualTypeOf<IFlightLog>();
        expectTypeOf(args.request).toEqualTypeOf<Request>();
        expectTypeOf(next).returns.toEqualTypeOf<Promise<Response>>();
        return next();
      }),
    ];
    void middleware;
  });

  it('infers args from the typegen Route.MiddlewareFunction type', () => {
    // What `import type { Route } from './+types/crew'` gives for '/crew/:id'.
    type Route = GetAnnotations<{
      params: { id: string };
      loaderData: unknown;
      actionData: unknown;
      module: any; // typegen passes the route module and matches here
      matches: any;
    }>;
    const middleware: Route['MiddlewareFunction'][] = [
      di.injectMiddleware({ log: FLIGHT_LOG }, async (_deps, args, next) => {
        expectTypeOf(args.params.id).toEqualTypeOf<string>();
        expectTypeOf(next).returns.toEqualTypeOf<Promise<Response>>();
        return next();
      }),
      di.middleware,
    ];
    void middleware;
  });

  it('keeps the args type of an annotated middleware', () => {
    const guard = di.injectMiddleware(
      { log: FLIGHT_LOG },
      async (_deps, args: LoaderArgs, next) => {
        expectTypeOf(args.params.to).toEqualTypeOf<string>();
        return next();
      },
    );
    expectTypeOf(guard).parameter(0).toEqualTypeOf<LoaderArgs>();
    expectTypeOf(guard).returns.toEqualTypeOf<Promise<Response | void>>();
  });

  it('fits MiddlewareFunction when the args are React Router middleware args', () => {
    type MiddlewareArgs = Parameters<MiddlewareFunction<Response>>[0];
    const guard = di.injectMiddleware(
      { log: FLIGHT_LOG },
      async (_deps, _args: MiddlewareArgs, next) => next(),
    );
    expectTypeOf(guard).toExtend<MiddlewareFunction<Response>>();
  });

  it('refuses a middleware that returns something other than a Response', () => {
    const cleared = async (_deps: unknown, _args: LoaderArgs) => 'cleared';
    // @ts-expect-error a middleware returns a Response or nothing
    di.injectMiddleware({ log: FLIGHT_LOG }, cleared);
  });

  it('gives a section the same middleware form', () => {
    const guard = di
      .load(defineModule({ name: 'Sickbay' }))
      .injectMiddleware(
        { log: FLIGHT_LOG },
        async (deps, _args: LoaderArgs) => {
          expectTypeOf(deps.log).toEqualTypeOf<IFlightLog>();
        },
      );
    expectTypeOf(guard).returns.toEqualTypeOf<Promise<Response | void>>();
  });
});
