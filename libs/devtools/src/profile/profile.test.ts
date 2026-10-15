import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Nexus,
  Token,
  defineModule,
  isNexusError,
  lazy,
  provide,
} from '@nexusdi/core';

import { rejected, thrown } from '../../test-support/catch.js';
import { defined } from '../../test-support/defined.js';
import { profile } from '../index.js';
import { liveSink } from '../live.js';

interface IReactorCore {
  readonly output: number;
}
interface INavCharts {
  readonly sectors: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const NAV_CHARTS = new Token<INavCharts>('NavCharts');
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
}
const Engineering = defineModule({
  name: 'Engineering',
  providers: [
    provide(REACTOR, { useClass: FusionReactor }),
    provide(NAV_CHARTS, {
      useFactory: async (_: IReactorCore) => ({ sectors: 3 }),
      deps: [REACTOR],
    }),
  ],
  exports: [REACTOR, NAV_CHARTS],
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('profile', () => {
  it('records a create run as plain JSON with its builds, steps and graph', async () => {
    const profiler = profile();
    await using ship = await Nexus.create(Engineering, { plugins: [profiler] });
    void ship;
    const report = profiler.report();
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
    expect(report).toMatchObject({
      format: 'nexusdi-profile',
      version: 1,
      dropped: 0,
    });
    const [run] = report.runs;
    expect(run).toMatchObject({ id: 0, kind: 'create', ok: true, pending: [] });
    expect(defined(run).builds.map((b) => [b.token, b.level, b.async])).toEqual(
      [
        ['ReactorCore', 0, false],
        ['NavCharts', 1, true],
      ],
    );
    expect(defined(run).steps.map((s) => s.step)).toEqual([
      'compile',
      'build',
      'setup',
    ]);
    expect(report.graph?.root).toBe('Engineering');
    expect(report.graph?.edges).toEqual([
      { from: 'p1', to: 'p0', kind: 'required', ordersBuild: true },
    ]);
    // The view also lists core's built-in REQUEST provider; the report
    // copies the view as it is.
    expect(
      report.graph?.providers
        .filter((p) => p.token !== 'REQUEST')
        .map((p) => [p.token, p.inline]),
    ).toEqual([
      ['ReactorCore', false],
      ['NavCharts', false],
    ]);
  });

  it('records createScope and extend runs only with scopes: true', async () => {
    const SCANNER = new Token<object>('Scanner');
    const Root = defineModule({
      name: 'Root',
      providers: [
        provide(SCANNER, { lifetime: 'scoped', useFactory: () => ({}) }),
      ],
    });
    for (const scopes of [false, true]) {
      const profiler = profile({ scopes });
      await using ship = await Nexus.create(Root, { plugins: [profiler] });
      await using shuttle = await ship.createScope();
      await shuttle.extend();
      expect(profiler.report().runs.map((r) => r.kind)).toEqual(
        scopes ? ['create', 'createScope', 'extend'] : ['create'],
      );
    }
  });

  it('lists the providers a hung create still awaits', async () => {
    const profiler = profile();
    void Nexus.create(
      [
        provide(NAV_CHARTS, {
          useFactory: () => new Promise<INavCharts>(() => undefined),
        }),
      ],
      { plugins: [profiler] },
    );
    await sleep(10);
    const [run] = profiler.report().runs;
    expect(run).toMatchObject({ ok: null, durationMs: null });
    expect(defined(run).pending).toMatchObject([
      { token: 'NavCharts', what: 'construct', level: 0 },
    ]);
  });

  it('attributes nested on-demand and transient builds to the run of their parent', async () => {
    const profiler = profile();
    class Gauge {}
    const LOG = new Token<object>('Log');
    // lazy() keeps Gauge on demand, built inside Console's constructor.
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
      { plugins: [profiler] },
    );
    void ship;
    const tokens = defined(profiler.report().runs[0]).builds.map(
      (b) => b.token,
    );
    expect(tokens).toEqual(expect.arrayContaining(['Gauge', 'Log', 'Console']));
  });

  it('counts an on-demand singleton built after an await as build work, not static', async () => {
    const profiler = profile();
    class Gauge {}
    const CHARTS = new Token<INavCharts>('NavCharts');
    await using ship = await Nexus.create(
      [
        provide(Gauge, { eager: false }),
        provide(CHARTS, {
          // After the await the construction stack is empty, so Gauge's
          // construct has a run but no level and no parent.
          useFactory: async (gauge: () => Gauge) => {
            await sleep(1);
            gauge();
            return { sectors: 3 };
          },
          deps: [lazy(Gauge)],
        }),
      ],
      { plugins: [profiler] },
    );
    void ship;
    const run = defined(profiler.report().runs[0]);
    expect(run.builds.find((b) => b.token === 'Gauge')).toMatchObject({
      level: null,
      parent: null,
      lifetime: 'singleton',
    });
    expect(run.steps.map((s) => s.step)).toEqual(['compile', 'build', 'setup']);
  });

  it('records no on-demand build after startup', async () => {
    const profiler = profile();
    class Gauge {}
    await using ship = await Nexus.create([provide(Gauge, { eager: false })], {
      plugins: [profiler],
    });
    ship.get(Gauge);
    expect(defined(profiler.report().runs[0]).builds).toEqual([]);
  });

  it('drops the oldest run past maxRuns', async () => {
    const profiler = profile({ maxRuns: 2 });
    await using ship = await Nexus.create(Engineering, { plugins: [profiler] });
    for (const name of ['A', 'B', 'C'])
      await ship.load(defineModule({ name, providers: [] }));
    const report = profiler.report();
    expect(report.runs.map((r) => r.id)).toEqual([2, 3]);
    expect(report.dropped).toBe(2);
  });

  it('keeps an unknown run kind and ignores an unknown event type', () => {
    const profiler = profile();
    const observe = defined(profiler.observe);
    observe({ type: 'acme/cache/miss', key: 'k' } as never);
    observe({
      type: 'run',
      run: 7,
      kind: 'warp',
      scope: null,
      ok: true,
      startMs: 1,
      durationMs: 2,
    } as never);
    expect(profiler.report().runs).toMatchObject([
      { id: 7, kind: 'warp', ok: true },
    ]);
  });

  it('throws NEXUS_DEVTOOLS_PROFILE_REUSED from report() after a second container, and never from create', async () => {
    const profiler = profile();
    await (
      await Nexus.create(Engineering, { plugins: [profiler] })
    )[Symbol.asyncDispose]();
    await (
      await Nexus.create(Engineering, { plugins: [profiler] })
    )[Symbol.asyncDispose]();
    const error = thrown(() => profiler.report());
    expect(isNexusError(error, 'NEXUS_DEVTOOLS_PROFILE_REUSED')).toBe(true);
  });

  it('detects two creates that run at once, before either run closed', async () => {
    const profiler = profile();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const Held = defineModule({
      name: 'Held',
      providers: [
        provide(NAV_CHARTS, {
          useFactory: async () => {
            await gate;
            return { sectors: 3 };
          },
        }),
      ],
    });
    // Both runs are open here: only the second compile of a create tells.
    const creates = [
      Nexus.create(Held, { plugins: [profiler] }),
      Nexus.create(Held, { plugins: [profiler] }),
    ];
    await sleep(1);
    expect(
      isNexusError(
        thrown(() => profiler.report()),
        'NEXUS_DEVTOOLS_PROFILE_REUSED',
      ),
    ).toBe(true);
    release();
    for (const ship of await Promise.all(creates))
      await ship[Symbol.asyncDispose]();
  });

  it('drops an onInit from pending once it settled, while the run is still open', async () => {
    const profiler = profile();
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    class Reactor {
      async onInit() {}
    }
    class Computer {
      async onInit() {
        await gate;
      }
    }
    const created = Nexus.create([Reactor, Computer], { plugins: [profiler] });
    await sleep(10);
    expect(
      defined(profiler.report().runs[0]).pending.map((p) => [p.token, p.what]),
    ).toEqual([['Computer', 'init']]);
    release();
    await (await created)[Symbol.asyncDispose]();
  });

  it('takes a run kind from its run event over the kind its builds implied', () => {
    const profiler = profile({ scopes: true });
    const observe = defined(profiler.observe);
    // A scoped build of a scope the profiler has not seen implies createScope.
    observe({
      type: 'construct',
      token: 'Scanner',
      providerId: 'p3',
      module: 'M',
      lifetime: 'scoped',
      scope: 's0',
      async: false,
      run: 4,
      level: 0,
      parent: null,
      startMs: 1,
      syncMs: 1,
      awaitMs: null,
      finishMs: 0,
      durationMs: 1,
    } as never);
    observe({
      type: 'run',
      run: 4,
      kind: 'fork',
      scope: 's0',
      ok: true,
      startMs: 0,
      durationMs: 3,
    } as never);
    expect(profiler.report().runs).toMatchObject([
      { id: 4, kind: 'fork', scope: 's0' },
    ]);
  });

  it('detects reuse after a create that failed before it compiled', async () => {
    const profiler = profile();
    await rejected(Nexus.create(42 as never, { plugins: [profiler] }));
    await (
      await Nexus.create(Engineering, { plugins: [profiler] })
    )[Symbol.asyncDispose]();
    expect(
      isNexusError(
        thrown(() => profiler.report()),
        'NEXUS_DEVTOOLS_PROFILE_REUSED',
      ),
    ).toBe(true);
  });

  it('ignores a build for a run that already closed, and does not call it reuse', () => {
    const profiler = profile();
    const observe = defined(profiler.observe);
    observe({
      type: 'run',
      run: 0,
      kind: 'create',
      scope: null,
      ok: false,
      startMs: 0,
      durationMs: 5,
    } as never);
    observe({
      type: 'construct',
      token: 'Late',
      providerId: 'p9',
      module: 'M',
      lifetime: 'singleton',
      scope: null,
      async: true,
      run: 0,
      level: 0,
      parent: null,
      startMs: 1,
      syncMs: 0,
      awaitMs: 6,
      finishMs: 0,
      durationMs: 6,
    } as never);
    expect(profiler.report().runs).toMatchObject([
      { id: 0, ok: false, builds: [] },
    ]);
  });

  it('records the disposal, and clear() drops every run', async () => {
    const profiler = profile();
    await (
      await Nexus.create(Engineering, { plugins: [profiler] })
    )[Symbol.asyncDispose]();
    expect(profiler.report().dispose).toMatchObject({ errors: 0 });
    profiler.clear();
    expect(profiler.report()).toMatchObject({
      runs: [],
      dropped: 0,
      dispose: null,
    });
  });
});

describe('profile live mode', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('draws the run with console.timeStamp once create settles on Chromium 134', async () => {
    vi.stubGlobal('navigator', {
      userAgentData: { brands: [{ brand: 'Chromium', version: '134' }] },
    });
    // Node's timeStamp records nothing, so the test stubs one.
    const stamp = vi.fn();
    vi.stubGlobal('console', { ...console, timeStamp: stamp });
    const profiler = profile({ live: liveSink() });
    await using ship = await Nexus.create(Engineering, { plugins: [profiler] });
    void ship;
    expect(stamp).toHaveBeenCalledWith(
      'create',
      expect.any(Number),
      expect.any(Number),
      'Runs',
      'NexusDI',
      'secondary-dark',
    );
  });
});

