import { Nexus, optional, lazy, Token, type Scope } from '@nexusdi/core';
import { Hono } from 'hono';
import { describe, expectTypeOf, it } from 'vitest';

import { nexus, type RequestScope } from './index.js';

interface IFlightLog {
  entries(): readonly string[];
}
const FLIGHT_LOG = new Token<IFlightLog>('FlightLog');
const RELAY = new Token<string>('Relay');

declare const ship: Nexus;
const di = nexus(ship, {
  request: () => ({ mission: { id: 'survey-7', target: 'Kepler-442b' } }),
});

describe('@nexusdi/hono types', () => {
  it('types the inject record from core deps', () => {
    di.inject(
      { log: FLIGHT_LOG, relay: optional(RELAY), later: lazy(FLIGHT_LOG) },
      (deps, c) => {
        expectTypeOf(deps.log).toEqualTypeOf<IFlightLog>();
        expectTypeOf(deps.relay).toEqualTypeOf<string | undefined>();
        expectTypeOf(deps.later).toEqualTypeOf<() => IFlightLog>();
        return c.text('ok');
      },
    );
  });

  it('types c.var.nexus after chaining the middleware', () => {
    new Hono().use(di.middleware).get('/', (c) => {
      expectTypeOf(c.var.nexus).toEqualTypeOf<RequestScope>();
      return c.text('ok');
    });
  });

  it('returns the request scope from di.scope', () => {
    new Hono().get('/', async (c) => {
      expectTypeOf(await di.scope(c)).toEqualTypeOf<Scope>();
      return c.text('ok');
    });
  });

  it('requires the request mapping when NexusRequest has a required field', () => {
    // @ts-expect-error: the test-support augmentation makes `mission` required
    nexus(ship, {});
  });
});
