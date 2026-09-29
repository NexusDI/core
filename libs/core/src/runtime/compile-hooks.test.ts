import { describe, expect, it } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { MultiToken, Token } from '../definitions/token.js';
import type { BlueprintView, ProviderView } from '../blueprint/views.js';
import { Nexus } from './nexus.js';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const DIAGNOSTICS = new MultiToken<string>('Diagnostics');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
class FakeReactor implements IReactorCore {
  readonly output = 0;
}

const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor, lifetime: 'scoped' }),
    provide(DIAGNOSTICS, { useValue: 'hull' }),
  ],
  exports: [REACTOR, DIAGNOSTICS],
});
const Science = defineModule({
  name: 'Science',
  providers: [provide(DIAGNOSTICS, { useValue: 'sensors' })],
  exports: [DIAGNOSTICS],
});
const Meridian = defineModule({
  name: 'Meridian',
  imports: [Engineering, Science],
  exports: [REACTOR],
});

const rewrite = (name: string, provider: (view: ProviderView) => unknown) =>
  ({ name, apiVersion: 1, compile: { provider } }) as never;

describe('compile.module', () => {
  it('walks the returned module wherever the walk meets the original', async () => {
    const Stub = defineModule({
      name: 'EngineeringStub',
      providers: [provide(REACTOR, { useClass: FakeReactor })],
      exports: [REACTOR, DIAGNOSTICS],
      imports: [Science],
    });
    const ship = await Nexus.create(Meridian, {
      plugins: [
        {
          name: 'stub',
          apiVersion: 1,
          compile: { module: (m) => (m === Engineering ? Stub : undefined) },
        },
      ],
    });
    const scope = await ship.createScope();
    expect(scope.get(REACTOR)).toBeInstanceOf(FakeReactor);
  });

  it('makes get(T, { module: Mod }) select the replacement provider', async () => {
    const Stub = defineModule({
      name: 'EngineeringStub',
      providers: [provide(REACTOR, { useClass: FakeReactor })],
      exports: [REACTOR, DIAGNOSTICS],
      imports: [Science],
    });
    const ship = await Nexus.create(Meridian, {
      plugins: [
        {
          name: 'stub',
          apiVersion: 1,
          compile: { module: (m) => (m === Engineering ? Stub : undefined) },
        },
      ],
    });
    const scope = await ship.createScope();
    expect(scope.get(REACTOR, { module: Engineering })).toBeInstanceOf(
      FakeReactor,
    );
  });

  it('validates the replacement like any module', async () => {
    const Broken = defineModule({ name: 'Broken', exports: [REACTOR] });
    const error = await rejected(
      Nexus.create(Meridian, {
        plugins: [
          {
            name: 'stub',
            apiVersion: 1,
            compile: {
              module: (m) => (m === Engineering ? Broken : undefined),
            },
          },
        ],
      }),
    );
    expect(error).toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: 'NEXUS_INVALID_EXPORT',
          module: 'Broken',
        }),
      ]),
    });
  });
  it('asks each definition once per compile during load()', async () => {
    const calls = new Map<string, number>();
    const ship = await Nexus.create(Meridian, {
      plugins: [
        {
          name: 'count',
          apiVersion: 1,
          compile: {
            module: (m) => {
              calls.set(m.name, (calls.get(m.name) ?? 0) + 1);
              return undefined;
            },
          },
        },
      ],
    });
    calls.clear();
    await ship.load(defineModule({ name: 'Outpost', imports: [Science] }));
    expect(Object.fromEntries(calls)).toEqual({
      Meridian: 1,
      Engineering: 1,
      Science: 1,
      Outpost: 1,
    });
  });

  it('loads a module a hook replaced as a no-op, without asking the hook again', async () => {
    const Stub = defineModule({
      name: 'ScienceStub',
      providers: [provide(DIAGNOSTICS, { useValue: 'stub' })],
      exports: [DIAGNOSTICS],
    });
    let calls = 0;
    const ship = await Nexus.create(
      defineModule({ name: 'Root', imports: [Science] }),
      {
        plugins: [
          {
            name: 'stub',
            apiVersion: 1,
            compile: {
              module: (m) => {
                calls += 1;
                return m === Science ? Stub : undefined;
              },
            },
          },
        ],
      },
    );
    calls = 0;
    await ship.load(Science);
    expect(calls).toBe(0);
    expect(ship.get(DIAGNOSTICS)).toEqual(['stub']);
  });

  it('rejects a load whose replacement reaches a new global module', async () => {
    const Relay = defineModule({ name: 'Relay', global: true });
    const Outpost = defineModule({ name: 'Outpost' });
    const OutpostStub = defineModule({ name: 'OutpostStub', imports: [Relay] });
    const ship = await Nexus.create(Meridian, {
      plugins: [
        {
          name: 'stub',
          apiVersion: 1,
          compile: { module: (m) => (m === Outpost ? OutpostStub : undefined) },
        },
      ],
    });
    expect(await rejected(ship.load(Outpost))).toMatchObject({
      code: 'NEXUS_LOAD_GLOBAL_MODULE',
      module: 'Relay',
    });
  });

  it('reports a result that is not a module, naming what the hook returns', async () => {
    const error = await rejected(
      Nexus.create(Meridian, {
        plugins: [
          {
            name: 'bad',
            apiVersion: 1,
            compile: { module: () => 42 as never },
          },
        ],
      }),
    );
    // The hook answers 42 for every module the walk meets, one error each.
    expect(error).toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: 'NEXUS_PLUGIN_FAILED',
          plugin: 'bad',
          hook: 'compile.module',
          cause: expect.objectContaining({
            message:
              'returned the number 42; a compile.module hook returns a module or undefined.',
          }),
        }),
      ]),
    });
  });
});

