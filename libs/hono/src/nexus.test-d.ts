import {
  defineModule,
  Nexus,
  optional,
  lazy,
  Token,
  type Scope,
} from '@nexusdi/core';
import {
  Hono,
  type Context,
  type Handler,
  type MiddlewareHandler,
  type Next,
} from 'hono';
import { describe, expectTypeOf, it } from 'vitest';

import { nexus, type NexusEnv, type RequestScope } from './index.js';

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

  it('types the handle as AsyncDisposable', () => {
    expectTypeOf(di).toExtend<AsyncDisposable>();
  });
});

describe('@nexusdi/hono injectMiddleware types', () => {
  type OperatorEnv = NexusEnv & { Variables: { operator: string } };

  it('infers deps, c and next for an unannotated middleware', () => {
    const guard = di.injectMiddleware(
      { log: FLIGHT_LOG },
      async (deps, c, next) => {
        expectTypeOf(deps.log).toEqualTypeOf<IFlightLog>();
        expectTypeOf(c).toEqualTypeOf<Context<NexusEnv, string>>();
        expectTypeOf(next).toEqualTypeOf<Next>();
        await next();
      },
    );
    expectTypeOf(guard).toEqualTypeOf<MiddlewareHandler<NexusEnv, string>>();
    new Hono()
      .use(di.middleware)
      .use(guard)
      .use('/drive/*', guard)
      .get('/drive/fire', guard, (c) => c.text('fired'));
  });

  it('refuses a middleware that returns something other than a Response', () => {
    // @ts-expect-error a middleware returns a Response or nothing
    di.injectMiddleware({ log: FLIGHT_LOG }, async (_deps, _c, next) => {
      await next();
      return 'cleared';
    });
  });

  it('still refuses an inject handler that returns nothing', () => {
    // @ts-expect-error a route handler returns a Response
    di.inject({ log: FLIGHT_LOG }, async (_deps, c) => {
      c.text('forgot the return');
    });
  });

  it('takes the Env from the annotation of c, so the middleware can set a variable', () => {
    const guard = di.injectMiddleware(
      { log: FLIGHT_LOG },
      async (_deps, c: Context<OperatorEnv>, next) => {
        c.set('operator', 'helm');
        await next();
      },
    );
    expectTypeOf(guard).toEqualTypeOf<MiddlewareHandler<OperatorEnv, string>>();
    new Hono<OperatorEnv>()
      .use(di.middleware)
      .use(guard)
      .get('/whoami', (c) => {
        expectTypeOf(c.var.operator).toEqualTypeOf<string>();
        return c.text(c.var.operator);
      });
  });

  it('takes the path of a middleware from the annotation of c', () => {
    const guard = di.injectMiddleware(
      { log: FLIGHT_LOG },
      async (_deps, c: Context<OperatorEnv, '/crew/:id'>, next) => {
        expectTypeOf(c.req.param('id')).toEqualTypeOf<string>();
        await next();
      },
    );
    expectTypeOf(guard).toEqualTypeOf<
      MiddlewareHandler<OperatorEnv, '/crew/:id'>
    >();
  });

  it('refuses c.set for a variable the Env does not declare', () => {
    di.injectMiddleware({ log: FLIGHT_LOG }, async (_deps, c, next) => {
      // @ts-expect-error NexusEnv has no operator variable
      c.set('operator', 'helm');
      await next();
    });
  });

  it('refuses an Env annotation without the nexus variable', () => {
    di.injectMiddleware(
      { log: FLIGHT_LOG },
      // @ts-expect-error the Env must extend NexusEnv
      async (_deps, _c: Context<{ Variables: { operator: string } }>, next) => {
        await next();
      },
    );
  });

  it('takes the Env and the path of an inject handler from the annotation of c', () => {
    const handler = di.inject(
      { log: FLIGHT_LOG },
      (_deps, c: Context<OperatorEnv, '/crew/:id'>) => {
        expectTypeOf(c.req.param('id')).toEqualTypeOf<string>();
        return c.text(c.var.operator);
      },
    );
    expectTypeOf(handler).toEqualTypeOf<Handler<OperatorEnv, '/crew/:id'>>();
  });

  it('gives a section the same middleware form', () => {
    const section = di.load(defineModule({ name: 'Sickbay' }));
    const guard = section.injectMiddleware(
      { log: FLIGHT_LOG },
      async (deps, _c, next) => {
        expectTypeOf(deps.log).toEqualTypeOf<IFlightLog>();
        await next();
      },
    );
    expectTypeOf(guard).toEqualTypeOf<MiddlewareHandler<NexusEnv, string>>();
  });
});
