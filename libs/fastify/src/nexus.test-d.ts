import Fastify, { type FastifyRequest } from 'fastify';
import { expectTypeOf, test } from 'vitest';

import { Nexus, Token } from '@nexusdi/core';

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
