import { describe, expect, it, vi } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { deferred } from '../../test-support/deferred.js';
import { recordEvents } from '../../test-support/observe.js';
import { defineModule } from '../definitions/define-module.js';
import { lazy } from '../definitions/modifiers.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { REQUEST } from '../definitions/request.js';
import { Nexus } from './nexus.js';
import type { TraceEvent } from './trace.js';

/** `value`, after the test checked that it exists. */
function defined<T>(value: T | undefined): T {
  expect(value).toBeDefined();
  return value as T;
}

function only<K extends TraceEvent['type']>(
  events: readonly TraceEvent[],
  type: K,
): Extract<TraceEvent, { type: K }>[] {
  return events.filter(
    (e): e is Extract<TraceEvent, { type: K }> => e.type === type,
  );
}

/** Busy-waits `ms` on the clock, so a constructor takes a measurable time. */
function spin(ms: number): void {
  const end = performance.now() + ms;
  while (performance.now() < end);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

interface IReactorCore {
  readonly output: number;
}
interface IShipComputer {
  readonly reactor: IReactorCore;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const COMPUTER = new Token<IShipComputer>('ShipComputer');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
  onInit(): void {}
}
class QuantumComputer implements IShipComputer {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(COMPUTER, { useClass: QuantumComputer }),
  ],
  exports: [REACTOR, COMPUTER],
});

describe('startMs', () => {
  it('gives every timed event a span inside the operation that emitted it', async () => {
    const { events, plugin } = recordEvents();
    const before = performance.now();
    const ship = await Nexus.create(Engineering, { plugins: [plugin] });
    const shuttle = await ship.createScope();
    class Probe {}
    await ship.load(
      defineModule({
        name: 'Science',
        providers: [provide(Probe, { lifetime: 'scoped' })],
      }),
    );
    await shuttle.extend();
    await shuttle[Symbol.asyncDispose]();
    await ship[Symbol.asyncDispose]();
    const after = performance.now();
    // The type names startMs so the loop below compiles. The predicate tests
    // durationMs alone, so a core event that lacks startMs still reaches the
    // assertions and fails them.
    const timed = events.filter(
      (e): e is Extract<TraceEvent, { durationMs: number; startMs: number }> =>
        'durationMs' in e,
    );
    expect(timed.map((e) => e.type)).toEqual(
      expect.arrayContaining([
        'compile',
        'construct',
        'init',
        'scope:create',
        'scope:extend',
        'scope:dispose',
        'dispose',
      ]),
    );
    for (const e of timed) {
      expect(e.startMs, e.type).toBeGreaterThanOrEqual(before);
      expect(e.startMs + e.durationMs, e.type).toBeLessThanOrEqual(after);
    }
  });

  it('reads no clock during create, get and dispose without an observer', async () => {
    const clock = vi.spyOn(performance, 'now');
    const ship = await Nexus.create(Engineering);
    ship.get(COMPUTER);
    await ship[Symbol.asyncDispose]();
    expect(clock).not.toHaveBeenCalled();
    clock.mockRestore();
  });
});

