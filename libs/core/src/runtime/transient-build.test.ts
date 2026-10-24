import { describe, expect, it } from 'vitest';

import { recordEvents } from '../../test-support/observe.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from './nexus.js';
import type { NexusPlugin, PluginContext } from './plugins.js';
import type { TraceEvent } from './trace.js';

/**
 * A transient build takes one of two paths: the plain one when no plugin
 * has a construct or observe hook, and the hooked one otherwise. These
 * tests pin what each path does, so both keep the same results.
 */

interface IProbe {
  readonly serial: number;
}
const PROBE = new Token<IProbe>('Probe');

function spin(ms: number): void {
  const end = performance.now() + ms;
  while (performance.now() < end);
}

function probeModule(providers: readonly unknown[]) {
  return defineModule({
    name: 'Bay',
    providers: providers as never,
    exports: [PROBE],
  });
}

const setupOnly: NexusPlugin = { name: 'test:setup', apiVersion: 1 };

describe('transient builds without build hooks', () => {
  for (const [label, plugins] of [
    ['no plugin', []],
    ['a plugin with no build hook', [setupOnly]],
  ] as const) {
    it(`builds a fresh instance on every get() with ${label}`, async () => {
      let serial = 0;
      class Probe implements IProbe {
        readonly serial = ++serial;
      }
      await using ship = await Nexus.create(
        probeModule([
          provide(PROBE, { useClass: Probe, lifetime: 'transient' }),
        ]),
        { plugins },
      );
      const a = ship.get(PROBE);
      const b = ship.get(PROBE);
      expect(a).toBeInstanceOf(Probe);
      expect([a.serial, b.serial]).toEqual([1, 2]);
    });
  }

  it('disposes a scope transient with its scope', async () => {
    const log: string[] = [];
    class Probe implements IProbe {
      readonly serial = 1;
      [Symbol.dispose]() {
        log.push('probe disposed');
      }
    }
    await using ship = await Nexus.create(
      probeModule([provide(PROBE, { useClass: Probe, lifetime: 'transient' })]),
    );
    const scope = await ship.createScope();
    scope.get(PROBE);
    await scope[Symbol.asyncDispose]();
    expect(log).toEqual(['probe disposed']);
  });
});

describe('transient builds with build hooks', () => {
  it('emits one construct event per get() with the transient shape', async () => {
    const { events, plugin } = recordEvents();
    class Probe implements IProbe {
      readonly serial = 1;
      constructor() {
        spin(2);
      }
    }
    await using ship = await Nexus.create(
      probeModule([provide(PROBE, { useClass: Probe, lifetime: 'transient' })]),
      { plugins: [plugin] },
    );
    events.length = 0;
    ship.get(PROBE);
    ship.get(PROBE);
    const built = events.filter(
      (e): e is Extract<TraceEvent, { type: 'construct' }> =>
        e.type === 'construct',
    );
    expect(built).toHaveLength(2);
    for (const event of built) {
      expect(event).toMatchObject({
        token: 'Probe',
        lifetime: 'transient',
        scope: null,
        async: false,
        run: null,
        level: null,
        parent: null,
        awaitMs: null,
      });
      expect(event.syncMs).toBeGreaterThanOrEqual(1.5);
      expect(event.finishMs).toBeGreaterThanOrEqual(0);
      expect(event.durationMs).toBeCloseTo(event.syncMs + event.finishMs, 9);
    }
  });

  it('reports the scope id for a transient a scope builds', async () => {
    const { events, plugin } = recordEvents();
    await using ship = await Nexus.create(
      probeModule([
        provide(PROBE, {
          useFactory: () => ({ serial: 1 }),
          lifetime: 'transient',
        }),
      ]),
      { plugins: [plugin] },
    );
    await using scope = await ship.createScope();
    events.length = 0;
    scope.get(PROBE);
    expect(events.filter((e) => e.type === 'construct')).toMatchObject([
      { token: 'Probe', scope: 's0', run: null, level: null, parent: null },
    ]);
  });

  it('reports the singleton as parent of a transient it depends on during create', async () => {
    const { events, plugin } = recordEvents();
    interface IConsole {
      readonly probe: IProbe;
    }
    const CONSOLE = new Token<IConsole>('Console');
    class Console implements IConsole {
      static deps = [PROBE] as const;
      constructor(readonly probe: IProbe) {}
    }
    await using ship = await Nexus.create(
      [
        provide(PROBE, {
          useFactory: () => ({ serial: 1 }),
          lifetime: 'transient',
        }),
        provide(CONSOLE, { useClass: Console }),
      ],
      { plugins: [plugin] },
    );
    void ship;
    const built = events.filter(
      (e): e is Extract<TraceEvent, { type: 'construct' }> =>
        e.type === 'construct',
    );
    const console = built.find((e) => e.token === 'Console');
    expect(console).toBeDefined();
    expect(built.find((e) => e.token === 'Probe')).toMatchObject({
      scope: null,
      run: null,
      level: null,
      parent: console?.providerId,
    });
  });

  it('runs the constructor, the construct hooks in plugin order, the untracked report and the construct event in that order', async () => {
    const log: string[] = [];
    class Probe implements IProbe {
      readonly serial = 1;
      constructor() {
        log.push('constructor');
      }
      [Symbol.dispose]() {}
    }
    const wrap = (name: string): NexusPlugin => ({
      name,
      apiVersion: 1,
      construct: (instance) => {
        log.push(`construct ${name}`);
        return { inner: instance, by: name, [Symbol.dispose]() {} };
      },
    });
    const watcher: NexusPlugin = {
      name: 'test:watcher',
      apiVersion: 1,
      observe: (event) => {
        if (event.type === 'construct' || event.type === 'untracked')
          log.push(event.type);
      },
    };
    await using ship = await Nexus.create(
      probeModule([provide(PROBE, { useClass: Probe, lifetime: 'transient' })]),
      { plugins: [wrap('a'), wrap('b'), watcher] },
    );
    log.length = 0;
    const got = ship.get(PROBE) as unknown as {
      inner: { inner: unknown; by: string };
      by: string;
    };
    expect(got.by).toBe('b');
    expect(got.inner.by).toBe('a');
    expect(got.inner.inner).toBeInstanceOf(Probe);
    expect(log).toEqual([
      'constructor',
      'construct a',
      'construct b',
      'untracked',
      'construct',
    ]);
  });

  it('gives a scope the hook result to dispose', async () => {
    const log: string[] = [];
    class Probe implements IProbe {
      readonly serial = 1;
      [Symbol.dispose]() {
        log.push('probe disposed');
      }
    }
    await using ship = await Nexus.create(
      probeModule([provide(PROBE, { useClass: Probe, lifetime: 'transient' })]),
      {
        plugins: [
          {
            name: 'test:wrap',
            apiVersion: 1,
            construct: () => ({
              [Symbol.dispose]() {
                log.push('wrapper disposed');
              },
            }),
          },
        ],
      },
    );
    const scope = await ship.createScope();
    scope.get(PROBE);
    await scope[Symbol.asyncDispose]();
    expect(log).toEqual(['wrapper disposed']);
  });

  it('emits no build event when a transient throws outside a run', async () => {
    const { events, plugin } = recordEvents();
    await using ship = await Nexus.create(
      probeModule([
        provide(PROBE, {
          lifetime: 'transient',
          useFactory: (): IProbe => {
            throw new Error('short');
          },
        }),
      ]),
      { plugins: [plugin] },
    );
    events.length = 0;
    expect(() => ship.get(PROBE)).toThrow(
      expect.objectContaining({ code: 'NEXUS_PROVIDER_FAILED' }),
    );
    expect(events).toEqual([]);
  });
});

