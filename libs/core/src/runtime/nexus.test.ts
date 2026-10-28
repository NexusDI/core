import { describe, expect, it, vi } from 'vitest';

import { deferred, flush } from '../../test-support/deferred.js';
import { rejected, thrown } from '../../test-support/catch.js';
import { recordEvents } from '../../test-support/observe.js';
import { defineModule } from '../definitions/define-module.js';
import { all } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { MultiToken, Token } from '../definitions/token.js';
import { Nexus } from './nexus.js';

class ReactorCore {
  static built = 0;
  output = 1.21;
  constructor() {
    ReactorCore.built++;
  }
}
class ShipComputer {
  constructor(readonly reactor: ReactorCore) {}
}
class SurveyDrone {}
class SubspaceLink {}
interface NavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<NavCharts>('NavCharts');
const COMPUTER = new Token<ShipComputer>('Computer');
const charts: NavCharts = { plot: (to) => `course to ${to}` };

describe('Nexus', () => {
  describe('create', () => {
    it('builds every singleton before it returns', async () => {
      ReactorCore.built = 0;
      const Engineering = defineModule({
        name: 'Engineering',
        providers: [ReactorCore],
      });
      const ship = await Nexus.create(Engineering);
      expect(ReactorCore.built).toBe(1);
      ship.get(ReactorCore);
      expect(ReactorCore.built).toBe(1);
    });

    it('rejects with a BlueprintError and builds nothing when compilation fails', async () => {
      ReactorCore.built = 0;
      const Broken = defineModule({
        name: 'Broken',
        providers: [
          ReactorCore,
          provide(ShipComputer, { deps: [SubspaceLink] as never }),
        ],
      });
      expect(await rejected(Nexus.create(Broken))).toMatchObject({
        code: 'NEXUS_BLUEPRINT_INVALID',
      });
      expect(ReactorCore.built).toBe(0);
    });

    it('builds a level only after the level below has settled', async () => {
      const gate = deferred<ReactorCore>();
      const order: string[] = [];
      const Engineering = defineModule({
        name: 'Engineering',
        providers: [
          provide(ReactorCore, { useFactory: () => gate.promise, deps: [] }),
          provide(ShipComputer, {
            useFactory: (reactor) => {
              order.push('computer');
              return new ShipComputer(reactor);
            },
            deps: [ReactorCore],
          }),
        ],
      });
      const creating = Nexus.create(Engineering);
      await flush();
      expect(order).toEqual([]);
      gate.resolve(new ReactorCore());
      const ship = await creating;
      expect(order).toEqual(['computer']);
      expect(ship.get(ShipComputer).reactor).toBe(ship.get(ReactorCore));
    });

    it('starts the providers of one level together', async () => {
      const a = deferred<string>();
      const b = deferred<string>();
      const started: string[] = [];
      const A = new Token<string>('A');
      const B = new Token<string>('B');
      const Root = defineModule({
        name: 'Root',
        providers: [
          provide(A, {
            useFactory: () => (started.push('a'), a.promise),
            deps: [],
          }),
          provide(B, {
            useFactory: () => (started.push('b'), b.promise),
            deps: [],
          }),
        ],
      });
      const creating = Nexus.create(Root);
      await flush();
      expect(started).toEqual(['a', 'b']);
      a.resolve('a');
      b.resolve('b');
      await creating;
    });

    it('awaits a thenable that is not a Promise', async () => {
      const thenable = {
        then: (resolve: (v: NavCharts) => void) => resolve(charts),
      };
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            provide(NAV_CHARTS, {
              useFactory: () => thenable as never,
              deps: [],
            }),
          ],
        }),
      );
      expect(ship.get(NAV_CHARTS)).toBe(charts);
    });

    it('stores a thenable useValue untouched and never calls its then', async () => {
      const then = vi.fn();
      const client = { then } as unknown as NavCharts;
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [provide(NAV_CHARTS, { useValue: client })],
        }),
      );
      expect(ship.get(NAV_CHARTS)).toBe(client);
      expect(then).not.toHaveBeenCalled();
    });

    it('emits a construct event per provider when given a trace callback', async () => {
      const { events, plugin: recorder } = recordEvents();
      await Nexus.create(
        defineModule({
          name: 'Engineering',
          providers: [
            ReactorCore,
            provide(NAV_CHARTS, { useFactory: async () => charts, deps: [] }),
            provide(COMPUTER, {
              useValue: new ShipComputer(new ReactorCore()),
            }),
          ],
        }),
        { plugins: [recorder] },
      );
      expect(events.filter((e) => e.type === 'construct')).toMatchObject([
        {
          token: 'Computer',
          providerId: 'p2',
          module: 'Engineering',
          lifetime: null,
          scope: null,
          async: false,
          durationMs: 0,
        },
        {
          token: 'ReactorCore',
          providerId: 'p0',
          lifetime: 'singleton',
          async: false,
        },
        {
          token: 'NavCharts',
          providerId: 'p1',
          lifetime: 'singleton',
          async: true,
        },
      ]);
    });

    it('stores a class singleton whose instance has a then method, and never calls it', async () => {
      const then = vi.fn();
      class QueryBuilder {
        then = then;
      }
      const ship = await Nexus.create(
        defineModule({ name: 'Root', providers: [QueryBuilder] }),
      );
      const instance = ship.get(QueryBuilder);
      expect(instance).toBeInstanceOf(QueryBuilder);
      expect(instance.then).toBe(then);
      expect(then).not.toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('returns one instance of a singleton, a new transient each call, a value as given and an alias target', async () => {
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            ReactorCore,
            provide(ShipComputer, { deps: [ReactorCore] }),
            provide(SurveyDrone, { lifetime: 'transient' }),
            provide(NAV_CHARTS, { useValue: charts }),
            provide(COMPUTER, { useExisting: ShipComputer }),
          ],
        }),
      );
      expect(ship.get(ShipComputer)).toBe(ship.get(ShipComputer));
      expect(ship.get(SurveyDrone)).not.toBe(ship.get(SurveyDrone));
      expect(ship.get(NAV_CHARTS)).toBe(charts);
      expect(ship.get(COMPUTER)).toBe(ship.get(ShipComputer));
    });

    it('returns a new array of every visible contribution for a MultiToken, each by its own lifetime', async () => {
      const DIAGNOSTICS = new MultiToken<object>('Diagnostics');
      const fixed = { name: 'hull' };
      const ship = await Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            provide(DIAGNOSTICS, { useValue: fixed }),
            provide(DIAGNOSTICS, {
              useClass: SurveyDrone,
              lifetime: 'transient',
            }),
            provide(NAV_CHARTS, {
              useFactory: (checks) => ({ plot: () => String(checks.length) }),
              deps: [all(DIAGNOSTICS)],
            }),
          ],
        }),
      );
      const first = ship.get(DIAGNOSTICS);
      const second = ship.get(DIAGNOSTICS);
      expect(first).not.toBe(second);
      expect(first[0]).toBe(fixed);
      expect(first[1]).not.toBe(second[1]);
      expect(ship.get(NAV_CHARTS).plot('x')).toBe('2');
    });

    describe('a MultiToken collector', () => {
      interface IRegistry {
        names(): readonly string[];
      }
      const PANELS = new MultiToken<string>('Panels');
      const collector = (token: Token<IRegistry>) =>
        provide(token, {
          useFactory: (panels) => ({ names: () => panels }),
          deps: [all(PANELS)],
        });

      it('sees a contribution of a module downstream of its library', async () => {
        const REGISTRY = new Token<IRegistry>('Registry');
        const Library = defineModule({
          name: 'Library',
          providers: [collector(REGISTRY)],
          exports: [REGISTRY],
        });
        const Feature = defineModule({
          name: 'Feature',
          imports: [Library],
          providers: [provide(PANELS, { useValue: 'feature' })],
          exports: [PANELS],
        });
        const ship = await Nexus.create(
          defineModule({ name: 'Root', imports: [Library, Feature] }),
        );
        expect(ship.get(REGISTRY).names()).toEqual(['feature']);
      });

      it('sees the exported contribution of a plugin module', async () => {
        const REGISTRY = new Token<IRegistry>('Registry');
        const Library = defineModule({
          name: 'Library',
          providers: [collector(REGISTRY)],
          exports: [REGISTRY],
        });
        const Extra = defineModule({
          name: 'Extra',
          providers: [provide(PANELS, { useValue: 'plugin' })],
          exports: [PANELS],
        });
        const ship = await Nexus.create(
          defineModule({ name: 'Root', imports: [Library] }),
          { plugins: [{ name: 'extra', apiVersion: 1, modules: [Extra] }] },
        );
        expect(ship.get(REGISTRY).names()).toEqual(['plugin']);
      });

      it('sees the same list as a collector of the token in another module', async () => {
        const LEFT = new Token<IRegistry>('Left');
        const RIGHT = new Token<IRegistry>('Right');
        const Port = defineModule({
          name: 'Port',
          providers: [collector(LEFT)],
          exports: [LEFT],
        });
        const Starboard = defineModule({
          name: 'Starboard',
          providers: [collector(RIGHT)],
          exports: [RIGHT],
        });
        const Hull = defineModule({
          name: 'Hull',
          providers: [
            provide(PANELS, { useValue: 'hull' }),
            provide(PANELS, { useValue: 'deck' }),
          ],
          exports: [PANELS],
        });
        const ship = await Nexus.create(
          defineModule({
            name: 'Root',
            imports: [Port, Hull, Starboard],
            providers: [provide(PANELS, { useValue: 'root' })],
            exports: [PANELS],
          }),
        );
        expect(ship.get(LEFT).names()).toEqual(['root', 'hull', 'deck']);
        expect(ship.get(RIGHT).names()).toEqual(ship.get(LEFT).names());
      });
    });

    it('returns an empty array for a MultiToken nothing contributes to', async () => {
      const EMPTY = new MultiToken<string>('Empty');
      const ship = await Nexus.create(defineModule({ name: 'Root' }));
      expect(ship.get(EMPTY)).toEqual([]);
    });

    it('resolves as if inside a module with the module option', async () => {
      const Engineering = defineModule({
        name: 'Engineering',
        providers: [ReactorCore],
      });
      const ship = await Nexus.create(
        defineModule({ name: 'Meridian', imports: [Engineering] }),
      );
      expect(ship.get(ReactorCore, { module: Engineering })).toBeInstanceOf(
        ReactorCore,
      );
    });

    it('throws NEXUS_NOT_VISIBLE for a token private to another module', async () => {
      const Comms = defineModule({ name: 'Comms', providers: [SubspaceLink] });
      const ship = await Nexus.create(
        defineModule({ name: 'Meridian', imports: [Comms] }),
      );
      expect(thrown(() => ship.get(SubspaceLink))).toMatchObject({
        code: 'NEXUS_NOT_VISIBLE',
        token: 'SubspaceLink',
        owners: ['Comms'],
      });
    });

    it('throws NEXUS_MISSING_PROVIDER for a token no module provides', async () => {
      const ship = await Nexus.create(defineModule({ name: 'Meridian' }));
      expect(thrown(() => ship.get(SubspaceLink))).toMatchObject({
        code: 'NEXUS_MISSING_PROVIDER',
        token: 'SubspaceLink',
        requester: null,
        module: 'Meridian',
        nearMisses: [],
        lookup: { token: SubspaceLink, moduleId: expect.any(String) },
      });
    });

    it('throws NEXUS_INVALID_TOKEN for a value that is not a token', async () => {
      const ship = await Nexus.create(defineModule({ name: 'Meridian' }));
      expect(thrown(() => ship.get(Symbol('nav') as never))).toMatchObject({
        code: 'NEXUS_INVALID_TOKEN',
        received: 'the symbol Symbol(nav)',
      });
    });

    it('throws NEXUS_INVALID_MODULE for a module option outside the graph', async () => {
      const ship = await Nexus.create(defineModule({ name: 'Meridian' }));
      expect(
        thrown(() =>
          ship.get(ReactorCore, {
            module: defineModule({ name: 'Elsewhere' }),
          }),
        ),
      ).toMatchObject({
        code: 'NEXUS_INVALID_MODULE',
        received: 'Elsewhere',
        path: [],
      });
    });
  });

  describe('has', () => {
    it('reports visibility with the same rules as get and constructs nothing', async () => {
      const Comms = defineModule({
        name: 'Comms',
        providers: [SubspaceLink],
        exports: [],
      });
      const Engineering = defineModule({
        name: 'Engineering',
        providers: [ReactorCore],
        exports: [ReactorCore],
      });
      const ship = await Nexus.create(
        defineModule({ name: 'Meridian', imports: [Comms, Engineering] }),
      );
      expect(ship.has(ReactorCore)).toBe(true);
      expect(ship.has(SubspaceLink)).toBe(false);
      expect(ship.has(SubspaceLink, { module: Comms })).toBe(true);
      expect(ship.has(new MultiToken<string>('Nothing'))).toBe(false);
      expect(ship.has('ReactorCore' as never)).toBe(false);
    });
  });
});