describe('run', () => {
  it('ends create with run 0 after every other event, and gives compile the id', async () => {
    const { events, plugin } = recordEvents();
    await using ship = await Nexus.create(Engineering, { plugins: [plugin] });
    expect(only(events, 'compile')).toMatchObject([
      { phase: 'create', run: 0 },
    ]);
    expect(events.at(-1)).toMatchObject({
      type: 'run',
      run: 0,
      kind: 'create',
      scope: null,
      ok: true,
    });
    expect(only(events, 'run')).toHaveLength(1);
    void ship;
  });

  it('draws load, createScope and extend ids from one counter on the root', async () => {
    const { events, plugin } = recordEvents();
    await using ship = await Nexus.create(Engineering, { plugins: [plugin] });
    await using shuttle = await ship.createScope();
    class Probe {}
    await ship.load(defineModule({ name: 'Science', providers: [Probe] }));
    await shuttle.extend();
    expect(only(events, 'run').map((e) => [e.run, e.kind, e.scope])).toEqual([
      [0, 'create', null],
      [1, 'createScope', shuttle.id],
      [2, 'load', null],
      [3, 'extend', shuttle.id],
    ]);
    expect(only(events, 'scope:create')).toMatchObject([{ run: 1 }]);
    expect(only(events, 'compile').map((e) => e.run)).toEqual([0, 2]);
    expect(only(events, 'scope:extend')).toMatchObject([{ run: 3 }]);
  });

  it('gives a Nexus.check compile no run and emits no run event', () => {
    const { events, plugin } = recordEvents();
    Nexus.check(Engineering, { plugins: [plugin] });
    expect(events).toMatchObject([
      { type: 'compile', phase: 'check', run: null },
    ]);
  });

  it('ends a failed create with one run event after its rollback', async () => {
    const { events, plugin } = recordEvents();
    class Disposable {
      [Symbol.dispose]() {}
    }
    class Broken {
      static deps = [Disposable] as const;
      constructor(_: Disposable) {
        throw new Error('coolant leak');
      }
    }
    await rejected(Nexus.create([Disposable, Broken], { plugins: [plugin] }));
    const types = events.map((e) => e.type);
    expect(types.indexOf('dispose:instance')).toBeLessThan(
      types.indexOf('run'),
    );
    expect(only(events, 'run')).toMatchObject([
      { run: 0, kind: 'create', ok: false },
    ]);
    expect(events.at(-1)?.type).toBe('run');
  });

  it('ends a create that fails to compile with a run event', async () => {
    const { events, plugin } = recordEvents();
    await rejected(Nexus.create([null as never], { plugins: [plugin] }));
    expect(events.map((e) => e.type)).toEqual(['compile', 'run']);
    expect(events.at(-1)).toMatchObject({ ok: false, kind: 'create' });
  });

  it('ends a create whose disposal started mid-build with exactly one run event', async () => {
    const { events, plugin } = recordEvents();
    let ship: Nexus | undefined;
    const holder = {
      name: 'test:holder',
      apiVersion: 1,
      construct(_: unknown, __: unknown, ___: unknown, container: unknown) {
        ship ??= container as Nexus;
        void ship[Symbol.asyncDispose]();
        return undefined;
      },
    };
    class Late {
      static deps = [REACTOR] as const;
      constructor(readonly reactor: IReactorCore) {}
    }
    await rejected(
      Nexus.create([provide(REACTOR, { useClass: FusionReactor }), Late], {
        plugins: [plugin, holder],
      }),
    );
    expect(only(events, 'run')).toMatchObject([{ run: 0, ok: false }]);
  });

  it('puts an observer throw on a failed run into ProviderError.disposalErrors', async () => {
    const thrown = new Error('telemetry down');
    const watcher = {
      name: 'test:watcher',
      apiVersion: 1,
      observe(event: TraceEvent) {
        if (event.type === 'run' && !event.ok) throw thrown;
      },
    };
    const SCANNER = new Token<object>('Scanner');
    const ship = await Nexus.create(
      [
        provide(SCANNER, {
          lifetime: 'scoped',
          useFactory: () => {
            throw new Error('sensor fault');
          },
        }),
      ],
      { plugins: [watcher] },
    );
    const error = (await rejected(ship.createScope())) as {
      code: string;
      disposalErrors: readonly unknown[];
    };
    expect(error.code).toBe('NEXUS_PROVIDER_FAILED');
    expect(error.disposalErrors.at(-1)).toBe(thrown);
    await ship[Symbol.asyncDispose]();
  });

  it('counts a load of a module the root already imports as a run', async () => {
    const { events, plugin } = recordEvents();
    await using ship = await Nexus.create(
      defineModule({ name: 'Root', imports: [Engineering] }),
      { plugins: [plugin] },
    );
    await ship.load(Engineering);
    expect(only(events, 'run').map((e) => [e.run, e.kind, e.ok])).toEqual([
      [0, 'create', true],
      [1, 'load', true],
    ]);
  });

  it('counts a load that throws before it compiles as a failed run with no compile', async () => {
    const { events, plugin } = recordEvents();
    await using ship = await Nexus.create(Engineering, { plugins: [plugin] });
    await rejected(ship.load(42 as never));
    expect(only(events, 'compile').map((e) => e.run)).toEqual([0]);
    expect(only(events, 'run').map((e) => [e.run, e.kind, e.ok])).toEqual([
      [0, 'create', true],
      [1, 'load', false],
    ]);
  });
});

