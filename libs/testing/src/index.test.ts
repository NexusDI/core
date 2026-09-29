import { describe, expect, it, vi } from 'vitest';

import {
  BlueprintError,
  defineModule,
  isNexusError,
  lazy,
  MultiToken,
  Nexus,
  NexusError,
  provide,
  Token,
  type NexusPlugin,
  type PluginContext,
  type TraceEvent,
} from '@nexusdi/core';

import { rejected, thrown } from '../test-support/catch.js';
import { createTestingContainer, OverrideError } from './index.js';

interface NavCharts {
  plot(to: string): string;
}
const NAV_CHARTS = new Token<NavCharts>('NavCharts');
const real: NavCharts = { plot: (to) => `real course to ${to}` };
const fake: NavCharts = { plot: () => 'fake course' };

class ReactorCore {
  output = 1.21;
}
class FakeReactor extends ReactorCore {
  override output = 0;
}
class SubspaceLink {}
const REACTOR = new Token<ReactorCore>('ReactorCore');
const Meridian = defineModule({
  name: 'Meridian',
  providers: [provide(REACTOR, { useClass: ReactorCore })],
});

/**
 * A plugin whose setup keeps the plugin context, and the module names of
 * the blueprint the container currently publishes.
 */
function capture(): { plugin: NexusPlugin; modules(): string[] } {
  let context: PluginContext | undefined;
  return {
    plugin: {
      name: 'capture',
      apiVersion: 1,
      setup: (given: PluginContext) => void (context = given),
    },
    modules: () => context?.blueprint().modules.map((m) => m.name) ?? [],
  };
}

