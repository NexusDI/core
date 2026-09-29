import { describe, expect, it } from 'vitest';

import { Nexus, Token, defineModule, lazy, provide } from '@nexusdi/core';

import { rejected } from '../test-support/catch.js';
import { devtools, graph } from './index.js';

class ReactorCore {}
class ShipComputer {
  constructor(readonly reactor: ReactorCore) {}
}
class SubspaceLink {}
const NAV_CHARTS = new Token<{ plot(): string }>('NavCharts');
const COMPUTER = new Token<ShipComputer>('Computer');

describe('graph', () => {
  it('returns the compiled graph as plain JSON', async () => {
    const Comms = defineModule({
      name: 'Comms',
      providers: [SubspaceLink],
      exports: [SubspaceLink],
    });
    const Meridian = defineModule({
      name: 'Meridian',
      imports: [Comms],
      providers: [
        ReactorCore,
        provide(ShipComputer, { deps: [ReactorCore] }),
        provide(NAV_CHARTS, {
          useFactory: async () => ({ plot: () => 'x' }),
          deps: [lazy(SubspaceLink)],
        }),
        provide(COMPUTER, { useExisting: ShipComputer }),
      ],
    });
    const view = graph(await Nexus.create(Meridian, { plugins: [devtools()] }));

    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    expect(view).toEqual({
      modules: [
        {
          id: 'm0',
          name: 'Meridian',
          global: false,
          imports: ['m1'],
          exports: [],
        },
        {
          id: 'm1',
          name: 'Comms',
          global: false,
          imports: [],
          exports: ['p4'],
        },
      ],
      providers: [
        {
          id: 'p0',
          token: 'ReactorCore',
          module: 'm0',
          lifetime: 'singleton',
          kind: 'class',
          eager: true,
          async: false,
        },
        {
          id: 'p1',
          token: 'ShipComputer',
          module: 'm0',
          lifetime: 'singleton',
          kind: 'class',
          eager: true,
          async: false,
        },
        {
          id: 'p2',
          token: 'NavCharts',
          module: 'm0',
          lifetime: 'singleton',
          kind: 'factory',
          eager: true,
          async: true,
        },
        {
          id: 'p3',
          token: 'Computer',
          module: 'm0',
          lifetime: null,
          kind: 'alias',
          eager: true,
          async: null,
        },
        {
          id: 'p4',
          token: 'SubspaceLink',
          module: 'm1',
          lifetime: 'singleton',
          kind: 'class',
          eager: true,
          async: false,
        },
        {
          id: 'request',
          token: 'REQUEST',
          module: 'm0',
          lifetime: 'scoped',
          kind: 'value',
          eager: true,
          async: false,
        },
      ],
      edges: [
        { from: 'p1', to: 'p0', kind: 'required' },
        { from: 'p2', to: 'p4', kind: 'lazy' },
        { from: 'p3', to: 'p1', kind: 'alias' },
      ],
    });
  });

  it('reports async as null for a factory that has not run, then whether its last build returned a thenable', async () => {
    const MISSION = new Token<string>('Mission');
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(MISSION, {
            useFactory: async () => 'survey',
            deps: [],
            lifetime: 'scoped',
          }),
        ],
      }),
      { plugins: [devtools()] },
    );
    expect(graph(ship).providers[0]?.async).toBeNull();
    await using _shuttle = await ship.createScope();
    expect(graph(ship).providers[0]?.async).toBe(true);
  });

  it('includes modules added by load', async () => {
    const ship = await Nexus.create(defineModule({ name: 'Root' }), {
      plugins: [devtools()],
    });
    await ship.load(
      defineModule({
        name: 'Science',
        providers: [SubspaceLink],
        exports: [SubspaceLink],
      }),
    );
    expect(graph(ship).modules.map((m) => m.name)).toEqual(['Root', 'Science']);
  });

  it('still works after disposal', async () => {
    const ship = await Nexus.create(
      defineModule({ name: 'Root', providers: [ReactorCore] }),
      { plugins: [devtools()] },
    );
    await ship[Symbol.asyncDispose]();
    expect(graph(ship).providers.map((p) => p.token)).toEqual([
      'ReactorCore',
      'REQUEST',
    ]);
  });

  it('reports null for a scoped factory that reused a failed load provider id, not the stale flag it left behind', async () => {
    class Boom {
      constructor() {
        throw new Error('boom');
      }
    }
    const SURVEY = new Token<string>('Survey');
    const ship = await Nexus.create(defineModule({ name: 'Root' }), {
      plugins: [devtools()],
    });

    const Failing = defineModule({
      name: 'Failing',
      providers: [
        provide(SURVEY, { useFactory: async () => 'x', deps: [] }),
        Boom,
      ],
    });
    expect(await rejected(ship.load(Failing))).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
    });

    const ORDERS = new Token<string>('Orders');
    const Relief = defineModule({
      name: 'Relief',
      providers: [
        provide(ORDERS, {
          useFactory: () => 'y',
          deps: [],
          lifetime: 'scoped',
        }),
      ],
    });
    await ship.load(Relief);

    const orders = graph(ship).providers.find((p) => p.token === 'Orders');
    expect(orders?.async).toBeNull();
  });

  const SENSORS = new Token<{ name: string }>('Sensors');
  const asyncOf = (ship: Nexus) =>
    graph(ship).providers.find((p) => p.token === 'Sensors')?.async;
  const shipWith = (useFactory: () => unknown) =>
    Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(SENSORS, { useFactory, lifetime: 'transient' } as never),
        ],
        exports: [SENSORS],
      }),
      { plugins: [devtools()] },
    );

  it('reports false for a transient factory before and after a synchronous get()', async () => {
    const ship = await shipWith(() => ({ name: 'Sensors' }));
    expect(asyncOf(ship)).toBe(false);
    ship.get(SENSORS);
    expect(asyncOf(ship)).toBe(false);
  });

  it('reports true after a transient factory returned a thenable', async () => {
    const ship = await shipWith(() => Promise.resolve({ name: 'Sensors' }));
    expect(() => ship.get(SENSORS)).toThrow(
      expect.objectContaining({ code: 'NEXUS_ASYNC_TRANSIENT' }),
    );
    expect(asyncOf(ship)).toBe(true);
  });
});