describe('compile failure with a throwing observer', () => {
  it('throws the BlueprintError and drops the observer throw', async () => {
    const watcher = {
      name: 'test:watcher',
      apiVersion: 1,
      observe(event: TraceEvent) {
        if (event.type === 'compile') throw new Error('telemetry down');
      },
    };
    class Bridge {
      static deps = [REACTOR] as const;
      constructor(readonly reactor: IReactorCore) {}
    }
    const error = (await rejected(
      Nexus.create([Bridge], { plugins: [watcher] }),
    )) as { code: string };
    expect(error.code).toBe('NEXUS_BLUEPRINT_INVALID');
  });

  it('throws the BlueprintError when the observer throws on every event', async () => {
    const watcher = {
      name: 'test:watcher',
      apiVersion: 1,
      observe() {
        throw new Error('telemetry down');
      },
    };
    class Bridge {
      static deps = [REACTOR] as const;
      constructor(readonly reactor: IReactorCore) {}
    }
    const error = (await rejected(
      Nexus.create([Bridge], { plugins: [watcher] }),
    )) as { code: string };
    expect(error.code).toBe('NEXUS_BLUEPRINT_INVALID');
  });

  it('throws the LoadError of a load when the observer throws on every event', async () => {
    // Armed after create, which would fail on its own events otherwise, and
    // disarmed before disposal for the same reason.
    let armed = false;
    const watcher = {
      name: 'test:watcher',
      apiVersion: 1,
      observe() {
        if (armed) throw new Error('telemetry down');
      },
    };
    const ship = await Nexus.create(defineModule({ name: 'Root' }), {
      plugins: [watcher],
    });
    armed = true;
    const error = (await rejected(
      ship.load(defineModule({ name: 'Telemetry', global: true })),
    )) as { code: string };
    armed = false;
    expect(error.code).toBe('NEXUS_LOAD_GLOBAL_MODULE');
    await ship[Symbol.asyncDispose]();
  });

  it('still reports an observer throw on a compile that passed', async () => {
    const watcher = {
      name: 'test:watcher',
      apiVersion: 1,
      observe(event: TraceEvent) {
        if (event.type === 'compile') throw new Error('telemetry down');
      },
    };
    const error = (await rejected(
      Nexus.create(Engineering, { plugins: [watcher] }),
    )) as { code: string };
    expect(error.code).toBe('NEXUS_PROVIDER_FAILED');
  });
});

describe('an observer throw on the closing run event of a success', () => {
  const thrown = new Error('telemetry down');
  const onRun = (fire: () => boolean) => ({
    name: 'test:watcher',
    apiVersion: 1,
    observe(event: TraceEvent) {
      if (event.type === 'run' && event.ok && fire()) throw thrown;
    },
  });

  it('fails create and disposes the container it built', async () => {
    const disposed: string[] = [];
    class Airlock {
      [Symbol.dispose]() {
        disposed.push('Airlock');
      }
    }
    const error = (await rejected(
      Nexus.create([Airlock], { plugins: [onRun(() => true)] }),
    )) as { code: string; cause: unknown };
    expect(error.code).toBe('NEXUS_PROVIDER_FAILED');
    expect(error.cause).toBe(thrown);
    expect(disposed).toEqual(['Airlock']);
  });

  it('rejects load with a ProviderError, keeps the module, and makes a retry a no-op run', async () => {
    let armed = false;
    const { events, plugin } = recordEvents();
    const ship = await Nexus.create(Engineering, {
      plugins: [plugin, onRun(() => armed)],
    });
    const PROBE = new Token<object>('Probe');
    const Science = defineModule({
      name: 'Science',
      providers: [provide(PROBE, { useValue: {} })],
      exports: [PROBE],
    });
    armed = true;
    expect(await rejected(ship.load(Science))).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
      cause: thrown,
    });
    armed = false;
    expect(ship.has(PROBE)).toBe(true);
    await ship.load(Science);
    expect(only(events, 'compile').map((e) => e.run)).toEqual([0, 1]);
    expect(only(events, 'run').at(-1)).toMatchObject({
      run: 2,
      kind: 'load',
      ok: true,
    });
    await ship[Symbol.asyncDispose]();
  });
});