describe('compile.provider', () => {
  it('replaces a provider in place, keeping its module and lifetime', async () => {
    const ship = await Nexus.create(Meridian, {
      plugins: [
        rewrite('fake', (p) =>
          p.token === REACTOR
            ? { with: provide(REACTOR, { useClass: FakeReactor }) }
            : undefined,
        ),
      ],
    });
    expect(() => ship.get(REACTOR)).toThrow(
      expect.objectContaining({ code: 'NEXUS_SCOPE_REQUIRED' }),
    );
    expect((await ship.createScope()).get(REACTOR)).toBeInstanceOf(FakeReactor);
  });

  it('pins one contribution of a MultiToken for every module', async () => {
    let first = true;
    const ship = await Nexus.create(Meridian, {
      plugins: [
        rewrite('pin', (p) => {
          if (p.token !== DIAGNOSTICS || !first) return undefined;
          first = false;
          return {
            with: provide(DIAGNOSTICS, { useValue: 'pass' }),
            pin: true,
          };
        }),
      ],
    });
    expect(ship.get(DIAGNOSTICS)).toEqual(['pass']);
  });

  it('removes a provider, and the compiler reports its dependents', async () => {
    class Bridge {
      constructor(readonly reactor: IReactorCore) {}
    }
    const Ship = defineModule({
      name: 'Ship',
      imports: [Meridian],
      providers: [provide(Bridge, { deps: [REACTOR], lifetime: 'scoped' })],
    });
    const error = await rejected(
      Nexus.create(Ship, {
        plugins: [
          rewrite('drop', (p) =>
            p.token === REACTOR ? { remove: true } : undefined,
          ),
        ],
      }),
    );
    expect(error).toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: 'NEXUS_MISSING_PROVIDER',
          requester: 'Bridge',
        }),
      ]),
    });
  });

  it('reports two plugins that rewrite one provider', async () => {
    const both = (p: ProviderView) =>
      p.token === REACTOR ? { remove: true } : undefined;
    const error = await rejected(
      Nexus.create(Meridian, {
        plugins: [rewrite('a', both), rewrite('b', both)],
      }),
    );
    expect(error).toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: 'NEXUS_PLUGIN_CONFLICT',
          plugins: ['a', 'b'],
          target: 'ReactorCore',
        }),
      ]),
    });
  });

  it('reports a hook that throws, beside the errors of the other passes', async () => {
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Root',
          imports: [Meridian],
          providers: [null as never],
        }),
        {
          plugins: [
            rewrite('boom', () => {
              throw new Error('boom');
            }),
          ],
        },
      ),
    );
    expect(
      (error as { errors: { code: string; hook?: string }[] }).errors.map(
        (e) => e.code,
      ),
    ).toEqual(
      expect.arrayContaining(['NEXUS_INVALID_PROVIDER', 'NEXUS_PLUGIN_FAILED']),
    );
    expect(error).toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({
          plugin: 'boom',
          hook: 'compile.provider',
        }),
      ]),
    });
  });
  it('reports a result that is not a rewrite, naming what the hook returns', async () => {
    const error = await rejected(
      Nexus.create(Meridian, {
        plugins: [
          rewrite('bad', (p) => (p.token === REACTOR ? 'swap' : undefined)),
        ],
      }),
    );
    expect(error).toMatchObject({
      errors: [
        {
          code: 'NEXUS_PLUGIN_FAILED',
          plugin: 'bad',
          hook: 'compile.provider',
          cause: {
            message:
              'returned the string "swap"; a compile.provider hook returns { with }, { remove: true } or undefined.',
          },
        },
      ],
    });
  });

  it('runs before the duplicate check, so removing one of two duplicates clears it', async () => {
    const Twice = defineModule({
      name: 'Twice',
      providers: [
        provide(REACTOR, { useClass: FusionReactor }),
        provide(REACTOR, { useClass: FakeReactor }),
      ],
      exports: [REACTOR],
    });
    let seen = 0;
    const ship = await Nexus.create(Twice, {
      plugins: [
        rewrite('dedupe', (p) =>
          p.token === REACTOR && seen++ === 0 ? { remove: true } : undefined,
        ),
      ],
    });
    expect(ship.get(REACTOR)).toBeInstanceOf(FakeReactor);
  });

  it('reports a cycle that a rewrite forms', async () => {
    interface IHelm {
      readonly nav: INav;
    }
    interface INav {
      readonly course: string;
    }
    const HELM = new Token<IHelm>('Helm');
    const NAV = new Token<INav>('Nav');
    class Helm implements IHelm {
      constructor(readonly nav: INav) {}
    }
    class StarCharts implements INav {
      readonly course = 'Vega';
    }
    class HelmCharts implements INav {
      readonly course = 'Vega';
      constructor(readonly helm: IHelm) {}
    }
    const Bridge = defineModule({
      name: 'Bridge',
      providers: [
        provide(HELM, { useClass: Helm, deps: [NAV] }),
        provide(NAV, { useClass: StarCharts }),
      ],
    });
    const error = await rejected(
      Nexus.create(Bridge, {
        plugins: [
          rewrite('loop', (p) =>
            p.token === NAV
              ? { with: provide(NAV, { useClass: HelmCharts, deps: [HELM] }) }
              : undefined,
          ),
        ],
      }),
    );
    expect(error).toMatchObject({
      errors: [{ code: 'NEXUS_CIRCULAR_DEPENDENCY' }],
    });
  });

  it('reports a lifetime that a rewrite violates', async () => {
    interface ILog {
      write(line: string): void;
    }
    const LOG = new Token<ILog>('Log');
    class ConsoleLog implements ILog {
      write(): void {}
    }
    class ReactorLog implements ILog {
      constructor(readonly reactor: IReactorCore) {}
      write(): void {}
    }
    const Ship = defineModule({
      name: 'Ship',
      imports: [Meridian],
      providers: [provide(LOG, { useClass: ConsoleLog })],
    });
    const error = await rejected(
      Nexus.create(Ship, {
        plugins: [
          rewrite('trace', (p) =>
            p.token === LOG
              ? {
                  with: provide(LOG, { useClass: ReactorLog, deps: [REACTOR] }),
                }
              : undefined,
          ),
        ],
      }),
    );
    expect(error).toMatchObject({
      errors: [
        {
          code: 'NEXUS_LIFETIME_VIOLATION',
          path: ['Log', 'ReactorCore'],
        },
      ],
    });
  });

  describe('an invalid entry', () => {
    interface ILog {
      write(line: string): void;
    }
    const LOG = new Token<ILog>('Log');
    const TRACE = new Token<ILog>('Trace');
    class ConsoleLog implements ILog {
      write(): void {}
    }
    const Deck = defineModule({
      name: 'Deck',
      providers: [provide(LOG, { useClass: ConsoleLog, lifetime: 'scoped' })],
    });
    const Hull = defineModule({
      name: 'Hull',
      providers: [
        provide(LOG, { useClass: ConsoleLog, lifetime: 'transient' }),
        provide(TRACE, { useClass: ConsoleLog }),
      ],
    });
    const Ship = defineModule({ name: 'Ship', imports: [Deck, Hull] });
    const BAD = { useClass: 42 } as never;
    /** A check hook that records each Log provider's view. */
    const watch = (seen: ProviderView[]) =>
      ({
        name: 'watch',
        apiVersion: 1,
        compile: {
          check: (view: BlueprintView) =>
            void seen.push(...view.providers.filter((p) => p.name === 'Log')),
        },
      }) as never;

    it('names the rewriter by its label', async () => {
      const error = await rejected(
        Nexus.create(Deck, {
          plugins: [
            rewrite('flags', (p) =>
              p.token === LOG ? { with: BAD, label: 'swap' } : undefined,
            ),
          ],
        }),
      );
      expect(error).toMatchObject({
        errors: [
          { code: 'NEXUS_INVALID_PROVIDER', module: 'swap(Log)', index: 0 },
        ],
      });
      const [inner] = (error as { errors: Error[] }).errors;
      expect(inner?.message).toContain('swap(Log)');
      expect(inner?.message).not.toContain('\n');
    });

    it('names the rewriter by the plugin without a label', async () => {
      const error = await rejected(
        Nexus.create(Deck, {
          plugins: [
            rewrite('flags', (p) =>
              p.token === LOG ? { with: BAD } : undefined,
            ),
          ],
        }),
      );
      expect(error).toMatchObject({
        errors: [
          { code: 'NEXUS_INVALID_PROVIDER', module: 'flags(Log)', index: 0 },
        ],
      });
    });

    it('names the rewriter by the plugin when the label is undefined', async () => {
      const options: { label?: string } = {};
      const error = await rejected(
        Nexus.create(Deck, {
          plugins: [
            rewrite('flags', (p) =>
              p.token === LOG ? { with: BAD, label: options.label } : undefined,
            ),
          ],
        }),
      );
      expect(error).toMatchObject({
        errors: [
          { code: 'NEXUS_INVALID_PROVIDER', module: 'flags(Log)', index: 0 },
        ],
      });
    });

    it('reports one entry returned for two providers of a token once', async () => {
      const error = await rejected(
        Nexus.create(Ship, {
          plugins: [
            rewrite('flags', (p) =>
              p.token === LOG ? { with: BAD } : undefined,
            ),
          ],
        }),
      );
      expect(error).toMatchObject({
        errors: [{ code: 'NEXUS_INVALID_PROVIDER', module: 'flags(Log)' }],
      });
      expect((error as { errors: unknown[] }).errors).toHaveLength(1);
    });

    it('reports one entry returned for two tokens once per token', async () => {
      const error = await rejected(
        Nexus.create(Hull, {
          plugins: [rewrite('flags', () => ({ with: BAD }))],
        }),
      );
      expect(error).toMatchObject({
        errors: [
          { code: 'NEXUS_INVALID_PROVIDER', module: 'flags(Log)' },
          { code: 'NEXUS_INVALID_PROVIDER', module: 'flags(Trace)' },
        ],
      });
      expect((error as { errors: unknown[] }).errors).toHaveLength(2);
    });

    it.each(['', 42])(
      'fails the hook for the label %j and leaves the provider as it was',
      async (label) => {
        const seen: ProviderView[] = [];
        const error = await rejected(
          Nexus.create(Deck, {
            plugins: [
              rewrite('flags', (p) =>
                p.token === LOG
                  ? { with: provide(LOG, { useClass: ConsoleLog }), label }
                  : undefined,
              ),
              watch(seen),
            ],
          }),
        );
        expect(error).toMatchObject({
          errors: [
            {
              code: 'NEXUS_PLUGIN_FAILED',
              plugin: 'flags',
              hook: 'compile.provider',
            },
          ],
        });
        expect(seen.map((p) => p.rewrittenBy)).toEqual([null]);
      },
    );

    it('keeps each record its own id, module and lifetime when one valid entry replaces two', async () => {
      const seen: ProviderView[] = [];
      const entry = provide(LOG, { useClass: ConsoleLog });
      await Nexus.create(Ship, {
        plugins: [
          rewrite('flags', (p) =>
            p.token === LOG ? { with: entry } : undefined,
          ),
          watch(seen),
        ],
      });
      expect(seen).toHaveLength(2);
      expect(new Set(seen.map((p) => p.id)).size).toBe(2);
      expect(new Set(seen.map((p) => p.module)).size).toBe(2);
      expect(seen.map((p) => p.lifetime).sort()).toEqual([
        'scoped',
        'transient',
      ]);
      expect(seen.map((p) => p.rewrittenBy)).toEqual(['flags', 'flags']);
    });
  });
});

