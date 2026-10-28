import { describe, expect, it, vi } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { deferred, flush } from '../../test-support/deferred.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { all, optional } from '../definitions/modifiers.js';
import { MultiToken, Token } from '../definitions/token.js';
import { Nexus } from './nexus.js';

class ReactorCore {}
class Probe {
  constructor(readonly reactor: ReactorCore) {}
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [ReactorCore],
  exports: [ReactorCore],
});
const Meridian = defineModule({ name: 'Meridian', imports: [Engineering] });

describe('Nexus', () => {
  describe('load', () => {
    it('adds a module after startup, builds its singletons and shows its exports at the root', async () => {
      const Science = defineModule({
        name: 'Science',
        imports: [Engineering],
        providers: [provide(Probe, { deps: [ReactorCore] })],
        exports: [Probe],
      });
      const ship = await Nexus.create(Meridian);
      expect(ship.has(Probe)).toBe(false);
      await ship.load(Science);
      expect(ship.get(Probe).reactor).toBe(ship.get(ReactorCore));
    });

    it('does nothing for a module the root already imports', async () => {
      const factory = vi.fn(() => 'x');
      const NAME = new Token<string>('Name');
      const Named = defineModule({
        name: 'Named',
        providers: [provide(NAME, { useFactory: factory, deps: [] })],
        exports: [NAME],
      });
      const ship = await Nexus.create(
        defineModule({ name: 'Root', imports: [Named] }),
      );
      await ship.load(Named);
      expect(factory).toHaveBeenCalledOnce();
    });

    it('adds the root import and builds nothing for a module in the graph the root cannot see', async () => {
      const factory = vi.fn(() => 'x');
      const NAME = new Token<string>('Name');
      const Hidden = defineModule({
        name: 'Hidden',
        providers: [provide(NAME, { useFactory: factory, deps: [] })],
        exports: [NAME],
      });
      const Wrapper = defineModule({ name: 'Wrapper', imports: [Hidden] });
      const ship = await Nexus.create(
        defineModule({ name: 'Root', imports: [Wrapper] }),
      );
      expect(ship.has(NAME)).toBe(false);
      await ship.load(Hidden);
      expect(ship.get(NAME)).toBe('x');
      expect(factory).toHaveBeenCalledOnce();
    });

    it('rejects NEXUS_LOAD_GLOBAL_MODULE for a global module', async () => {
      const Telemetry = defineModule({ name: 'Telemetry', global: true });
      const ship = await Nexus.create(Meridian);
      expect(await rejected(ship.load(Telemetry))).toMatchObject({
        code: 'NEXUS_LOAD_GLOBAL_MODULE',
        module: 'Telemetry',
      });
    });

    it('rejects NEXUS_LOAD_GLOBAL_MODULE for a module that imports a new global module', async () => {
      const Telemetry = defineModule({ name: 'Telemetry', global: true });
      const NAME = new Token<string>('Name');
      const Wrapper = defineModule({
        name: 'Wrapper',
        imports: [Telemetry],
        providers: [provide(NAME, { useValue: 'x' })],
        exports: [NAME],
      });
      const ship = await Nexus.create(Meridian);
      expect(await rejected(ship.load(Wrapper))).toMatchObject({
        code: 'NEXUS_LOAD_GLOBAL_MODULE',
        module: 'Telemetry',
      });
      expect(ship.has(NAME)).toBe(false);
    });

    it('loads a module that imports a global module already in the graph', async () => {
      const factory = vi.fn(() => 'x');
      const NAME = new Token<string>('Name');
      const Telemetry = defineModule({ name: 'Telemetry', global: true });
      const Root = defineModule({
        name: 'Root',
        imports: [Meridian, Telemetry],
      });
      const Wrapper = defineModule({
        name: 'Wrapper',
        imports: [Telemetry],
        providers: [provide(NAME, { useFactory: factory, deps: [] })],
        exports: [NAME],
      });
      const ship = await Nexus.create(Root);
      await ship.load(Wrapper);
      expect(ship.get(NAME)).toBe('x');
      expect(factory).toHaveBeenCalledOnce();
    });

    describe('contributions to a multi token', () => {
      const LOG = new MultiToken<string>('Log');
      const Listener = defineModule({
        name: 'Listener',
        providers: [provide(LOG, { useValue: 'own' })],
        exports: [LOG],
      });

      it('rejects NEXUS_LOAD_CONTRIBUTION for a module that exports a contribution and leaves the container as it was', async () => {
        const Root = defineModule({
          name: 'Root',
          providers: [provide(LOG, { useValue: 'root' })],
        });
        const ship = await Nexus.create(Root);
        const error = await rejected(ship.load(Listener));
        expect(error).toMatchObject({
          code: 'NEXUS_LOAD_CONTRIBUTION',
          module: 'Listener',
          token: 'Log',
        });
        expect(ship.get(LOG)).toEqual(['root']);
        await ship.load(Meridian);
        expect(ship.get(LOG)).toEqual(['root']);
      });

      it('loads a module whose contribution stays private to a reader in the same module', async () => {
        class Sink {
          constructor(readonly lines: string[]) {}
        }
        const Quiet = defineModule({
          name: 'Quiet',
          providers: [
            provide(LOG, { useValue: 'own' }),
            provide(Sink, { deps: [all(LOG)] }),
          ],
          exports: [Sink],
        });
        const ship = await Nexus.create(Meridian);
        await ship.load(Quiet);
        expect(ship.get(Sink).lines).toEqual(['own']);
        expect(ship.get(LOG)).toEqual([]);
      });

      it('rejects NEXUS_UNREAD_CONTRIBUTION inside a BlueprintError for a loaded module whose private contribution no provider reads', async () => {
        const Silent = defineModule({
          name: 'Silent',
          providers: [provide(LOG, { useValue: 'own' })],
        });
        const ship = await Nexus.create(Meridian);
        expect(await rejected(ship.load(Silent))).toMatchObject({
          code: 'NEXUS_BLUEPRINT_INVALID',
          errors: [
            {
              code: 'NEXUS_UNREAD_CONTRIBUTION',
              token: 'Log',
              module: 'Silent',
              provider: 'useValue #1',
            },
          ],
        });
        expect(ship.get(LOG)).toEqual([]);
      });

      it('lets the load through when a compile.provider hook removes the record', async () => {
        const ship = await Nexus.create(Meridian, {
          plugins: [
            {
              name: 'drop',
              apiVersion: 1,
              compile: {
                provider: (p: { token: unknown }) =>
                  p.token === LOG ? { remove: true } : undefined,
              },
            } as never,
          ],
        });
        await ship.load(Listener);
        expect(ship.get(LOG)).toEqual([]);
      });

      it('skips a token a compile.provider hook pinned', async () => {
        const ship = await Nexus.create(Meridian, {
          plugins: [
            {
              name: 'pin',
              apiVersion: 1,
              compile: {
                provider: (p: { token: unknown }) =>
                  p.token === LOG
                    ? { with: provide(LOG, { useValue: 'pin' }), pin: true }
                    : undefined,
              },
            } as never,
          ],
        });
        await ship.load(Listener);
        expect(ship.get(LOG)).toEqual(['pin']);
      });
    });

    it('rejects NEXUS_INVALID_MODULE for a value that is not a module', async () => {
      const ship = await Nexus.create(Meridian);
      expect(await rejected(ship.load({} as never))).toMatchObject({
        code: 'NEXUS_INVALID_MODULE',
        received: 'an object',
      });
    });

    it('rejects a BlueprintError and leaves the container unchanged when the root would see an ambiguous export', async () => {
      class OtherReactor {}
      const Rival = defineModule({
        name: 'Rival',
        providers: [
          provide(ReactorCore, { useClass: OtherReactor }),
          provide(Probe, { deps: [ReactorCore] }),
        ],
        exports: [ReactorCore, Probe],
      });
      const ship = await Nexus.create(Meridian);
      const before = ship.get(ReactorCore);
      expect(await rejected(ship.load(Rival))).toMatchObject({
        code: 'NEXUS_BLUEPRINT_INVALID',
        errors: [
          {
            code: 'NEXUS_AMBIGUOUS_PROVIDER',
            token: 'ReactorCore',
            module: 'Meridian',
          },
        ],
      });
      expect(ship.get(ReactorCore)).toBe(before);
      expect(ship.has(Probe)).toBe(false);
    });

    it('disposes what a failed load built and rethrows', async () => {
      const log: string[] = [];
      class Sensor {
        [Symbol.dispose]() {
          log.push('sensor disposed');
        }
      }
      class SensorArray {
        constructor(readonly sensor: Sensor) {
          throw new Error('array misaligned');
        }
      }
      const Science = defineModule({
        name: 'Science',
        providers: [Sensor, provide(SensorArray, { deps: [Sensor] })],
        exports: [Sensor],
      });
      const ship = await Nexus.create(Meridian);
      expect(await rejected(ship.load(Science))).toMatchObject({
        code: 'NEXUS_PROVIDER_FAILED',
        token: 'SensorArray',
      });
      expect(log).toEqual(['sensor disposed']);
      expect(ship.has(Sensor)).toBe(false);
    });

    it('runs a later load after an earlier one on the queue rejected', async () => {
      class Boom {
        constructor() {
          throw new Error('boom');
        }
      }
      const Failing = defineModule({ name: 'Failing', providers: [Boom] });
      const NAME = new Token<string>('Name');
      const Named = defineModule({
        name: 'Named',
        providers: [provide(NAME, { useValue: 'x' })],
        exports: [NAME],
      });
      const ship = await Nexus.create(Meridian);
      expect(await rejected(ship.load(Failing))).toMatchObject({
        code: 'NEXUS_PROVIDER_FAILED',
      });
      await ship.load(Named);
      expect(ship.get(NAME)).toBe('x');
    });

    it('runs concurrent loads one at a time, in call order', async () => {
      const order: string[] = [];
      const gate = deferred<string>();
      const A = new Token<string>('A');
      const B = new Token<string>('B');
      const First = defineModule({
        name: 'First',
        providers: [
          provide(A, {
            useFactory: () => (order.push('first starts'), gate.promise),
            deps: [],
          }),
        ],
      });
      const Second = defineModule({
        name: 'Second',
        providers: [
          provide(B, {
            useFactory: () => (order.push('second starts'), 'b'),
            deps: [],
          }),
        ],
      });
      const ship = await Nexus.create(Meridian);
      const first = ship.load(First);
      const second = ship.load(Second);
      await flush();
      expect(order).toEqual(['first starts']);
      gate.resolve('a');
      await Promise.all([first, second]);
      expect(order).toEqual(['first starts', 'second starts']);
    });

    it('rebuilds no existing singleton across sequential loads that recompile the whole graph (S6)', async () => {
      let reactorBuilds = 0;
      class CountedReactor {
        constructor() {
          reactorBuilds++;
        }
      }
      const Engineering2 = defineModule({
        name: 'Engineering2',
        providers: [CountedReactor],
        exports: [CountedReactor],
      });
      const Meridian2 = defineModule({
        name: 'Meridian2',
        imports: [Engineering2],
      });
      const ship = await Nexus.create(Meridian2);
      expect(reactorBuilds).toBe(1);
      const first = ship.get(CountedReactor);

      const Science = defineModule({
        name: 'Science',
        imports: [Engineering2],
      });
      await ship.load(Science);
      expect(reactorBuilds).toBe(1);
      expect(ship.get(CountedReactor)).toBe(first);

      const Lab = defineModule({ name: 'Lab', imports: [Engineering2] });
      await ship.load(Lab);
      expect(reactorBuilds).toBe(1);
      expect(ship.get(CountedReactor)).toBe(first);
    });
  });

  describe('load with a grant', () => {
    const REACTOR = new Token<{ output: number }>('Reactor');
    const COOLANT = new Token<string>('Coolant');
    const CHARTS = new Token<string>('Charts');
    const Reactors = defineModule({
      name: 'Reactors',
      providers: [
        provide(REACTOR, { useValue: { output: 7 } }),
        provide(COOLANT, { useValue: 'liquid helium' }),
      ],
      exports: [REACTOR],
    });
    const Navigation = defineModule({
      name: 'Navigation',
      providers: [provide(CHARTS, { useValue: 'sector 7' })],
      exports: [CHARTS],
    });
    // The root imports Wrapper only, so Reactors and Navigation are in the
    // graph and a loaded module cannot name them through the root.
    const Wrapper = defineModule({
      name: 'Wrapper',
      imports: [Reactors, Navigation],
    });
    const Host = defineModule({ name: 'Host', imports: [Wrapper] });

    class Probe {
      static deps = [REACTOR] as const;
      constructor(readonly reactor: { output: number }) {}
    }
    class Scanner {
      static deps = [REACTOR] as const;
      constructor(readonly reactor: { output: number }) {}
    }
    class Pump {
      static deps = [COOLANT] as const;
      constructor(readonly coolant: string) {}
    }

    it('resolves a granted export in the loaded module and in a new module of its subtree', async () => {
      const Sensors = defineModule({
        name: 'Sensors',
        providers: [Scanner],
        exports: [Scanner],
      });
      const Science = defineModule({
        name: 'Science',
        imports: [Sensors],
        providers: [Probe],
        exports: [Probe, Sensors],
      });
      const ship = await Nexus.create(Host);
      await ship.load(Science, { imports: [Reactors] });
      expect(ship.get(Probe).reactor.output).toBe(7);
      expect(ship.get(Scanner).reactor).toBe(ship.get(Probe).reactor);
    });

    it('does not give the loaded module a private provider of the granted module', async () => {
      const Science = defineModule({
        name: 'Science',
        providers: [Pump],
        exports: [Pump],
      });
      const ship = await Nexus.create(Host);
      expect(
        await rejected(ship.load(Science, { imports: [Reactors] })),
      ).toMatchObject({
        code: 'NEXUS_BLUEPRINT_INVALID',
        errors: [{ code: 'NEXUS_MISSING_PROVIDER', requester: 'Pump' }],
      });
    });

    it('gives a module the graph already held nothing from the grant', async () => {
      const GAUGE = new Token<{ reactor: unknown }>('Gauge');
      const Hold = defineModule({
        name: 'Hold',
        providers: [
          provide(GAUGE, {
            useFactory: (reactor: unknown) => ({ reactor }),
            deps: [optional(REACTOR)],
          }),
        ],
        exports: [GAUGE],
      });
      const ship = await Nexus.create(
        defineModule({ name: 'Root', imports: [Wrapper, Hold] }),
      );
      const Science = defineModule({
        name: 'Science',
        imports: [Hold],
        providers: [Probe],
        exports: [Probe],
      });
      await ship.load(Science, { imports: [Reactors] });
      expect(ship.get(Probe).reactor.output).toBe(7);
      expect(ship.get(GAUGE).reactor).toBeUndefined();
    });

    it('rejects NEXUS_LOAD_GRANT not-in-graph for a granted module the graph lacks', async () => {
      const Hangar = defineModule({ name: 'Hangar' });
      const ship = await Nexus.create(Host);
      expect(
        await rejected(
          ship.load(defineModule({ name: 'Science' }), { imports: [Hangar] }),
        ),
      ).toMatchObject({
        code: 'NEXUS_LOAD_GRANT',
        module: 'Science',
        grant: 'Hangar',
        reason: 'not-in-graph',
      });
    });

    it('rejects not-in-graph for a fresh forRoot() call, since it makes a new definition', async () => {
      const LEVEL = new Token<{ level: number }>('Level');
      const Configured = defineModule({ name: 'Configured', options: LEVEL });
      const held = Configured.forRoot({ level: 1 });
      const ship = await Nexus.create(
        defineModule({ name: 'Root', imports: [held] }),
      );
      const Science = defineModule({ name: 'Science' });
      await ship.load(Science, { imports: [held] });
      expect(
        await rejected(
          ship.load(defineModule({ name: 'Lab' }), {
            imports: [Configured.forRoot({ level: 1 })],
          }),
        ),
      ).toMatchObject({
        code: 'NEXUS_LOAD_GRANT',
        grant: 'Configured',
        reason: 'not-in-graph',
      });
    });

    it('rejects NEXUS_LOAD_GRANT root for a grant of the root module', async () => {
      const ship = await Nexus.create(Host);
      expect(
        await rejected(
          ship.load(defineModule({ name: 'Science' }), { imports: [Host] }),
        ),
      ).toMatchObject({
        code: 'NEXUS_LOAD_GRANT',
        module: 'Science',
        grant: 'Host',
        reason: 'root',
      });
    });

    it('accepts a global module as a grant and adds nothing', async () => {
      const Telemetry = defineModule({
        name: 'Telemetry',
        global: true,
        providers: [provide(CHARTS, { useValue: 'global' })],
        exports: [CHARTS],
      });
      class Reader {
        static deps = [CHARTS] as const;
        constructor(readonly charts: string) {}
      }
      const ship = await Nexus.create(
        defineModule({ name: 'Root', imports: [Telemetry] }),
      );
      const Science = defineModule({
        name: 'Science',
        providers: [Reader],
        exports: [Reader],
      });
      await ship.load(Science, { imports: [Telemetry] });
      expect(ship.get(Reader).charts).toBe('global');
    });

    describe('a repeat load of the same module', () => {
      class Gadget {
        static built = 0;
        static deps = [REACTOR, CHARTS] as const;
        constructor(
          readonly reactor: { output: number },
          readonly charts: string,
        ) {
          Gadget.built++;
        }
      }
      const Lab = defineModule({
        name: 'Lab',
        providers: [Gadget],
        exports: [Gadget],
      });

      it('does nothing for the same set in another order and builds once', async () => {
        Gadget.built = 0;
        const ship = await Nexus.create(Host);
        await ship.load(Lab, { imports: [Reactors, Navigation] });
        await ship.load(Lab, { imports: [Navigation, Reactors] });
        expect(Gadget.built).toBe(1);
      });

      it('does nothing without options', async () => {
        Gadget.built = 0;
        const ship = await Nexus.create(Host);
        await ship.load(Lab, { imports: [Reactors, Navigation] });
        await ship.load(Lab);
        expect(Gadget.built).toBe(1);
      });

      it('rejects already-loaded for another set', async () => {
        const ship = await Nexus.create(Host);
        await ship.load(Lab, { imports: [Reactors, Navigation] });
        expect(
          await rejected(ship.load(Lab, { imports: [Reactors] })),
        ).toMatchObject({
          code: 'NEXUS_LOAD_GRANT',
          module: 'Lab',
          reason: 'already-loaded',
        });
      });
    });

    it('rejects already-loaded for a grant on a module the root imports statically', async () => {
      const ship = await Nexus.create(Host);
      expect(
        await rejected(ship.load(Wrapper, { imports: [Reactors] })),
      ).toMatchObject({
        code: 'NEXUS_LOAD_GRANT',
        module: 'Wrapper',
        grant: 'Reactors',
        reason: 'already-loaded',
      });
    });

    it('leaves an earlier grant as it is when a later load imports the module', async () => {
      const Science = defineModule({
        name: 'Science',
        providers: [Probe],
        exports: [Probe],
      });
      const ship = await Nexus.create(Host);
      await ship.load(Science, { imports: [Reactors] });
      const Lab = defineModule({ name: 'Lab', imports: [Science] });
      await ship.load(Lab, { imports: [Navigation] });
      expect(ship.get(Probe).reactor.output).toBe(7);
      expect(
        await rejected(ship.load(Science, { imports: [Navigation] })),
      ).toMatchObject({ code: 'NEXUS_LOAD_GRANT', reason: 'already-loaded' });
    });

    it('still rejects a global loaded module and a published contribution', async () => {
      const LOG = new MultiToken<string>('Log');
      const Telemetry = defineModule({ name: 'Telemetry', global: true });
      const Listener = defineModule({
        name: 'Listener',
        providers: [provide(LOG, { useValue: 'x' })],
        exports: [LOG],
      });
      const ship = await Nexus.create(Host);
      expect(
        await rejected(ship.load(Telemetry, { imports: [Reactors] })),
      ).toMatchObject({ code: 'NEXUS_LOAD_GLOBAL_MODULE' });
      expect(
        await rejected(ship.load(Listener, { imports: [Reactors] })),
      ).toMatchObject({ code: 'NEXUS_LOAD_CONTRIBUTION' });
    });
  });
});