describe('runs that build nothing', () => {
  const MISSION = new Token<unknown>('Mission');
  const Tactical = defineModule({
    name: 'Tactical',
    providers: [
      provide(MISSION, {
        useFactory: (request) => request,
        deps: [REQUEST],
        lifetime: 'scoped',
      }),
    ],
    exports: [MISSION],
  });
  const Science = defineModule({
    name: 'Science',
    providers: [
      provide(new Token<object>('Probe'), {
        useFactory: () => ({}),
        lifetime: 'scoped',
      }),
    ],
  });

  it('counts an extend() to the pinned blueprint as a run with no scope:extend', async () => {
    const { events, plugin } = recordEvents();
    await using ship = await Nexus.create(Engineering, { plugins: [plugin] });
    await using shuttle = await ship.createScope();
    await shuttle.extend();
    expect(only(events, 'run').map((e) => [e.run, e.kind, e.ok])).toEqual([
      [0, 'create', true],
      [1, 'createScope', true],
      [2, 'extend', true],
    ]);
    expect(only(events, 'run').at(-1)?.scope).toBe(shuttle.id);
    expect(only(events, 'scope:extend')).toEqual([]);
  });

  it('gives each of two concurrent extend() calls for one blueprint its own run', async () => {
    const { events, plugin } = recordEvents();
    await using ship = await Nexus.create(Engineering, { plugins: [plugin] });
    await using shuttle = await ship.createScope();
    await ship.load(Science);
    await Promise.all([shuttle.extend(), shuttle.extend()]);
    expect(
      only(events, 'run')
        .filter((e) => e.kind === 'extend')
        .map((e) => [e.run, e.scope, e.ok]),
    ).toEqual([
      [3, shuttle.id, true],
      [4, shuttle.id, true],
    ]);
    expect(only(events, 'scope:extend')).toHaveLength(1);
  });

  it('counts an extend() on a closed scope as a failed run', async () => {
    const { events, plugin } = recordEvents();
    await using ship = await Nexus.create(Engineering, { plugins: [plugin] });
    const shuttle = await ship.createScope();
    await shuttle[Symbol.asyncDispose]();
    await rejected(shuttle.extend());
    expect(only(events, 'run').at(-1)).toMatchObject({
      run: 2,
      kind: 'extend',
      scope: shuttle.id,
      ok: false,
    });
  });

  it('counts an extend() that misses its request as a failed run', async () => {
    const { events, plugin } = recordEvents();
    await using ship = await Nexus.create(Engineering, { plugins: [plugin] });
    await using shuttle = await ship.createScope();
    await ship.load(Tactical);
    expect(await rejected(shuttle.extend())).toMatchObject({
      code: 'NEXUS_REQUEST_MISSING',
    });
    expect(only(events, 'run').at(-1)).toMatchObject({
      run: 3,
      kind: 'extend',
      scope: shuttle.id,
      ok: false,
    });
  });

  it('counts a createScope that misses its request as a failed run with no scope', async () => {
    const { events, plugin } = recordEvents();
    await using ship = await Nexus.create(Tactical, { plugins: [plugin] });
    expect(await rejected(ship.createScope())).toMatchObject({
      code: 'NEXUS_REQUEST_MISSING',
    });
    expect(only(events, 'run').at(-1)).toMatchObject({
      run: 1,
      kind: 'createScope',
      scope: null,
      ok: false,
    });
  });

  it('counts a createScope on a disposed root as a failed run with no scope', async () => {
    const { events, plugin } = recordEvents();
    const ship = await Nexus.create(Engineering, { plugins: [plugin] });
    await ship[Symbol.asyncDispose]();
    expect(await rejected(ship.createScope())).toMatchObject({
      code: 'NEXUS_DISPOSED',
    });
    expect(only(events, 'run').at(-1)).toMatchObject({
      run: 1,
      kind: 'createScope',
      scope: null,
      ok: false,
    });
  });
});

