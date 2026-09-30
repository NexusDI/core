import { describe, expect, it } from 'vitest';

import { Nexus, Token, defineModule, lazy, provide } from '@nexusdi/core';

import { rejected, thrown } from '../test-support/catch.js';
import { fuelLineNotes } from '../test-support/third-party-annotator.js';
import { devtools, graph, inspect, type GraphAnnotator } from './index.js';

class ReactorCore {}
class ShipComputer {
  constructor(readonly reactor: ReactorCore) {}
}
class SubspaceLink {}
const NAV_CHARTS = new Token<{ plot(): string }>('NavCharts');
const COMPUTER = new Token<ShipComputer>('Computer');

const Bridge = defineModule({
  name: 'Bridge',
  providers: [
    ReactorCore,
    provide(ShipComputer, { deps: [ReactorCore] }),
    provide(NAV_CHARTS, { useFactory: () => ({ plot: () => 'x' }) }),
  ],
});
/** Two notes for the reactor, in reverse id order, and one for an id the view lacks. */
const shielding: GraphAnnotator = (view) => [
  { provider: view.providers[1]?.id ?? '', label: 'shielded' },
  { provider: view.providers[0]?.id ?? '', label: 'shielded' },
  { provider: view.providers[0]?.id ?? '', label: 'hull breach sensor' },
  { provider: 'p404', label: 'lost in the nebula' },
];
/** A second annotator; its notes follow the first one's. */
const crew: GraphAnnotator = (view) => [
  { provider: view.providers[0]?.id ?? '', label: 'crewed by engineering' },
];
const notesOf = (providers: { token: string; notes: string[] }[]) =>
  Object.fromEntries(providers.map((p) => [p.token, p.notes]));
const BRIDGE_NOTES = {
  ReactorCore: ['shielded', 'hull breach sensor', 'crewed by engineering'],
  ShipComputer: ['shielded'],
  NavCharts: ['fed from the fuel line'],
  REQUEST: [],
};

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
          notes: [],
          implementation: 'ReactorCore',
          internal: false,
        },
        {
          id: 'p1',
          token: 'ShipComputer',
          module: 'm0',
          lifetime: 'singleton',
          kind: 'class',
          eager: true,
          async: false,
          notes: [],
          implementation: 'ShipComputer',
          internal: false,
        },
        {
          id: 'p2',
          token: 'NavCharts',
          module: 'm0',
          lifetime: 'singleton',
          kind: 'factory',
          eager: true,
          async: true,
          notes: [],
          implementation: null,
          internal: false,
        },
        {
          id: 'p3',
          token: 'Computer',
          module: 'm0',
          lifetime: null,
          kind: 'alias',
          eager: true,
          async: null,
          notes: [],
          implementation: null,
          internal: false,
        },
        {
          id: 'p4',
          token: 'SubspaceLink',
          module: 'm1',
          lifetime: 'singleton',
          kind: 'class',
          eager: true,
          async: false,
          notes: [],
          implementation: 'SubspaceLink',
          internal: false,
        },
        {
          id: 'request',
          token: 'REQUEST',
          module: 'm0',
          lifetime: 'scoped',
          kind: 'value',
          eager: true,
          async: false,
          notes: [],
          implementation: null,
          internal: true,
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

  it("lists each provider's notes in annotator order, then note order, and drops a note for an unknown id", async () => {
    const ship = await Nexus.create(Bridge, {
      plugins: [devtools({ annotate: [shielding, crew, fuelLineNotes] })],
    });
    expect(notesOf(graph(ship).providers)).toEqual(BRIDGE_NOTES);
  });

  it("throws the annotator's own error to graph()'s caller", async () => {
    const failure = new Error('annotator failed');
    const failing: GraphAnnotator = () => {
      throw failure;
    };
    const ship = await Nexus.create(Bridge, {
      plugins: [devtools({ annotate: [failing] })],
    });
    expect(thrown(() => graph(ship))).toBe(failure);
  });
});

describe('inspect', () => {
  it("lists each provider's notes from options.annotate", () => {
    const view = inspect(Bridge, {
      annotate: [shielding, crew, fuelLineNotes],
    });
    expect(notesOf(view.providers)).toEqual(BRIDGE_NOTES);
  });
});
