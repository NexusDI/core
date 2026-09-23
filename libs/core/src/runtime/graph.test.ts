import { describe, expect, it } from 'vitest';

import { defineModule } from '../definitions/define-module.js';
import { lazy } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from './nexus.js';

class ReactorCore {}
class ShipComputer {
  constructor(readonly reactor: ReactorCore) {}
}
class SubspaceLink {}
const NAV_CHARTS = new Token<{ plot(): string }>('NavCharts');
const COMPUTER = new Token<ShipComputer>('Computer');

describe('Nexus', () => {
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
      const graph = (await Nexus.create(Meridian)).graph();

      expect(JSON.parse(JSON.stringify(graph))).toEqual(graph);
      expect(graph).toEqual({
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
            async: false,
          },
          {
            id: 'p1',
            token: 'ShipComputer',
            module: 'm0',
            lifetime: 'singleton',
            kind: 'class',
            async: false,
          },
          {
            id: 'p2',
            token: 'NavCharts',
            module: 'm0',
            lifetime: 'singleton',
            kind: 'factory',
            async: true,
          },
          {
            id: 'p3',
            token: 'Computer',
            module: 'm0',
            lifetime: null,
            kind: 'alias',
            async: null,
          },
          {
            id: 'p4',
            token: 'SubspaceLink',
            module: 'm1',
            lifetime: 'singleton',
            kind: 'class',
            async: false,
          },
          {
            id: 'request',
            token: 'REQUEST',
            module: 'm0',
            lifetime: 'scoped',
            kind: 'value',
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
      );
      expect(ship.graph().providers[0]?.async).toBeNull();
      await using _shuttle = await ship.createScope();
      expect(ship.graph().providers[0]?.async).toBe(true);
    });

    it('includes modules added by load', async () => {
      const ship = await Nexus.create(defineModule({ name: 'Root' }));
      await ship.load(
        defineModule({
          name: 'Science',
          providers: [SubspaceLink],
          exports: [SubspaceLink],
        }),
      );
      expect(ship.graph().modules.map((m) => m.name)).toEqual([
        'Root',
        'Science',
      ]);
    });

    it('still works after disposal', async () => {
      const ship = await Nexus.create(
        defineModule({ name: 'Root', providers: [ReactorCore] }),
      );
      await ship[Symbol.asyncDispose]();
      expect(ship.graph().providers.map((p) => p.token)).toEqual([
        'ReactorCore',
        'REQUEST',
      ]);
    });
  });
});
