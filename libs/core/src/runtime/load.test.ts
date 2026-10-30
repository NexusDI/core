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

      it('loads a module that exports a contribution to a token a hook pinned at create', async () => {
        const Pinned = defineModule({
          name: 'Pinned',
          providers: [provide(LOG, { useValue: 'root' })],
        });
        let seen: unknown;
        let done = false;
        const ship = await Nexus.create(Pinned, {
          plugins: [
            {
              name: 'pin',
              apiVersion: 1,
              compile: {
                provider: (p: { token: unknown }, context: unknown) => {
                  if (context !== seen) {
                    seen = context;
                    done = false;
                  }
                  if (p.token !== LOG || done) return undefined;
                  done = true;
                  return {
                    with: provide(LOG, { useValue: 'pin' }),
                    pin: true,
                  };
                },
              },
            } as never,
          ],
        });
        await ship.load(Listener);
        expect(ship.get(LOG)).toEqual(['pin']);
      });

      it('rejects NEXUS_LOAD_CONTRIBUTION for a token a hook first pins at a load', async () => {
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
        expect(await rejected(ship.load(Listener))).toMatchObject({
          code: 'NEXUS_LOAD_CONTRIBUTION',
          module: 'Listener',
          token: 'Log',
        });
      });

      it('rejects NEXUS_LOAD_CONTRIBUTION for a private contribution a hook first pins at a load', async () => {
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
        const ship = await Nexus.create(Meridian, {
          plugins: [
            {
              name: 'pin',
              apiVersion: 1,
              compile: {
                provider: (
                  p: { token: unknown },
                  context: { phase: string },
                ) =>
                  context.phase === 'load' && p.token === LOG
                    ? { with: provide(LOG, { useValue: 'pin' }), pin: true }
                    : undefined,
              },
            } as never,
          ],
        });
        expect(await rejected(ship.load(Quiet))).toMatchObject({
          code: 'NEXUS_LOAD_CONTRIBUTION',
          module: 'Quiet',
          token: 'Log',
        });
      });

      it("accepts a load where a compile.provider rewrite keeps a held record's token", async () => {
        const X = new Token<string>('X');
        const Root = defineModule({
          name: 'Root',
          providers: [
            provide(X, { useValue: 'x' }),
            provide(LOG, { useValue: 'tele' }),
          ],
        });
        const ship = await Nexus.create(Root, {
          plugins: [
            {
              name: 'rewrite',
              apiVersion: 1,
              compile: {
                provider: (
                  p: { token: unknown },
                  context: { phase: string },
                ) =>
                  context.phase === 'load' && p.token === X
                    ? { with: provide(LOG, { useValue: 'added' }) }
                    : undefined,
              },
            } as never,
          ],
        });
        await ship.load(Meridian);
        expect(ship.get(X)).toBe('x');
        expect(ship.get(LOG)).toEqual(['tele']);
      });
    });

    describe('compile.module replacements', () => {
      const LOG = new MultiToken<string>('Log');
      class Sink {
        constructor(readonly l: string[]) {}
      }
      const Other = defineModule({ name: 'Other' });
      const telemetry = (global: boolean) =>
        defineModule({
          name: 'Telemetry',
          global,
          providers: [provide(LOG, { useValue: 'tele' })],
          exports: [LOG],
        });
      const stub = (name: string, global: boolean, extra: string[] = []) =>
        defineModule({
          name,
          global,
          providers: [
            provide(LOG, { useValue: 'stub' }),
            ...extra.map((v) => provide(LOG, { useValue: v })),
          ],
          exports: [LOG],
        });
      const rootOf = (Telemetry: ReturnType<typeof telemetry>) =>
        defineModule({
          name: 'Root',
          imports: [Telemetry],
          providers: [provide(Sink, { deps: [all(LOG)] })],
        });

      it('loads a module next to a module a compile.module hook replaces with a fresh object every compile', async () => {
        const Telemetry = telemetry(false);
        const fresh = {
          name: 'fresh',
          apiVersion: 1,
          compile: {
            module: (m: unknown) =>
              m === Telemetry ? stub('TelemetryStub', false) : undefined,
          },
        } as never;
        const ship = await Nexus.create(rootOf(Telemetry), {
          plugins: [fresh],
        });
        expect(ship.get(Sink).l).toEqual(['stub']);
        await ship.load(Other);
        expect(ship.get(Sink).l).toEqual(['stub']);
      });

      it('loads a module next to a module with two exported contributions a compile.module hook replaces with an equal fresh object every compile', async () => {
        const Telemetry = telemetry(false);
        const fresh = {
          name: 'fresh',
          apiVersion: 1,
          compile: {
            module: (m: unknown) =>
              m === Telemetry
                ? stub('TelemetryStub', false, ['more'])
                : undefined,
          },
        } as never;
        const ship = await Nexus.create(rootOf(Telemetry), {
          plugins: [fresh],
        });
        expect(ship.get(Sink).l).toEqual(['stub', 'more']);
        await ship.load(Other);
        expect(ship.get(Sink).l).toEqual(['stub', 'more']);
      });

      describe('with a compile.provider hook that rewrites a contribution every compile', () => {
        const rewriter = (
          replace: (m: unknown) => unknown,
          rewrite: () => unknown = () =>
            provide(LOG, { useValue: 'rewritten' }),
        ) => {
          let seen = 0;
          return {
            name: 'rewriter',
            apiVersion: 1,
            compile: {
              module: (m: unknown) => {
                const next = replace(m);
                if (next !== undefined) seen = 0;
                return next;
              },
              provider: (p: { token: unknown }) =>
                p.token === LOG && ++seen === 2
                  ? { with: rewrite() }
                  : undefined,
            },
          } as never;
        };

        it('loads next to an exported pair an equal fresh stub replaces every compile', async () => {
          const Telemetry = telemetry(false);
          const ship = await Nexus.create(rootOf(Telemetry), {
            plugins: [
              rewriter((m) =>
                m === Telemetry ? stub('Stub', false, ['more']) : undefined,
              ),
            ],
          });
          expect(ship.get(Sink).l).toEqual(['stub', 'rewritten']);
          await ship.load(Other);
          expect(ship.get(Sink).l).toEqual(['stub', 'rewritten']);
        });

        it('rebuilds no singleton of a private pair an equal fresh stub replaces every compile', async () => {
          const built: string[] = [];
          const buildA = () => (built.push('a'), 'a');
          const buildB = () => (built.push('b'), 'b');
          // The hook wraps the second factory with one shared function, so the
          // rewritten record still builds and its recipe differs from the walked one.
          const wrapped = () => buildB();
          const make = () =>
            defineModule({
              name: 'Priv',
              providers: [
                provide(LOG, { useFactory: buildA, deps: [] }),
                provide(LOG, { useFactory: buildB, deps: [] }),
                provide(Sink, { deps: [all(LOG)] }),
              ],
              exports: [Sink],
            });
          const Priv = make();
          const ship = await Nexus.create(
            defineModule({ name: 'Root', imports: [Priv] }),
            {
              plugins: [
                rewriter(
                  (m) => (m === Priv ? make() : undefined),
                  () => provide(LOG, { useFactory: wrapped, deps: [] }),
                ),
              ],
            },
          );
          const sink = ship.get(Sink);
          const count = built.length;
          await ship.load(Other);
          expect(ship.get(Sink)).toBe(sink);
          expect(built.length).toBe(count);
        });
      });

      it('loads a module next to a global module a compile.module hook replaces with a fresh object every compile', async () => {
        const Telemetry = telemetry(true);
        const fresh = {
          name: 'fresh',
          apiVersion: 1,
          compile: {
            module: (m: unknown) =>
              m === Telemetry ? stub('GStub', true) : undefined,
          },
        } as never;
        const ship = await Nexus.create(rootOf(Telemetry), {
          plugins: [fresh],
        });
        await ship.load(Other);
        expect(ship.get(Sink).l).toEqual(['stub']);
      });

      describe('held modules across a load', () => {
        interface IReactor {
          readonly tag: string;
        }
        const REACTOR = new Token<IReactor>('Reactor');
        const SPARE = new Token<IReactor>('Spare');
        const SENSORS = new Token<IReactor>('Sensors');
        const SCANNER = new Token<IReactor>('Scanner');
        const EXTRA = new Token<IReactor>('Extra');
        class FusionReactor implements IReactor {
          readonly tag = 'fusion';
        }
        class Sensors implements IReactor {
          readonly tag = 'sensors';
        }
        const Eng = defineModule({
          name: 'Eng',
          providers: [provide(REACTOR, { useClass: FusionReactor })],
          exports: [REACTOR],
        });
        const Sci = defineModule({
          name: 'Sci',
          providers: [
            provide(SENSORS, { useClass: Sensors }),
            provide(SCANNER, { useClass: Sensors }),
          ],
          exports: [SENSORS, SCANNER],
        });
        const Ship = defineModule({ name: 'Ship', imports: [Eng, Sci] });
        const hookFor = (
          from: unknown,
          to: () => unknown,
          capture?: (ids: string[]) => void,
        ) =>
          ({
            name: 'held',
            apiVersion: 1,
            compile: {
              module: (m: unknown, context: { phase: string }) =>
                m === from && context.phase === 'load' ? to() : undefined,
              check: (view: {
                modules: { id: string }[];
                providers: { id: string }[];
              }) =>
                capture?.([
                  ...view.modules.map((m) => m.id),
                  ...view.providers.map((p) => p.id),
                ]),
            },
          }) as never;

        it("builds a provider a compile.module hook adds to a held module at a load and keeps the module's instances", async () => {
          const Grown = defineModule({
            name: 'Eng',
            providers: [
              provide(REACTOR, { useClass: FusionReactor }),
              provide(SPARE, { useClass: FusionReactor }),
            ],
            exports: [REACTOR, SPARE],
          });
          const ship = await Nexus.create(Ship, {
            plugins: [hookFor(Eng, () => Grown)],
          });
          const reactor = ship.get(REACTOR);
          const sensors = ship.get(SENSORS);
          await ship.load(Other);
          expect(ship.get(REACTOR)).toBe(reactor);
          expect(ship.get(SENSORS)).toBe(sensors);
          expect(ship.get(SPARE)).toBeInstanceOf(FusionReactor);
          expect(ship.get(SPARE)).not.toBe(reactor);
        });

        it("keeps every later module's instances when a compile.module hook gives a held module a new import at a load", async () => {
          const Added = defineModule({
            name: 'Added',
            providers: [provide(EXTRA, { useClass: FusionReactor })],
            exports: [EXTRA],
          });
          const WithImport = defineModule({
            name: 'Eng',
            imports: [Added],
            providers: [provide(REACTOR, { useClass: FusionReactor })],
            exports: [REACTOR],
          });
          const seen: string[][] = [];
          const ship = await Nexus.create(Ship, {
            plugins: [
              hookFor(
                Eng,
                () => WithImport,
                (ids) => seen.push(ids),
              ),
            ],
          });
          const sensors = ship.get(SENSORS);
          await ship.load(Other);
          expect(ship.get(SENSORS)).toBe(sensors);
          const [before, after] = [seen[0], seen[seen.length - 1]];
          for (const id of before) expect(after).toContain(id);
          expect(after.length).toBeGreaterThan(before.length);
        });

        it("keeps each instance with its token when a compile.module hook reorders a held module's providers at a load", async () => {
          const Flipped = defineModule({
            name: 'Sci',
            providers: [
              provide(SCANNER, { useClass: Sensors }),
              provide(SENSORS, { useClass: Sensors }),
            ],
            exports: [SENSORS, SCANNER],
          });
          const ship = await Nexus.create(Ship, {
            plugins: [hookFor(Sci, () => Flipped)],
          });
          const sensors = ship.get(SENSORS);
          const scanner = ship.get(SCANNER);
          expect(sensors).not.toBe(scanner);
          await ship.load(Other);
          expect(ship.get(SENSORS)).toBe(sensors);
          expect(ship.get(SCANNER)).toBe(scanner);
        });

        it('keeps the other instances when a compile.module hook drops a provider of a held module at a load, and builds it fresh when a later load restores it', async () => {
          const Dropped = defineModule({
            name: 'Eng',
            providers: [],
            exports: [],
          });
          let dropping = true;
          const seen: string[][] = [];
          const ship = await Nexus.create(Ship, {
            plugins: [
              hookFor(
                Eng,
                () => (dropping ? Dropped : Eng),
                (ids) => seen.push(ids),
              ),
            ],
          });
          const sensors = ship.get(SENSORS);
          const reactor = ship.get(REACTOR);
          await ship.load(Other);
          expect(ship.get(SENSORS)).toBe(sensors);
          const known = new Set(seen.flat());
          // Restoring the provider at a later load gives it a new id and a new instance.
          dropping = false;
          await ship.load(defineModule({ name: 'Later' }));
          const restored = seen[seen.length - 1].filter((id) => !known.has(id));
          expect(restored.length).toBeGreaterThan(0);
          expect(ship.get(SENSORS)).toBe(sensors);
          expect(ship.get(REACTOR)).not.toBe(reactor);
        });

        describe('private contributions', () => {
          const NOTE = new MultiToken<{ n: string }>('Note');
          const NOTES = new Token<string[]>('Notes');
          const note = (n: string) =>
            provide(NOTE, { useFactory: () => ({ n }), deps: [] });
          const a = note('a');
          const b = note('b');
          const c = note('c');
          const notes = provide(NOTES, {
            useFactory: (l: { n: string }[]) => l.map((x) => x.n),
            deps: [all(NOTE)],
            lifetime: 'scoped',
          } as never);
          const Priv = defineModule({
            name: 'Priv',
            providers: [a, b, notes],
            exports: [NOTES],
          });
          const create = (to: unknown) =>
            Nexus.create(defineModule({ name: 'Root', imports: [Priv] }), {
              plugins: [hookFor(Priv, () => to)],
            });
          const reading = async (
            ship: Awaited<ReturnType<typeof create>>,
          ): Promise<string[]> => (await ship.createScope()).get(NOTES);

          it('keeps each contribution with its own instance when a compile.module hook prepends one at a load', async () => {
            const Grown = defineModule({
              name: 'Priv',
              providers: [c, ...Priv.providers],
              exports: [NOTES],
            });
            const ship = await create(Grown);
            expect(await reading(ship)).toEqual(['a', 'b']);
            await ship.load(Other);
            expect(await reading(ship)).toEqual(['c', 'a', 'b']);
          });

          it("gives no contribution another one's instance when a compile.module hook prepends fresh provider objects at a load", async () => {
            const fresh = (list: string[]) =>
              defineModule({
                name: 'Priv',
                providers: [...list.map(note), notes],
                exports: [NOTES],
              });
            const ship = await create(fresh(['c', 'a', 'b']));
            expect(await reading(ship)).toEqual(['a', 'b']);
            await ship.load(Other);
            expect(await reading(ship)).toEqual(['c', 'a', 'b']);
          });

          it("gives no contribution another one's instance when a compile.module hook reorders fresh provider objects at a load", async () => {
            const ship = await create(
              defineModule({
                name: 'Priv',
                providers: [note('b'), note('a'), notes],
                exports: [NOTES],
              }),
            );
            expect(await reading(ship)).toEqual(['a', 'b']);
            await ship.load(Other);
            expect(await reading(ship)).toEqual(['b', 'a']);
          });

          it('keeps each contribution with its own instance when a compile.module hook reorders them at a load', async () => {
            const Flipped = defineModule({
              name: 'Priv',
              providers: [b, a, notes],
              exports: [NOTES],
            });
            const ship = await create(Flipped);
            expect(await reading(ship)).toEqual(['a', 'b']);
            await ship.load(Other);
            expect(await reading(ship)).toEqual(['b', 'a']);
          });
        });

        it('builds a held provider anew when a compile.provider hook removes it at one load and a later load brings it back', async () => {
          class Gear {}
          const GEAR = new Token<Gear>('Gear');
          let removing = false;
          const ship = await Nexus.create(
            defineModule({
              name: 'Root',
              providers: [provide(GEAR, { useClass: Gear })],
            }),
            {
              plugins: [
                {
                  name: 'bay',
                  apiVersion: 1,
                  compile: {
                    provider: (p: { token: unknown }, c: { phase: string }) =>
                      removing && c.phase === 'load' && p.token === GEAR
                        ? { remove: true }
                        : undefined,
                  },
                } as never,
              ],
            },
          );
          const first = ship.get(GEAR);
          removing = true;
          await ship.load(Other);
          removing = false;
          await ship.load(defineModule({ name: 'Later' }));
          const second = ship.get(GEAR);
          expect(second).toBeInstanceOf(Gear);
          expect(second).not.toBe(first);
          expect(ship.get(GEAR)).toBe(second);
        });

        it('keeps the surviving contribution with its own instance when a compile.module hook drops an equal-recipe entry at a load', async () => {
          interface IHandler {
            readonly n: number;
          }
          const HANDLER = new MultiToken<IHandler>('Handler');
          const LIST = new Token<{ hs: IHandler[] }>('List');
          let made = 0;
          const makeHandler = () => ({ n: ++made });
          const first = provide(HANDLER, { useFactory: makeHandler });
          const second = provide(HANDLER, { useFactory: makeHandler });
          const list = provide(LIST, {
            deps: [all(HANDLER)],
            useFactory: (hs: IHandler[]) => ({ hs }),
            lifetime: 'transient',
          } as never);
          const Held = defineModule({
            name: 'Eng',
            providers: [first, second, list],
            exports: [LIST],
          });
          const Dropped = defineModule({
            name: 'Eng',
            providers: [second, list],
            exports: [LIST],
          });
          const ship = await Nexus.create(
            defineModule({ name: 'Root', imports: [Held] }),
            { plugins: [hookFor(Held, () => Dropped)] },
          );
          expect(ship.get(LIST).hs.map((h) => h.n)).toEqual([1, 2]);
          await ship.load(Other);
          expect(ship.get(LIST).hs.map((h) => h.n)).toEqual([2]);
        });

        it('keeps the singletons of a stub a compile.module hook builds with inline factories every compile', async () => {
          const A = new Token<object>('A');
          const C = new Token<object>('C');
          const NOTE = new MultiToken<string>('Note');
          const Held = defineModule({
            name: 'Eng',
            providers: [
              provide(A, { useFactory: () => ({ a: 1 }) }),
              provide(C, { useFactory: () => ({ c: 1 }) }),
              provide(NOTE, { useValue: 'n' }),
            ],
            exports: [A, C, NOTE],
          });
          const stubbed = {
            name: 'inline',
            apiVersion: 1,
            compile: {
              module: (m: unknown) =>
                m === Held
                  ? defineModule({
                      name: 'Eng',
                      providers: [
                        provide(A, { useFactory: () => ({ a: 1 }) }),
                        provide(C, { useFactory: () => ({ c: 1 }) }),
                        provide(NOTE, { useFactory: () => 'n' }),
                      ],
                      exports: [A, C, NOTE],
                    })
                  : undefined,
            },
          } as never;
          const ship = await Nexus.create(
            defineModule({ name: 'Root', imports: [Held] }),
            { plugins: [stubbed] },
          );
          const a = ship.get(A);
          const c = ship.get(C);
          await ship.load(Other);
          expect(ship.get(A)).toBe(a);
          expect(ship.get(C)).toBe(c);
        });

        it('hands the ids a failed load introduced to the next load, whose instances are right', async () => {
          const seen: string[][] = [];
          const ship = await Nexus.create(Ship, {
            plugins: [
              hookFor(
                Eng,
                () => Eng,
                (ids) => seen.push(ids),
              ),
            ],
          });
          const sensors = ship.get(SENSORS);
          const Boom = defineModule({
            name: 'Boom',
            providers: [
              provide(EXTRA, {
                useFactory: () => {
                  throw new Error('no power');
                },
                deps: [],
              }),
            ],
            exports: [EXTRA],
          });
          await rejected(ship.load(Boom));
          const failedIds = seen[seen.length - 1];
          class Fine implements IReactor {
            readonly tag = 'fine';
          }
          const Good = defineModule({
            name: 'Good',
            providers: [provide(EXTRA, { useClass: Fine })],
            exports: [EXTRA],
          });
          await ship.load(Good);
          const goodIds = seen[seen.length - 1];
          // The failed run committed nothing, so Good takes the ids Boom had.
          expect(goodIds).toEqual(failedIds);
          expect(ship.get(EXTRA)).toBeInstanceOf(Fine);
          expect(ship.get(SENSORS)).toBe(sensors);
        });
      });

      it('rejects NEXUS_LOAD_CONTRIBUTION when a compile.module hook adds an exported contribution to a module the graph holds during a load', async () => {
        const Telemetry = telemetry(false);
        const grow = {
          name: 'grow',
          apiVersion: 1,
          compile: {
            module: (m: unknown, context: { phase: string }) =>
              m === Telemetry && context.phase === 'load'
                ? stub('TelemetryGrown', false, ['more'])
                : undefined,
          },
        } as never;
        const ship = await Nexus.create(rootOf(Telemetry), {
          plugins: [grow],
        });
        expect(await rejected(ship.load(Other))).toMatchObject({
          code: 'NEXUS_LOAD_CONTRIBUTION',
          module: 'TelemetryGrown',
          token: 'Log',
        });
        expect(ship.get(Sink).l).toEqual(['tele']);
      });

      it('rejects NEXUS_LOAD_GLOBAL_MODULE when a compile.module hook turns a module the graph holds global during a load', async () => {
        const Telemetry = telemetry(false);
        const turn = {
          name: 'turn',
          apiVersion: 1,
          compile: {
            module: (m: unknown, context: { phase: string }) =>
              m === Telemetry && context.phase === 'load'
                ? defineModule({
                    name: 'TelemetryGlobal',
                    global: true,
                    providers: [provide(LOG, { useValue: 'tele' })],
                    exports: [LOG],
                  })
                : undefined,
          },
        } as never;
        const ship = await Nexus.create(rootOf(Telemetry), {
          plugins: [turn],
        });
        expect(await rejected(ship.load(Other))).toMatchObject({
          code: 'NEXUS_LOAD_GLOBAL_MODULE',
          module: 'TelemetryGlobal',
        });
      });

      it('rejects NEXUS_LOAD_CONTRIBUTION when a compile.module hook makes a held private contribution public during a load', async () => {
        const PS = new Token<string[]>('PS');
        const Priv = defineModule({
          name: 'Priv',
          providers: [
            provide(LOG, { useValue: 'own' }),
            provide(PS, { useFactory: (l: string[]) => l, deps: [all(LOG)] }),
          ],
          exports: [PS],
        });
        const flip = {
          name: 'flip',
          apiVersion: 1,
          compile: {
            module: (m: unknown, context: { phase: string }) =>
              m === Priv && context.phase === 'load'
                ? defineModule({
                    name: 'PrivExported',
                    providers: [
                      provide(LOG, { useValue: 'own' }),
                      provide(PS, {
                        useFactory: (l: string[]) => l,
                        deps: [all(LOG)],
                      }),
                    ],
                    exports: [PS, LOG],
                  })
                : undefined,
          },
        } as never;
        const ship = await Nexus.create(
          defineModule({ name: 'Root', imports: [Priv] }),
          { plugins: [flip] },
        );
        expect(await rejected(ship.load(Other))).toMatchObject({
          code: 'NEXUS_LOAD_CONTRIBUTION',
          module: 'PrivExported',
          token: 'Log',
        });
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