describe('createTestingContainer', () => {
  it('replaces every provider of a plain token, in every module', async () => {
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [provide(NAV_CHARTS, { useValue: real })],
    });
    const Tactical = defineModule({
      name: 'Tactical',
      providers: [provide(NAV_CHARTS, { useValue: real })],
    });
    const ship = await createTestingContainer(
      defineModule({ name: 'Meridian', imports: [Engineering, Tactical] }),
    )
      .override(NAV_CHARTS, { useValue: fake })
      .create();
    expect(ship.get(NAV_CHARTS, { module: Engineering })).toBe(fake);
    expect(ship.get(NAV_CHARTS, { module: Tactical })).toBe(fake);
  });

  it('keeps the replaced provider module and lifetime unless the override sets a lifetime', async () => {
    const Root = defineModule({
      name: 'Root',
      providers: [provide(ReactorCore, { lifetime: 'scoped' })],
    });
    const kept = await createTestingContainer(Root)
      .override(ReactorCore, { useClass: FakeReactor })
      .create();
    expect(thrown(() => kept.get(ReactorCore))).toMatchObject({
      code: 'NEXUS_SCOPE_REQUIRED',
    });
    await using shuttle = await kept.createScope();
    expect(shuttle.get(ReactorCore).output).toBe(0);

    const changed = await createTestingContainer(Root)
      .override(ReactorCore, { useClass: FakeReactor, lifetime: 'transient' })
      .create();
    expect(changed.get(ReactorCore)).not.toBe(changed.get(ReactorCore));
  });

  it('accepts a factory with deps', async () => {
    const Root = defineModule({
      name: 'Root',
      providers: [SubspaceLink, provide(NAV_CHARTS, { useValue: real })],
    });
    const ship = await createTestingContainer(Root)
      .override(NAV_CHARTS, {
        useFactory: (link) => ({ plot: () => `via ${link.constructor.name}` }),
        deps: [SubspaceLink],
      })
      .create();
    expect(ship.get(NAV_CHARTS).plot('x')).toBe('via SubspaceLink');
  });

  it('replaces the whole set of a MultiToken with the single contribution the override describes', async () => {
    const DIAGNOSTICS = new MultiToken<string>('Diagnostics');
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [
        provide(DIAGNOSTICS, { useValue: 'reactor' }),
        provide(DIAGNOSTICS, { useValue: 'hull' }),
      ],
      exports: [DIAGNOSTICS],
    });
    const Tactical = defineModule({
      name: 'Tactical',
      providers: [provide(DIAGNOSTICS, { useValue: 'sensors' })],
    });
    const ship = await createTestingContainer(
      defineModule({ name: 'Root', imports: [Engineering, Tactical] }),
    )
      .override(DIAGNOSTICS, { useValue: 'passing' })
      .create();
    expect(ship.get(DIAGNOSTICS)).toEqual(['passing']);
    expect(ship.get(DIAGNOSTICS, { module: Tactical })).toEqual(['passing']);
  });

  it('replaces a module wherever the walk meets it', async () => {
    const Comms = defineModule({
      name: 'Comms',
      providers: [SubspaceLink],
      exports: [SubspaceLink],
    });
    class LoopbackLink extends SubspaceLink {}
    const CommsStub = defineModule({
      name: 'CommsStub',
      providers: [provide(SubspaceLink, { useClass: LoopbackLink })],
      exports: [SubspaceLink],
    });
    const ship = await createTestingContainer(
      defineModule({ name: 'Root', imports: [Comms] }),
    )
      .overrideModule(Comms, CommsStub)
      .create();
    expect(ship.get(SubspaceLink)).toBeInstanceOf(LoopbackLink);
  });

  it('replaces every forRoot() instance of a configurable base module', async () => {
    const OPTIONS = new Token<number>('Frequency');
    const Comms = defineModule({
      name: 'Comms',
      options: OPTIONS,
      providers: [provide(SubspaceLink, { deps: [] })],
      exports: [SubspaceLink],
    });
    const CommsStub = defineModule({
      name: 'CommsStub',
      providers: [SubspaceLink],
      exports: [SubspaceLink],
    });
    const graph = capture();
    await createTestingContainer(
      defineModule({ name: 'Root', imports: [Comms.forRoot(1420)] }),
    )
      .overrideModule(Comms, CommsStub)
      .create({ plugins: [graph.plugin] });
    expect(graph.modules()).toEqual(['Root', 'CommsStub']);
  });

  it('rejects NEXUS_OVERRIDE_EXPORTS when a stub misses an export of the module it replaces', async () => {
    const Comms = defineModule({
      name: 'Comms',
      providers: [SubspaceLink],
      exports: [SubspaceLink],
    });
    const Empty = defineModule({ name: 'Empty' });
    const error = await rejected(
      createTestingContainer(defineModule({ name: 'Root', imports: [Comms] }))
        .overrideModule(Comms, Empty)
        .create(),
    );
    expect(error).toMatchObject({
      code: 'NEXUS_BLUEPRINT_INVALID',
      errors: [
        {
          code: 'NEXUS_OVERRIDE_EXPORTS',
          module: 'Comms',
          missing: ['SubspaceLink'],
        },
      ],
    });
  });

  it('rejects NEXUS_OVERRIDE_UNUSED for an override that matches nothing', async () => {
    const error = await rejected(
      createTestingContainer(defineModule({ name: 'Root' }))
        .override(NAV_CHARTS, { useValue: fake })
        .overrideModule(
          defineModule({ name: 'Nowhere' }),
          defineModule({ name: 'Stub' }),
        )
        .create(),
    );
    expect(error).toMatchObject({
      errors: [
        { code: 'NEXUS_OVERRIDE_UNUSED', token: 'NavCharts' },
        { code: 'NEXUS_OVERRIDE_UNUSED', token: 'Nowhere' },
      ],
    });
  });

  it('fails exactly as production does when an override introduces a missing dep', async () => {
    class Missing {}
    const Root = defineModule({
      name: 'Root',
      providers: [provide(NAV_CHARTS, { useValue: real })],
    });
    const error = await rejected(
      createTestingContainer(Root)
        .override(NAV_CHARTS, { useFactory: () => fake, deps: [Missing] })
        .create(),
    );
    expect(error).toMatchObject({
      errors: [
        {
          code: 'NEXUS_MISSING_PROVIDER',
          token: 'Missing',
          requester: 'NavCharts',
        },
      ],
    });
  });

  it('skips onInit with onInit: false and still leaves every singleton ready', async () => {
    const init = vi.fn();
    class Reactor {
      onInit() {
        init();
      }
    }
    class Monitor {
      constructor(readonly reactor: () => Reactor) {}
    }
    const ship = await createTestingContainer(
      defineModule({
        name: 'Root',
        providers: [Reactor, provide(Monitor, { deps: [lazy(Reactor)] })],
      }),
    ).create({ onInit: false });
    expect(init).not.toHaveBeenCalled();
    expect(ship.get(Monitor).reactor()).toBe(ship.get(Reactor));
  });

  it('returns a new builder from every call, so a base builder can be shared', async () => {
    const Root = defineModule({
      name: 'Root',
      providers: [provide(NAV_CHARTS, { useValue: real })],
    });
    const base = createTestingContainer(Root);
    const faked = base.override(NAV_CHARTS, { useValue: fake });
    expect((await base.create()).get(NAV_CHARTS)).toBe(real);
    expect((await faked.create()).get(NAV_CHARTS)).toBe(fake);
  });

  it('passes the CreateOptions through and returns a Nexus', async () => {
    const events: TraceEvent[] = [];
    const recorder = {
      name: 'recorder',
      apiVersion: 1,
      observe: (event: TraceEvent) => void events.push(event),
    };
    const ship = await createTestingContainer(
      defineModule({ name: 'Root' }),
    ).create({ plugins: [recorder] });
    expect(ship).toBeInstanceOf(Nexus);
    expect(events[0]).toMatchObject({ type: 'compile', phase: 'create' });
  });

  it('keeps the overrides for modules loaded later', async () => {
    const Science = defineModule({
      name: 'Science',
      providers: [provide(NAV_CHARTS, { useValue: real })],
      exports: [NAV_CHARTS],
    });
    const ship = await createTestingContainer(
      defineModule({
        name: 'Root',
        providers: [provide(NAV_CHARTS, { useValue: real })],
      }),
    )
      .override(NAV_CHARTS, { useValue: fake })
      .create();
    await ship.load(defineModule({ name: 'Wrapper', imports: [Science] }));
    expect(ship.get(NAV_CHARTS, { module: Science })).toBe(fake);
  });

  // Carry-forward from Task 21: newGlobalImport and the existing-import check
  // in load.ts's loadNow looked modules up by their unreplaced definitions in
  // current.moduleByDefinition, which the walk keys by the replaced
  // definition instead (blueprint/overrides.ts moduleReplacer). Under a
  // testing container with overrideModule(), load() now replays the same
  // replace function compile() uses, so it agrees with what a recompile
  // actually builds.
  describe('load() under overrideModule', () => {
    it('does not reject NEXUS_LOAD_GLOBAL_MODULE for a global import the override already removed', async () => {
      const GlobalMod = defineModule({ name: 'GlobalMod', global: true });
      const Comms = defineModule({ name: 'Comms', imports: [GlobalMod] });
      const CommsStub = defineModule({ name: 'CommsStub' });
      // Comms sits behind Bridge, not as a direct root import, so a reload
      // of Comms cannot take the "already a direct import" shortcut and must
      // reach newGlobalImport's walk.
      const Bridge = defineModule({ name: 'Bridge', imports: [Comms] });
      const graph = capture();
      const ship = await createTestingContainer(
        defineModule({ name: 'Root', imports: [Bridge] }),
      )
        .overrideModule(Comms, CommsStub)
        .create({ plugins: [graph.plugin] });
      expect(graph.modules()).toEqual(['Root', 'Bridge', 'CommsStub']);
      await expect(ship.load(Comms)).resolves.toBeUndefined();
    });

    it('rejects NEXUS_LOAD_GLOBAL_MODULE for a new global reached alongside an already-used module override', async () => {
      const Relay = defineModule({ name: 'Relay', global: true });
      const Comms = defineModule({ name: 'Comms' });
      const CommsStub = defineModule({ name: 'CommsStub' });
      const Root = defineModule({ name: 'Root', imports: [Comms] });
      // Outpost imports the already-overridden Comms (replaced to CommsStub,
      // already in the graph, so that branch is a no-op) and Relay (a plain
      // global new to the graph): the override match must not stop the walk
      // from still finding Relay on the other branch.
      const Outpost = defineModule({
        name: 'Outpost',
        imports: [Comms, Relay],
      });
      const ship = await createTestingContainer(Root)
        .overrideModule(Comms, CommsStub)
        .create();
      expect(await rejected(ship.load(Outpost))).toMatchObject({
        code: 'NEXUS_LOAD_GLOBAL_MODULE',
        module: 'Relay',
      });
    });

    it('is a no-op to load a module the override already replaced at startup', async () => {
      class LoopbackLink extends SubspaceLink {}
      const Comms = defineModule({
        name: 'Comms',
        providers: [SubspaceLink],
        exports: [SubspaceLink],
      });
      const CommsStub = defineModule({
        name: 'CommsStub',
        providers: [provide(SubspaceLink, { useClass: LoopbackLink })],
        exports: [SubspaceLink],
      });
      const ship = await createTestingContainer(
        defineModule({ name: 'Root', imports: [Comms] }),
      )
        .overrideModule(Comms, CommsStub)
        .create();
      await expect(ship.load(Comms)).resolves.toBeUndefined();
      expect(ship.get(SubspaceLink)).toBeInstanceOf(LoopbackLink);
    });
  });

  describe('get() and has() with { module } after overrideModule', () => {
    const Comms = defineModule({
      name: 'Comms',
      providers: [SubspaceLink],
      exports: [SubspaceLink],
    });
    class LoopbackLink extends SubspaceLink {}
    const CommsStub = defineModule({
      name: 'CommsStub',
      providers: [provide(SubspaceLink, { useClass: LoopbackLink })],
      exports: [SubspaceLink],
    });

    it('makes get(T, { module: Mod }) return the stub provider', async () => {
      const ship = await createTestingContainer(
        defineModule({ name: 'Root', imports: [Comms] }),
      )
        .overrideModule(Comms, CommsStub)
        .create();
      expect(ship.get(SubspaceLink, { module: Comms })).toBeInstanceOf(
        LoopbackLink,
      );
    });

    it('makes has(T, { module: Mod }) true', async () => {
      const ship = await createTestingContainer(
        defineModule({ name: 'Root', imports: [Comms] }),
      )
        .overrideModule(Comms, CommsStub)
        .create();
      expect(ship.has(SubspaceLink, { module: Comms })).toBe(true);
    });

    it('still resolves get(T, { module: Stub }), naming the replacement itself', async () => {
      const ship = await createTestingContainer(
        defineModule({ name: 'Root', imports: [Comms] }),
      )
        .overrideModule(Comms, CommsStub)
        .create();
      expect(ship.get(SubspaceLink, { module: CommsStub })).toBeInstanceOf(
        LoopbackLink,
      );
    });

    it('returns the stub provider after a lazy override plus load(Mod)', async () => {
      const ship = await createTestingContainer(defineModule({ name: 'Root' }))
        .overrideModule(Comms, CommsStub, { lazy: true })
        .create();
      await ship.load(Comms);
      expect(ship.get(SubspaceLink, { module: Comms })).toBeInstanceOf(
        LoopbackLink,
      );
    });

    it('still throws NEXUS_INVALID_MODULE for a module in no graph', async () => {
      const Unrelated = defineModule({ name: 'Unrelated' });
      const ship = await createTestingContainer(
        defineModule({ name: 'Root', imports: [Comms] }),
      )
        .overrideModule(Comms, CommsStub)
        .create();
      expect(
        thrown(() => ship.get(SubspaceLink, { module: Unrelated })),
      ).toMatchObject({ code: 'NEXUS_INVALID_MODULE' });
    });
  });

  describe('overrideModule with { lazy: true }', () => {
    class LoopbackLink extends SubspaceLink {}
    const Comms = defineModule({
      name: 'Comms',
      providers: [SubspaceLink],
      exports: [SubspaceLink],
    });
    const CommsStub = defineModule({
      name: 'CommsStub',
      providers: [provide(SubspaceLink, { useClass: LoopbackLink })],
      exports: [SubspaceLink],
    });
    const Root = defineModule({ name: 'Root' });
    const lazily = () =>
      createTestingContainer(Root).overrideModule(Comms, CommsStub, {
        lazy: true,
      });

    it('walks the stub when load() adds the module', async () => {
      const graph = capture();
      await using ship = await lazily().create({ plugins: [graph.plugin] });
      await ship.load(Comms);
      expect(ship.get(SubspaceLink)).toBeInstanceOf(LoopbackLink);
      expect(graph.modules()).toEqual(['Root', 'CommsStub']);
    });

    it('walks the stub for a module the loaded module imports transitively', async () => {
      const Relay = defineModule({
        name: 'Relay',
        imports: [Comms],
        exports: [Comms],
      });
      const Outpost = defineModule({
        name: 'Outpost',
        imports: [Relay],
        exports: [Relay],
      });
      await using ship = await lazily().create();
      await ship.load(Outpost);
      expect(ship.get(SubspaceLink)).toBeInstanceOf(LoopbackLink);
    });

    it('accepts a lazy override that no load() uses', async () => {
      const graph = capture();
      await using ship = await lazily().create({ plugins: [graph.plugin] });
      expect(graph.modules()).toEqual(['Root']);
      expect(ship.has(SubspaceLink)).toBe(false);
    });

    it('keeps NEXUS_OVERRIDE_UNUSED at create for a non-lazy override of an absent module', async () => {
      const error = await rejected(
        createTestingContainer(Root).overrideModule(Comms, CommsStub).create(),
      );
      expect(error).toMatchObject({
        code: 'NEXUS_BLUEPRINT_INVALID',
        errors: [{ code: 'NEXUS_OVERRIDE_UNUSED', token: 'Comms' }],
      });
    });

    it('checks the stub exports when a load() uses the lazy override', async () => {
      const Empty = defineModule({ name: 'Empty' });
      await using ship = await createTestingContainer(Root)
        .overrideModule(Comms, Empty, { lazy: true })
        .create();
      expect(await rejected(ship.load(Comms))).toMatchObject({
        code: 'NEXUS_BLUEPRINT_INVALID',
        errors: [
          {
            code: 'NEXUS_OVERRIDE_EXPORTS',
            module: 'Comms',
            missing: ['SubspaceLink'],
          },
        ],
      });
    });

    it('makes a later non-lazy registration of the same module strict again', async () => {
      const error = await rejected(
        lazily().overrideModule(Comms, CommsStub).create(),
      );
      expect(error).toMatchObject({
        errors: [{ code: 'NEXUS_OVERRIDE_UNUSED', token: 'Comms' }],
      });
    });
  });

  it('passes the caller plugins after its own', async () => {
    const seen: string[] = [];
    await createTestingContainer(Meridian)
      .override(REACTOR, { useClass: FakeReactor })
      .create({
        plugins: [
          {
            name: 'probe',
            apiVersion: 1,
            compile: {
              check: (view) =>
                void seen.push(
                  view.providers.find((p) => p.name === 'ReactorCore')
                    ?.rewrittenBy ?? 'none',
                ),
            },
          },
        ],
      });
    expect(seen).toEqual(['nexus:testing']);
  });

  it('rejects NEXUS_PLUGIN_INVALID for a plugins option that is not an array, as Nexus.create does', async () => {
    const error = await rejected(
      createTestingContainer(Meridian).create({ plugins: {} as never }),
    );
    expect(error).toMatchObject({
      code: 'NEXUS_BLUEPRINT_INVALID',
      errors: [{ code: 'NEXUS_PLUGIN_INVALID', reason: 'not-an-array' }],
    });
  });

  it('accepts a stub that exports the token through a module it re-exports', async () => {
    const Comms = defineModule({
      name: 'Comms',
      providers: [SubspaceLink],
      exports: [SubspaceLink],
    });
    class LoopbackLink extends SubspaceLink {}
    const Loopback = defineModule({
      name: 'Loopback',
      providers: [provide(SubspaceLink, { useClass: LoopbackLink })],
      exports: [SubspaceLink],
    });
    const CommsStub = defineModule({
      name: 'CommsStub',
      imports: [Loopback],
      exports: [Loopback],
    });
    const ship = await createTestingContainer(
      defineModule({ name: 'Root', imports: [Comms] }),
    )
      .overrideModule(Comms, CommsStub)
      .create();
    expect(ship.get(SubspaceLink)).toBeInstanceOf(LoopbackLink);
  });

  it('accepts a stub that re-exports a module another override replaced', async () => {
    const Relay = defineModule({
      name: 'Relay',
      providers: [SubspaceLink],
      exports: [SubspaceLink],
    });
    const RelayStub = defineModule({
      name: 'RelayStub',
      providers: [SubspaceLink],
      exports: [SubspaceLink],
    });
    const Comms = defineModule({
      name: 'Comms',
      imports: [Relay],
      exports: [Relay],
    });
    const CommsStub = defineModule({
      name: 'CommsStub',
      imports: [Relay],
      exports: [Relay],
    });
    const ship = await createTestingContainer(
      defineModule({ name: 'Root', imports: [Comms] }),
    )
      .overrideModule(Comms, CommsStub)
      .overrideModule(Relay, RelayStub)
      .create();
    expect(ship.has(SubspaceLink)).toBe(true);
  });

  it('checks only the stubs its own compile walked, after a load() that failed mid-walk', async () => {
    class LoopbackLink extends SubspaceLink {}
    const Comms = defineModule({
      name: 'Comms',
      providers: [SubspaceLink],
      exports: [SubspaceLink],
    });
    const CommsStub = defineModule({
      name: 'CommsStub',
      providers: [provide(SubspaceLink, { useClass: LoopbackLink })],
      exports: [SubspaceLink],
    });
    const Relay = defineModule({ name: 'Relay', global: true });
    // The walk meets Comms, so the stub is used, and then Relay, a global
    // module new to the graph, fails the load before any check hook runs.
    const Outpost = defineModule({ name: 'Outpost', imports: [Comms, Relay] });
    const ship = await createTestingContainer(defineModule({ name: 'Root' }))
      .overrideModule(Comms, CommsStub, { lazy: true })
      .create();
    expect(await rejected(ship.load(Outpost))).toMatchObject({
      code: 'NEXUS_LOAD_GLOBAL_MODULE',
    });
    await expect(
      ship.load(defineModule({ name: 'Science' })),
    ).resolves.toBeUndefined();
  });

  // SEC-003 through override(): an override reads its own `lifetime` key
  // only (Object.hasOwn), so a polluted prototype cannot flip the scoped
  // lifetime provide() declared to the override's default. Core's
  // tier1-prevented.test.ts holds the same case for any compile.provider
  // rewrite.
  it('keeps the original lifetime when override() omits it, even while Object.prototype carries one', async () => {
    const proto = Object.prototype as Record<string, unknown>;
    proto['lifetime'] = 'transient';
    try {
      class Reactor {}
      class FakeReactor extends Reactor {}
      const ship = await createTestingContainer(
        defineModule({
          name: 'Root',
          providers: [provide(Reactor, { lifetime: 'scoped' })],
        }),
      )
        .override(Reactor, { useClass: FakeReactor })
        .create();
      expect(thrown(() => ship.get(Reactor))).toMatchObject({
        code: 'NEXUS_SCOPE_REQUIRED',
      });
    } finally {
      delete proto['lifetime'];
    }
  });

  describe('a malformed override', () => {
    interface ILog {
      write(line: string): void;
    }
    class ConsoleLog implements ILog {
      write(): void {}
    }

    it('is one NEXUS_INVALID_PROVIDER at override(Log), however many modules provide Log', async () => {
      const LOG = new Token<ILog>('Log');
      const Deck = defineModule({
        name: 'Deck',
        providers: [provide(LOG, { useClass: ConsoleLog })],
      });
      const Hull = defineModule({
        name: 'Hull',
        providers: [provide(LOG, { useClass: ConsoleLog })],
      });
      const error = await rejected(
        createTestingContainer(
          defineModule({ name: 'Ship', imports: [Deck, Hull] }),
        )
          .override(LOG, { useClass: 42 } as never)
          .create(),
      );
      expect(error).toBeInstanceOf(BlueprintError);
      expect((error as BlueprintError).errors).toHaveLength(1);
      expect(error).toMatchObject({
        errors: [
          { code: 'NEXUS_INVALID_PROVIDER', module: 'override(Log)', index: 0 },
        ],
      });
    });

    it('is one NEXUS_INVALID_PROVIDER at override(Diagnostics) for a MultiToken with two contributions', async () => {
      const DIAGNOSTICS = new MultiToken<ILog>('Diagnostics');
      const error = await rejected(
        createTestingContainer(
          defineModule({
            name: 'Ship',
            providers: [
              provide(DIAGNOSTICS, { useClass: ConsoleLog }),
              provide(DIAGNOSTICS, { useValue: new ConsoleLog() }),
            ],
          }),
        )
          .override(DIAGNOSTICS, { useClass: 42 } as never)
          .create(),
      );
      expect((error as BlueprintError).errors).toHaveLength(1);
      expect(error).toMatchObject({
        errors: [
          {
            code: 'NEXUS_INVALID_PROVIDER',
            module: 'override(Diagnostics)',
            index: 0,
          },
        ],
      });
    });
  });

  it.each([
    ['a plain object', {}, 'an object'],
    ['a string', 'x', 'the string "x"'],
    ['an undecorated class', class Probe {}, 'the function Probe'],
    [
      'an anonymous function',
      (
        () => () =>
          undefined
      )(),
      'the function (anonymous)',
    ],
  ])(
    'describes %s that is not a module the way revision 1 did',
    (_, value, received) => {
      const Comms = defineModule({ name: 'Comms' });
      const builder = createTestingContainer(defineModule({ name: 'Root' }));
      for (const call of [
        () => builder.overrideModule(value as never, Comms),
        () => builder.overrideModule(Comms, value as never),
      ])
        expect(thrown(call)).toMatchObject({
          code: 'NEXUS_INVALID_MODULE',
          received,
          path: [],
        });
    },
  );

  it('sets otherCopy for a module another copy of core made', () => {
    const Remote = Object.defineProperty(
      { name: 'Remote' },
      Symbol.for('nexusdi.definition'),
      { value: true },
    );
    const Comms = defineModule({ name: 'Comms' });
    const builder = createTestingContainer(defineModule({ name: 'Root' }));
    expect(
      thrown(() => builder.overrideModule(Remote as never, Comms)),
    ).toMatchObject({ code: 'NEXUS_INVALID_MODULE', otherCopy: true });
    const Versioned = Object.defineProperty(
      { name: 'Versioned' },
      Symbol.for('nexusdi.definition'),
      { value: '0.5.0' },
    );
    expect(
      thrown(() => builder.overrideModule(Versioned as never, Comms)),
    ).toMatchObject({ code: 'NEXUS_INVALID_MODULE', otherCopy: true });
    for (const local of [{}, new Token<string>('Nav')])
      expect(
        thrown(() => builder.overrideModule(local as never, Comms)),
      ).toMatchObject({ code: 'NEXUS_INVALID_MODULE', otherCopy: false });
  });

  it('names an anonymous class token (anonymous class) when its override matches nothing', async () => {
    const Anonymous = (() => class {})();
    const error = await rejected(
      createTestingContainer(defineModule({ name: 'Root' }))
        .override(Anonymous, { useValue: new Anonymous() })
        .create(),
    );
    expect(error).toMatchObject({
      errors: [{ code: 'NEXUS_OVERRIDE_UNUSED', token: '(anonymous class)' }],
    });
  });

  it('names an anonymous class export (anonymous class) when a stub misses it', async () => {
    const Anonymous = (() => class {})();
    const Comms = defineModule({
      name: 'Comms',
      providers: [Anonymous],
      exports: [Anonymous],
    });
    const error = await rejected(
      createTestingContainer(defineModule({ name: 'Root', imports: [Comms] }))
        .overrideModule(Comms, defineModule({ name: 'Empty' }))
        .create(),
    );
    expect(error).toMatchObject({
      errors: [
        {
          code: 'NEXUS_OVERRIDE_EXPORTS',
          module: 'Comms',
          missing: ['(anonymous class)'],
        },
      ],
    });
  });
});