describe('profile graph', () => {
  it('builds the graph once per blueprint, across createScope runs', async () => {
    const SCANNER = new Token<object>('Scanner');
    const profiler = profile({ scopes: true });
    await using ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(SCANNER, { lifetime: 'scoped', useFactory: () => ({}) }),
        ],
      }),
      { plugins: [profiler] },
    );
    const before = profiler.report().graph;
    await using first = await ship.createScope();
    await using second = await ship.createScope();
    void first;
    void second;
    expect(profiler.report().graph).toBe(before);
    class Probe {}
    await ship.load(defineModule({ name: 'Science', providers: [Probe] }));
    const after = profiler.report().graph;
    expect(after).not.toBe(before);
    expect(after?.providers.map((p) => p.token)).toContain('Probe');
  });
});

describe('profile graph sharing', () => {
  it('freezes the shared graph, so one caller cannot change a later report', async () => {
    const profiler = profile();
    await using ship = await Nexus.create(Engineering, { plugins: [profiler] });
    void ship;
    const graph = defined(profiler.report().graph ?? undefined);
    const provider = defined(graph.providers[0]);
    const edge = defined(graph.edges[0]);
    // Test modules run in strict mode, where a write to a frozen object throws.
    expect(() => {
      (graph as { root: string }).root = 'Other';
    }).toThrow(TypeError);
    expect(() => {
      (provider as { token: string }).token = 'Other';
    }).toThrow(TypeError);
    expect(() => {
      (edge as { ordersBuild: boolean }).ordersBuild = false;
    }).toThrow(TypeError);
    expect(() => {
      (graph.providers as unknown[]).push({});
    }).toThrow(TypeError);
    expect(profiler.report().graph?.root).toBe('Engineering');
  });
});
