import { describe, expect, it, vi } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { recordEvents } from '../../test-support/observe.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from './nexus.js';
import type { TraceEvent } from './trace.js';

function only<K extends TraceEvent['type']>(
  events: readonly TraceEvent[],
  type: K,
): Extract<TraceEvent, { type: K }>[] {
  return events.filter(
    (e): e is Extract<TraceEvent, { type: K }> => e.type === type,
  );
}

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