describe('OverrideError', () => {
  /** The inner errors of the BlueprintError `promise` rejects with. */
  const innerOf = async (
    promise: Promise<unknown>,
  ): Promise<readonly NexusError[]> => {
    const error = await rejected(promise);
    expect(error).toBeInstanceOf(BlueprintError);
    return (error as BlueprintError).errors;
  };

  it('keeps the message of an unused override', async () => {
    const [error] = await innerOf(
      createTestingContainer(defineModule({ name: 'Root' }))
        .override(NAV_CHARTS, { useValue: fake })
        .create(),
    );
    expect(error?.message).toBe(
      '[NEXUS_OVERRIDE_UNUSED] override(NavCharts) matched no provider in the module graph.\n  Fix: remove the override, or import the module that provides NavCharts.',
    );
  });

  it('keeps the message of a stub that misses an export', async () => {
    const Comms = defineModule({
      name: 'Comms',
      providers: [SubspaceLink],
      exports: [SubspaceLink],
    });
    const [error] = await innerOf(
      createTestingContainer(defineModule({ name: 'Root', imports: [Comms] }))
        .overrideModule(Comms, defineModule({ name: 'Empty' }))
        .create(),
    );
    expect(error?.message).toBe(
      "[NEXUS_OVERRIDE_EXPORTS] the stub for Comms does not export SubspaceLink, which Comms exports.\n  Fix: add them to the stub's exports.",
    );
  });

  it('is a NexusError whose fields are its enumerable keys, and isNexusError narrows to it by code', async () => {
    const [error] = await innerOf(
      createTestingContainer(defineModule({ name: 'Root' }))
        .override(NAV_CHARTS, { useValue: fake })
        .create(),
    );
    expect(error).toBeInstanceOf(OverrideError);
    expect(error).toBeInstanceOf(NexusError);
    expect(error?.name).toBe('OverrideError');
    expect({ ...error }).toEqual({
      token: 'NavCharts',
      module: null,
      missing: [],
    });
    expect(Object.keys(error ?? {})).toEqual(['token', 'module', 'missing']);
    if (!isNexusError(error, 'NEXUS_OVERRIDE_UNUSED'))
      throw new Error('expected NEXUS_OVERRIDE_UNUSED');
    expect(error.token).toBe('NavCharts');
  });
});