describe('compile.check', () => {
  it('receives a frozen view marked incomplete, and appends errors after core errors', async () => {
    let seen: unknown;
    const error = await rejected(
      Nexus.create(defineModule({ name: 'Root', providers: [null as never] }), {
        plugins: [
          {
            name: 'lint',
            apiVersion: 1,
            compile: {
              check: (view, report) => {
                seen = view;
                report(new PluginErrorLike('lint found a problem') as never);
              },
            },
          },
        ],
      }),
    );
    expect(Object.isFrozen(seen)).toBe(true);
    expect(seen).toMatchObject({ phase: 'create', complete: false });
    expect(
      (error as { errors: { code: string }[] }).errors.map((e) => e.code),
    ).toEqual(['NEXUS_INVALID_PROVIDER', 'NEXUS_TEST_LINT']);
  });

  it("reads the root module's id on a failed compile", async () => {
    let seen: BlueprintView | undefined;
    await rejected(
      Nexus.create(
        defineModule({
          name: 'Root',
          imports: [Science],
          providers: [null as never],
        }),
        {
          plugins: [
            {
              name: 'root',
              apiVersion: 1,
              compile: { check: (view) => void (seen = view) },
            },
          ],
        },
      ),
    );
    expect(seen?.complete).toBe(false);
    expect(seen?.root).toBe('m0');
    expect(seen?.modules.find((m) => m.id === seen?.root)?.name).toBe('Root');
  });

  it('runs again in load() with phase load', async () => {
    const phases: string[] = [];
    const ship = await Nexus.create(defineModule({ name: 'Root' }), {
      plugins: [
        {
          name: 'phases',
          apiVersion: 1,
          compile: { check: (view) => void phases.push(view.phase) },
        },
      ],
    });
    await ship.load(defineModule({ name: 'Science' }));
    expect(phases).toEqual(['create', 'load']);
  });

  it('ignores a change to a definition after compile', async () => {
    const providers = [provide(REACTOR, { useClass: FusionReactor })];
    const Root = defineModule({ name: 'Root', providers, exports: [REACTOR] });
    let view: BlueprintView | undefined;
    const ship = await Nexus.create(Root, {
      plugins: [
        {
          name: 'keep',
          apiVersion: 1,
          compile: { check: (v) => void (view = v) },
        },
      ],
    });
    expect(() => (view?.providers as ProviderView[]).pop()).toThrow(TypeError);
    expect(ship.get(REACTOR)).toBeInstanceOf(FusionReactor);

    providers.push(provide(DIAGNOSTICS, { useValue: 'late' }) as never);
    await ship.load(defineModule({ name: 'Science' }));
    expect(view?.phase).toBe('load');
    expect(view?.providers.map((p) => p.token)).not.toContain(DIAGNOSTICS);
  });
});

/** A NexusError from a hypothetical lint plugin. */
class PluginErrorLike extends Error {
  readonly code = 'NEXUS_TEST_LINT';
}