describe('transient build failures, with and without build hooks', () => {
  const recorder = recordEvents();
  const hookSets: readonly (readonly [string, NexusPlugin[]])[] = [
    ['no plugin', []],
    ['an observer', [recorder.plugin]],
    [
      'a construct hook',
      [{ name: 'test:noop', apiVersion: 1, construct: () => undefined }],
    ],
  ];

  for (const [label, plugins] of hookSets) {
    it(`raises the same ProviderError for a throwing constructor with ${label}`, async () => {
      const cause = new Error('short');
      class Probe implements IProbe {
        readonly serial = 1;
        constructor() {
          throw cause;
        }
      }
      await using ship = await Nexus.create(
        probeModule([
          provide(PROBE, { useClass: Probe, lifetime: 'transient' }),
        ]),
        { plugins },
      );
      expect(() => ship.get(PROBE)).toThrow(
        expect.objectContaining({
          code: 'NEXUS_PROVIDER_FAILED',
          token: 'Probe',
          path: ['Probe'],
          cause,
        }),
      );
    });

    // Vitest fails the run on an unhandled rejection, so the rejecting
    // factory checks that get() observes the promise it cannot await.
    for (const [kind, factory] of [
      ['resolves', () => Promise.resolve({ serial: 1 })],
      ['rejects', () => Promise.reject(new Error('x'))],
    ] as const) {
      it(`raises NEXUS_ASYNC_TRANSIENT for a factory whose promise ${kind} with ${label}`, async () => {
        let hooked = 0;
        let context: PluginContext | undefined;
        const counted: NexusPlugin[] = plugins.map((p) =>
          p.construct
            ? {
                ...p,
                construct: () => {
                  hooked++;
                  return undefined;
                },
              }
            : p,
        );
        counted.push({
          name: 'test:context',
          apiVersion: 1,
          setup: (c) => {
            context = c;
          },
        });
        await using ship = await Nexus.create(
          probeModule([
            provide(PROBE, {
              lifetime: 'transient',
              useFactory: factory as never,
            }),
          ]),
          { plugins: counted },
        );
        recorder.events.length = 0;
        expect(context?.builtAsync('p0')).toBe(false);
        expect(() => ship.get(PROBE)).toThrow(
          expect.objectContaining({
            code: 'NEXUS_ASYNC_TRANSIENT',
            token: 'Probe',
            module: 'Bay',
          }),
        );
        expect(context?.builtAsync('p0')).toBe(true);
        expect(hooked).toBe(0);
        expect(recorder.events.map((e) => e.type)).not.toContain('construct');
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }
});
