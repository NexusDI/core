import { Nexus, Token, optional } from '@nexusdi/core';
import { RouterContextProvider, type MiddlewareFunction } from 'react-router';
import { describe, expectTypeOf, it } from 'vitest';

import { nexus } from './index.js';

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
});
