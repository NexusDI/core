import Fastify, {
  type FastifyReply,
  type FastifyRequest,
  type onRequestAsyncHookHandler,
  type preHandlerAsyncHookHandler,
  type preValidationAsyncHookHandler,
} from 'fastify';
import { expectTypeOf, test } from 'vitest';

import { defineModule, Nexus, Token } from '@nexusdi/core';

import { nexus, type RequestScope } from './index.js';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
declare const ship: Nexus;

test('inject takes the route generic from the route', () => {
  const di = nexus(ship);
  Fastify().get<{ Params: { to: string } }>(
    '/course/:to',
    di.inject({ charts: NAV_CHARTS }, ({ charts }, req) => {
      expectTypeOf(req.params.to).toEqualTypeOf<string>();
      return charts.plot(req.params.to);
    }),
  );
});

test('req.nexus is a RequestScope or null', () => {
  expectTypeOf<FastifyRequest['nexus']>().toEqualTypeOf<RequestScope | null>();
});

test("reply.send is checked against the route's Reply type", () => {
  const di = nexus(ship);
  Fastify().get<{ Reply: { to: string; heading: number } }>(
    '/course',
    di.inject({ charts: NAV_CHARTS }, ({ charts }, _req, reply) => {
      // @ts-expect-error heading must be a number
      void reply.send({ to: 'Kepler-442b', heading: 'north' });
      return reply.send(charts.plot('Kepler-442b'));
    }),
  );
});

test('the handle is AsyncDisposable', () => {
  expectTypeOf(nexus(ship)).toExtend<AsyncDisposable>();
});

interface IAccessControl {
  mayFire(operator: string | undefined): boolean;
}
const ACCESS = new Token<IAccessControl>('AccessControl');

test('injectHook infers deps, req and reply for an unannotated hook', () => {
  const di = nexus(ship);
  const hook = di.injectHook({ access: ACCESS }, async (deps, req, reply) => {
    expectTypeOf(deps.access).toEqualTypeOf<IAccessControl>();
    expectTypeOf(req).toEqualTypeOf<FastifyRequest>();
    expectTypeOf(reply).toEqualTypeOf<FastifyReply>();
    if (!deps.access.mayFire(req.headers['x-operator'] as string))
      return reply.code(403).send();
  });
  expectTypeOf(hook).toExtend<onRequestAsyncHookHandler>();
  expectTypeOf(hook).toExtend<preHandlerAsyncHookHandler>();
  expectTypeOf(hook).toExtend<preValidationAsyncHookHandler>();
});

test('injectHook fits addHook and the route-option hook slots', () => {
  const di = nexus(ship);
  const hook = di.injectHook({ access: ACCESS }, async () => {});
  const app = Fastify();
  app.addHook('onRequest', hook);
  app.addHook('preValidation', hook);
  app.addHook('preHandler', hook);
  void app.register(async (scoped) => {
    scoped.addHook('preHandler', hook);
  });
  app.get('/a', { onRequest: hook, preHandler: hook }, () => 'ok');
  app.get(
    '/b',
    { preValidation: [hook], preHandler: [hook, hook] },
    () => 'ok',
  );
});

test('injectHook takes the route generic from the route', () => {
  const di = nexus(ship);
  Fastify().post<{ Body: { operator: string } }>(
    '/drive/fire',
    {
      preHandler: di.injectHook(
        { access: ACCESS },
        async ({ access }, req, reply) => {
          expectTypeOf(req.body.operator).toEqualTypeOf<string>();
          if (!access.mayFire(req.body.operator)) return reply.code(403).send();
        },
      ),
    },
    () => 'fired',
  );
});

test('injectHook refuses a hook that returns a payload, which Fastify ignores', () => {
  const di = nexus(ship);
  // @ts-expect-error a hook sends with reply.send() and returns the reply or nothing
  di.injectHook({ access: ACCESS }, async () => ({ ok: true }));
  // @ts-expect-error a hook sends with reply.send() and returns the reply or nothing
  di.injectHook({ access: ACCESS }, () => 'nope');
});

test('a section gives the same hook form', () => {
  const di = nexus(ship);
  const hook = di
    .load(defineModule({ name: 'Sickbay' }))
    .injectHook({ access: ACCESS }, async (deps) => {
      expectTypeOf(deps.access).toEqualTypeOf<IAccessControl>();
    });
  expectTypeOf(hook).toExtend<preHandlerAsyncHookHandler>();
});