describe('the span of a queued run', () => {
  it('starts a load queued behind another at its call', async () => {
    const { events, plugin } = recordEvents();
    await using ship = await Nexus.create(Engineering, { plugins: [plugin] });
    const gate = deferred();
    const first = ship.load(
      defineModule({
        name: 'Science',
        providers: [
          provide(new Token<object>('Probe'), {
            useFactory: async () => {
              await gate.promise;
              return {};
            },
          }),
        ],
      }),
    );
    const second = ship.load(defineModule({ name: 'Medical' }));
    const called = performance.now();
    gate.resolve();
    await Promise.all([first, second]);
    const loads = only(events, 'run').filter((e) => e.kind === 'load');
    expect(loads.map((e) => e.run)).toEqual([1, 2]);
    expect(loads[1]?.startMs).toBeLessThanOrEqual(called);
  });
});

describe('an observer throw on a scope event', () => {
  const thrown = new Error('telemetry down');
  const throwOn = (type: TraceEvent['type']) => {
    const { events, plugin } = recordEvents();
    const watcher = {
      name: 'test:watcher',
      apiVersion: 1,
      observe(event: TraceEvent) {
        if (event.type === type) throw thrown;
      },
    };
    return { events, plugins: [plugin, watcher] };
  };

  it('rejects createScope with the raw throw and closes its run once', async () => {
    const { events, plugins } = throwOn('scope:create');
    await using ship = await Nexus.create(Engineering, { plugins });
    expect(await rejected(ship.createScope())).toBe(thrown);
    expect(
      only(events, 'run').filter((e) => e.kind === 'createScope'),
    ).toMatchObject([{ run: 1, ok: false }]);
  });

  it('rejects extend() with the raw throw and closes its run once', async () => {
    const { events, plugins } = throwOn('scope:extend');
    await using ship = await Nexus.create(Engineering, { plugins });
    await using shuttle = await ship.createScope();
    await ship.load(
      defineModule({
        name: 'Science',
        providers: [
          provide(new Token<object>('Probe'), {
            useFactory: () => ({}),
            lifetime: 'scoped',
          }),
        ],
      }),
    );
    expect(await rejected(shuttle.extend())).toBe(thrown);
    expect(
      only(events, 'run').filter((e) => e.kind === 'extend'),
    ).toMatchObject([{ run: 3, scope: shuttle.id, ok: false }]);
  });
});

