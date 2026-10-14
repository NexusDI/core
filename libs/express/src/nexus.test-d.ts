import type { Request, RequestHandler } from 'express';
import { expectTypeOf, test } from 'vitest';

import { all, lazy, MultiToken, Nexus, optional, Token } from '@nexusdi/core';

import { nexus, type RequestScope } from './index.js';

interface INavCharts {
  plot(to: string): { to: string; heading: number };
}
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
const DIAGNOSTICS = new MultiToken<string>('Diagnostics');

declare const ship: Nexus;

test('inject types each entry of the record', () => {
  const di = nexus(ship);
  const handler = di.inject(
    {
      charts: NAV_CHARTS,
      maybe: optional(NAV_CHARTS),
      later: lazy(NAV_CHARTS),
      checks: all(DIAGNOSTICS),
    },
    (deps, req) => {
      expectTypeOf(deps.charts).toEqualTypeOf<INavCharts>();
      expectTypeOf(deps.maybe).toEqualTypeOf<INavCharts | undefined>();
      expectTypeOf(deps.later).toEqualTypeOf<() => INavCharts>();
      expectTypeOf(deps.checks).toEqualTypeOf<string[]>();
      expectTypeOf(req).toEqualTypeOf<Request>();
    },
  );
  expectTypeOf(handler).toEqualTypeOf<RequestHandler>();
});

test('req.nexus is an optional RequestScope', () => {
  expectTypeOf<Request['nexus']>().toEqualTypeOf<RequestScope | undefined>();
});

test('the request mapping must return a NexusRequest', () => {
  nexus(ship, {
    // @ts-expect-error mission must be { id, target }
    request: () => ({ mission: 7 }),
  });
});

test('nexus also takes a function that builds the container', () => {
  nexus(() => Nexus.create([]));
});
