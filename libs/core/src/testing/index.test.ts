import { describe, expect, it, vi } from 'vitest';

import { rejected, thrown } from '../../test-support/catch.js';
import {
  defineModule,
  lazy,
  MultiToken,
  Nexus,
  provide,
  Token,
  type TraceEvent,
} from '../index.js';
import { createTestingContainer } from './index.js';

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

  it('replaces every with() instance of a configurable base module', async () => {
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
    const ship = await createTestingContainer(
      defineModule({ name: 'Root', imports: [Comms.with(1420)] }),
    )
      .overrideModule(Comms, CommsStub)
      .create();
    expect(ship.graph().modules.map((m) => m.name)).toEqual([
      'Root',
      'CommsStub',
    ]);
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
    const ship = await createTestingContainer(
      defineModule({ name: 'Root' }),
    ).create({ trace: (e) => events.push(e) });
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
      const ship = await createTestingContainer(
        defineModule({ name: 'Root', imports: [Bridge] }),
      )
        .overrideModule(Comms, CommsStub)
        .create();
      expect(ship.graph().modules.map((m) => m.name)).toEqual([
        'Root',
        'Bridge',
        'CommsStub',
      ]);
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
      await using ship = await lazily().create();
      await ship.load(Comms);
      expect(ship.get(SubspaceLink)).toBeInstanceOf(LoopbackLink);
      expect(ship.graph().modules.map((m) => m.name)).toEqual([
        'Root',
        'CommsStub',
      ]);
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
      await using ship = await lazily().create();
      expect(ship.graph().modules.map((m) => m.name)).toEqual(['Root']);
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
});