describe('construct spans', () => {
  it('reports run, level, parent and the sync, await and finish split', async () => {
    const { events, plugin } = recordEvents();
    await using ship = await Nexus.create(Engineering, { plugins: [plugin] });
    void ship;
    const builds = only(events, 'construct');
    expect(
      builds.map((b) => [b.token, b.run, b.level, b.parent, b.awaitMs]),
    ).toEqual([
      ['ReactorCore', 0, 0, null, null],
      ['ShipComputer', 0, 1, null, null],
    ]);
    for (const b of builds) {
      const own = b.syncMs + (b.awaitMs ?? 0) + b.finishMs;
      expect(own).toBeLessThanOrEqual(b.durationMs + 1e-6);
      expect(b.finishMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('emits construct:await when a factory returns a thenable, then construct with awaitMs', async () => {
    const { events, plugin } = recordEvents();
    const CHARTS = new Token<object>('NavCharts');
    await using ship = await Nexus.create(
      [
        provide(CHARTS, {
          useFactory: async () => {
            await sleep(20);
            return {};
          },
        }),
      ],
      { plugins: [plugin] },
    );
    void ship;
    const waiting = only(events, 'construct:await');
    const done = only(events, 'construct');
    expect(waiting).toMatchObject([{ token: 'NavCharts', run: 0, level: 0 }]);
    expect(done).toMatchObject([{ token: 'NavCharts', async: true }]);
    expect(waiting[0]?.startMs).toBe(done[0]?.startMs);
    expect(waiting[0]?.syncMs).toBe(done[0]?.syncMs);
    expect(done[0]?.awaitMs).toBeGreaterThanOrEqual(15);
    const types = events.map((e) => e.type);
    expect(types.indexOf('construct:await')).toBeLessThan(
      types.indexOf('construct'),
    );
  });

  it('shows a sync provider queued behind its level siblings', async () => {
    const { events, plugin } = recordEvents();
    class Fast {}
    class Slow {
      constructor() {
        spin(5);
      }
    }
    await using ship = await Nexus.create([Fast, Slow], { plugins: [plugin] });
    void ship;
    const fast = defined(
      only(events, 'construct').find((b) => b.token === 'Fast'),
    );
    const own = fast.syncMs + fast.finishMs;
    expect(fast.durationMs - own).toBeGreaterThanOrEqual(4);
  });

  it('reports a real syncMs and a parent for nested on-demand and transient builds', async () => {
    const { events, plugin } = recordEvents();
    class Gauge {
      constructor() {
        spin(2);
      }
    }
    const LOG = new Token<object>('Log');
    // A plain dep on an eager: false singleton builds it in a level of its
    // own (rc.1); lazy() keeps it on demand, inside Console's constructor.
    class Console {
      static deps = [lazy(Gauge), LOG] as const;
      readonly gauge: Gauge;
      constructor(
        gauge: () => Gauge,
        readonly log: object,
      ) {
        this.gauge = gauge();
      }
    }
    await using ship = await Nexus.create(
      [
        provide(Gauge, { eager: false }),
        provide(LOG, { lifetime: 'transient', useFactory: () => ({}) }),
        Console,
      ],
      { plugins: [plugin] },
    );
    void ship;
    const byToken = new Map(only(events, 'construct').map((b) => [b.token, b]));
    const panel = defined(byToken.get('Console'));
    const gauge = defined(byToken.get('Gauge'));
    expect(byToken.get('Gauge')).toMatchObject({
      run: 0,
      level: null,
      parent: panel.providerId,
    });
    expect(gauge.syncMs).toBeGreaterThanOrEqual(1.5);
    expect(byToken.get('Log')).toMatchObject({
      run: null,
      level: null,
      parent: panel.providerId,
    });
    expect(panel.syncMs).toBeGreaterThanOrEqual(gauge.syncMs);
  });

  it('numbers a loaded provider by the new blueprint levels', async () => {
    const { events, plugin } = recordEvents();
    class L0 {}
    class L1 {
      static deps = [L0] as const;
      constructor(readonly d: L0) {}
    }
    class L2 {
      static deps = [L1] as const;
      constructor(readonly d: L1) {}
    }
    class L3 {
      static deps = [L2] as const;
      constructor(readonly d: L2) {}
    }
    const Core = defineModule({
      name: 'Core',
      providers: [L0, L1, L2, L3],
      exports: [L3],
    });
    // A root that imports Core, so the loaded module's import of Core is a
    // module the root already holds.
    await using ship = await Nexus.create(
      defineModule({ name: 'Ship', imports: [Core] }),
      { plugins: [plugin] },
    );
    class Probe {
      static deps = [L3] as const;
      constructor(readonly d: L3) {}
    }
    await ship.load(
      defineModule({ name: 'Science', imports: [Core], providers: [Probe] }),
    );
    expect(
      only(events, 'construct').find((b) => b.token === 'Probe'),
    ).toMatchObject({ run: 1, level: 4 });
  });

  it('gives a value and an alias the run that registered them', async () => {
    const { events, plugin } = recordEvents();
    const HULL = new Token<object>('Hull');
    const ARMOR = new Token<object>('Armor');
    const SHIELD = new Token<object>('Shield');
    const DEFLECTOR = new Token<object>('Deflector');
    await using ship = await Nexus.create(
      [provide(HULL, { useValue: {} }), provide(ARMOR, { useExisting: HULL })],
      { plugins: [plugin] },
    );
    await ship.load(
      defineModule({
        name: 'Defense',
        providers: [
          provide(SHIELD, { useValue: {} }),
          provide(DEFLECTOR, { useExisting: SHIELD }),
        ],
      }),
    );
    expect(
      only(events, 'construct').map((e) => [e.token, e.run, e.level]),
    ).toEqual(
      expect.arrayContaining([
        ['Hull', 0, null],
        ['Armor', 0, null],
        ['Shield', 1, null],
        ['Deflector', 1, null],
      ]),
    );
  });

  it('reports scoped builds with the createScope run and scopedLevels index', async () => {
    const { events, plugin } = recordEvents();
    const SCANNER = new Token<object>('Scanner');
    await using ship = await Nexus.create(
      [provide(SCANNER, { lifetime: 'scoped', useFactory: () => ({}) })],
      { plugins: [plugin] },
    );
    await using shuttle = await ship.createScope();
    expect(
      only(events, 'construct').find((b) => b.token === 'Scanner'),
    ).toMatchObject({
      run: 1,
      level: 0,
      scope: shuttle.id,
    });
  });
});
