import { describe, expect, it } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { frequencySchema } from '../../test-support/schema.js';
import type { BlueprintView } from '../blueprint/views.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import type { PluginContext } from './plugins.js';
import type { TraceEvent } from './trace.js';
import { Nexus } from './nexus.js';

interface IReactorCore {
  readonly output: number;
}
const REACTOR = new Token<IReactorCore>('ReactorCore');
const log: string[] = [];
class FusionReactor implements IReactorCore {
  readonly output = 1.21;
  onInit() {
    log.push(`init ${this.output}`);
  }
  [Symbol.dispose]() {
    log.push('scram');
  }
}
class Bridge {
  static deps = [REACTOR] as const;
  constructor(readonly reactor: IReactorCore) {}
}
const Root = defineModule({
  name: 'Root',
  providers: [provide(REACTOR, { useClass: FusionReactor }), Bridge],
  exports: [REACTOR, Bridge],
});

describe('construct', () => {
  it('replaces the instance for get, deps, onInit and disposal', async () => {
    log.length = 0;
    const wrapped = new WeakSet<object>();
    const ship = await Nexus.create(Root, {
      plugins: [
        {
          name: 'wrap',
          apiVersion: 1,
          construct: (instance, provider) => {
            if (provider.token !== REACTOR) return undefined;
            const proxy = new Proxy(instance as object, {});
            wrapped.add(proxy);
            return proxy;
          },
        },
      ],
    });
    expect(wrapped.has(ship.get(REACTOR) as object)).toBe(true);
    expect(ship.get(Bridge).reactor).toBe(ship.get(REACTOR));
    await ship[Symbol.asyncDispose]();
    expect(log).toEqual(['init 1.21', 'scram']);
  });

  it('chains plugins in order and skips value providers', async () => {
    const seen: string[] = [];
    await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [provide(REACTOR, { useValue: { output: 0 } }), Bridge],
      }),
      {
        plugins: [
          {
            name: 'a',
            apiVersion: 1,
            construct: (_, p) => void seen.push(`a ${p.name}`),
          },
          {
            name: 'b',
            apiVersion: 1,
            construct: (_, p) => void seen.push(`b ${p.name}`),
          },
        ],
      },
    );
    expect(seen).toEqual(['a Bridge', 'b Bridge']);
  });

  it('hands each plugin the previous plugin result', async () => {
    const ship = await Nexus.create(Root, {
      plugins: [
        {
          name: 'a',
          apiVersion: 1,
          construct: (instance, p) =>
            p.token === REACTOR ? { inner: instance, by: 'a' } : undefined,
        },
        {
          name: 'b',
          apiVersion: 1,
          construct: (instance, p) =>
            p.token === REACTOR ? { inner: instance, by: 'b' } : undefined,
        },
      ],
    });
    const outer = ship.get(REACTOR) as unknown as {
      by: string;
      inner: { by: string; inner: unknown };
    };
    expect(outer.by).toBe('b');
    expect(outer.inner.by).toBe('a');
    expect(outer.inner.inner).toBeInstanceOf(FusionReactor);
  });

  it('receives the awaited result of an async factory', async () => {
    const CHARTS = new Token<{ sector: number }>('Charts');
    const received: unknown[] = [];
    await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(CHARTS, { useFactory: async () => ({ sector: 7 }) }),
        ],
      }),
      {
        plugins: [
          {
            name: 'a',
            apiVersion: 1,
            construct: (instance) => void received.push(instance),
          },
        ],
      },
    );
    expect(received).toEqual([{ sector: 7 }]);
  });

  it('receives a with() factory result after the schema validated it', async () => {
    const OPTIONS = new Token<{ frequency: number; band?: string }>(
      'CommsOptions',
    );
    const Comms = defineModule({
      name: 'Comms',
      options: OPTIONS,
      schema: frequencySchema(),
    });
    const tuned = Comms.with({
      deps: [],
      useFactory: async () => ({ frequency: 1420 }),
    });
    const received: unknown[] = [];
    const ship = await Nexus.create(
      defineModule({ name: 'Root', imports: [tuned] }),
      {
        plugins: [
          {
            name: 'a',
            apiVersion: 1,
            construct: (instance) => {
              received.push(instance);
              return { ...(instance as object), wrapped: true };
            },
          },
        ],
      },
    );
    expect(received).toEqual([{ frequency: 1420, band: 'S' }]);
    expect(ship.get(OPTIONS, { module: tuned })).toEqual({
      frequency: 1420,
      band: 'S',
      wrapped: true,
    });
  });

  it('runs for scoped and transient builds with the scope id', async () => {
    const PROBE = new Token<object>('Probe');
    const LOG = new Token<object>('CaptainsLog');
    const SIGNAL = new Token<object>('Signal');
    const seen: string[] = [];
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(PROBE, { useClass: class {}, lifetime: 'transient' }),
          provide(LOG, { useClass: class {}, lifetime: 'scoped' }),
          provide(SIGNAL, { useFactory: () => ({}), lifetime: 'scoped' }),
        ],
        exports: [PROBE, LOG],
      }),
      {
        plugins: [
          {
            name: 'a',
            apiVersion: 1,
            construct: (_, p, scope) => void seen.push(`${p.name} ${scope}`),
          },
        ],
      },
    );
    ship.get(PROBE);
    await using scope = await ship.createScope();
    scope.get(LOG);
    scope.get(PROBE);
    expect(seen).toEqual([
      'Probe null',
      'Signal s0',
      'CaptainsLog s0',
      'Probe s0',
    ]);
  });

  it('fails the build when the hook throws or returns a thenable', async () => {
    for (const construct of [
      () => {
        throw new Error('no');
      },
      () => Promise.resolve(1),
    ]) {
      const error = await rejected(
        Nexus.create(Root, {
          plugins: [{ name: 'bad', apiVersion: 1, construct }],
        }),
      );
      expect(error).toMatchObject({
        code: 'NEXUS_PROVIDER_FAILED',
        cause: {
          code: 'NEXUS_PLUGIN_FAILED',
          plugin: 'bad',
          hook: 'construct',
        },
      });
    }
  });

  it('fails get() of a transient with a ProviderError', async () => {
    const PROBE = new Token<object>('Probe');
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(PROBE, { useClass: class {}, lifetime: 'transient' }),
        ],
        exports: [PROBE],
      }),
      {
        plugins: [
          {
            name: 'bad',
            apiVersion: 1,
            construct: () => {
              throw new Error('no');
            },
          },
        ],
      },
    );
    expect(() => ship.get(PROBE)).toThrow(
      expect.objectContaining({
        code: 'NEXUS_PROVIDER_FAILED',
        token: 'Probe',
        path: ['Probe'],
        cause: expect.objectContaining({
          code: 'NEXUS_PLUGIN_FAILED',
          plugin: 'bad',
          hook: 'construct',
        }),
      }),
    );
  });
});

describe('observe', () => {
  it('receives every event, in plugin order', async () => {
    const events: string[] = [];
    const ship = await Nexus.create(Root, {
      plugins: [
        {
          name: 'a',
          apiVersion: 1,
          observe: (e: TraceEvent) => void events.push(`a ${e.type}`),
        },
        {
          name: 'b',
          apiVersion: 1,
          observe: (e: TraceEvent) => void events.push(`b ${e.type}`),
        },
      ],
    });
    await ship[Symbol.asyncDispose]();
    expect(events.slice(0, 2)).toEqual(['a compile', 'b compile']);
    expect(events.at(-1)).toBe('b dispose');
  });

  it('runs after the trace option callback', async () => {
    const events: string[] = [];
    await Nexus.create(defineModule({ name: 'Root' }), {
      trace: (e) => void events.push(`trace ${e.type}`),
      plugins: [
        {
          name: 'a',
          apiVersion: 1,
          observe: (e: TraceEvent) => void events.push(`a ${e.type}`),
        },
      ],
    });
    expect(events).toEqual(['trace compile', 'a compile']);
  });
});

describe('setup', () => {
  it('runs once after onInit with a finished container', async () => {
    log.length = 0;
    const ship = await Nexus.create(Root, {
      plugins: [
        {
          name: 'tools',
          apiVersion: 1,
          setup: (context) => {
            log.push(`setup ${context.container.get(REACTOR).output}`);
            log.push(`view ${context.blueprint().modules[0]?.name}`);
          },
        },
      ],
    });
    expect(log).toEqual(['init 1.21', 'setup 1.21', 'view Root']);
    await ship[Symbol.asyncDispose]();
  });

  it('runs in plugin order', async () => {
    const order: string[] = [];
    await Nexus.create(Root, {
      plugins: [
        { name: 'a', apiVersion: 1, setup: () => void order.push('a') },
        { name: 'b', apiVersion: 1, setup: () => void order.push('b') },
      ],
    });
    expect(order).toEqual(['a', 'b']);
  });

  it('is not called when create fails, and a throw disposes what was built', async () => {
    log.length = 0;
    const error = await rejected(
      Nexus.create(Root, {
        plugins: [
          {
            name: 'tools',
            apiVersion: 1,
            setup: () => {
              throw new Error('no');
            },
          },
        ],
      }),
    );
    expect(error).toMatchObject({
      code: 'NEXUS_PLUGIN_FAILED',
      plugin: 'tools',
      hook: 'setup',
    });
    expect(log).toEqual(['init 1.21', 'scram']);
  });

  it('is not called when the root has an invalid provider', async () => {
    let ran = false;
    const error = await rejected(
      Nexus.create(defineModule({ name: 'Root', providers: [null as never] }), {
        plugins: [
          {
            name: 'tools',
            apiVersion: 1,
            setup: () => {
              ran = true;
            },
          },
        ],
      }),
    );
    expect(error).toMatchObject({ code: 'NEXUS_BLUEPRINT_INVALID' });
    expect(ran).toBe(false);
  });

  it('is not called when a build fails', async () => {
    let ran = false;
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            provide(REACTOR, {
              useFactory: () => {
                throw new Error('meltdown');
              },
            }),
          ],
        }),
        {
          plugins: [
            {
              name: 'tools',
              apiVersion: 1,
              setup: () => {
                ran = true;
              },
            },
          ],
        },
      ),
    );
    expect(error).toMatchObject({ code: 'NEXUS_PROVIDER_FAILED' });
    expect(ran).toBe(false);
  });

  it('closes the container it handed to setup when setup throws', async () => {
    let captured: Nexus | undefined;
    await rejected(
      Nexus.create(Root, {
        plugins: [
          {
            name: 'tools',
            apiVersion: 1,
            setup: (context) => {
              captured = context.container;
              throw new Error('no');
            },
          },
        ],
      }),
    );
    expect(() => captured?.get(REACTOR)).toThrow(
      expect.objectContaining({ code: 'NEXUS_DISPOSED' }),
    );
  });

  it('reads the last build of a factory through builtAsync', async () => {
    const CHARTS = new Token<string>('Charts');
    let async: (boolean | null)[] = [];
    await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(CHARTS, { useFactory: async () => 'sector-7' }),
          Bridge,
          provide(REACTOR, { useClass: FusionReactor }),
        ],
      }),
      {
        plugins: [
          {
            name: 'tools',
            apiVersion: 1,
            setup: (context) => {
              async = context
                .blueprint()
                .providers.filter((p) => p.id !== 'request')
                .map((p) => context.builtAsync(p.id));
            },
          },
        ],
      },
    );
    expect(async).toEqual([true, null, null]);
  });
});

describe('PluginContext.blueprint', () => {
  const Science = defineModule({
    name: 'Science',
    providers: [provide(new Token<string>('Sensors'), { useValue: 'on' })],
  });

  async function shipWithContext(): Promise<{
    ship: Nexus;
    context: PluginContext;
  }> {
    let context: PluginContext | undefined;
    const ship = await Nexus.create(Root, {
      plugins: [
        {
          name: 'tools',
          apiVersion: 1,
          setup: (c) => {
            context = c;
          },
        },
      ],
    });
    if (context === undefined) throw new Error('setup did not run');
    return { ship, context };
  }

  it('returns the same object across calls', async () => {
    const { context } = await shipWithContext();
    expect(context.blueprint()).toBe(context.blueprint());
  });

  it('returns the same object after a no-op load()', async () => {
    const { ship, context } = await shipWithContext();
    await ship.load(Science);
    const before: BlueprintView = context.blueprint();
    await ship.load(Science);
    expect(context.blueprint()).toBe(before);
  });

  it('returns the same object after a failed load()', async () => {
    const { ship, context } = await shipWithContext();
    const before = context.blueprint();
    await rejected(
      ship.load(defineModule({ name: 'Broken', providers: [null as never] })),
    );
    expect(context.blueprint()).toBe(before);
  });

  it('returns a new object after a load() that changes the graph', async () => {
    const { ship, context } = await shipWithContext();
    const before = context.blueprint();
    await ship.load(Science);
    const after = context.blueprint();
    expect(after).not.toBe(before);
    expect(after.modules.map((m) => m.name)).toContain('Science');
  });
});

describe('dispose', () => {
  it('runs after the instances, in reverse plugin order, and chains throws', async () => {
    log.length = 0;
    const ship = await Nexus.create(Root, {
      plugins: [
        {
          name: 'a',
          apiVersion: 1,
          dispose: () => {
            log.push('a');
          },
        },
        {
          name: 'b',
          apiVersion: 1,
          dispose: () => {
            log.push('b');
            throw new Error('b failed');
          },
        },
      ],
    });
    const error = await rejected(ship[Symbol.asyncDispose]());
    expect(log).toEqual(['init 1.21', 'scram', 'b', 'a']);
    expect(error).toMatchObject({ message: 'b failed' });
  });

  it('awaits a returned promise before the next plugin', async () => {
    log.length = 0;
    const ship = await Nexus.create(defineModule({ name: 'Root' }), {
      plugins: [
        { name: 'a', apiVersion: 1, dispose: () => void log.push('a') },
        {
          name: 'b',
          apiVersion: 1,
          dispose: async () => {
            await Promise.resolve();
            log.push('b flushed');
          },
        },
      ],
    });
    await ship[Symbol.asyncDispose]();
    expect(log).toEqual(['b flushed', 'a']);
  });
});

describe('onInit', () => {
  it('skips onInit when a plugin sets it to false', async () => {
    log.length = 0;
    await Nexus.create(Root, {
      plugins: [{ name: 'quiet', apiVersion: 1, onInit: false }],
    });
    expect(log).toEqual([]);
  });
});

describe('modules', () => {
  it('adds root imports that survive a load()', async () => {
    const TRACER = new Token<string>('Tracer');
    const Telemetry = defineModule({
      name: 'Telemetry',
      providers: [provide(TRACER, { useValue: 'otel' })],
      exports: [TRACER],
    });
    const ship = await Nexus.create(defineModule({ name: 'Root' }), {
      plugins: [{ name: 'otel', apiVersion: 1, modules: [Telemetry] }],
    });
    await ship.load(defineModule({ name: 'Science' }));
    expect(ship.get(TRACER)).toBe('otel');
  });

  it('appends to the root imports, plugin by plugin', async () => {
    const Own = defineModule({ name: 'Own' });
    const Sensors = defineModule({ name: 'Sensors' });
    const Comms = defineModule({ name: 'Comms' });
    const Shields = defineModule({ name: 'Shields' });
    let view: BlueprintView | undefined;
    await Nexus.create(defineModule({ name: 'Root', imports: [Own] }), {
      plugins: [
        { name: 'a', apiVersion: 1, modules: [Sensors, Comms] },
        {
          name: 'b',
          apiVersion: 1,
          modules: [Shields],
          setup: (context) => {
            view = context.blueprint();
          },
        },
      ],
    });
    const byId = new Map(view?.modules.map((m) => [m.id, m.name]));
    const root = view?.modules.find((m) => m.id === view?.root);
    expect(root?.imports.map((id) => byId.get(id))).toEqual([
      'Own',
      'Sensors',
      'Comms',
      'Shields',
    ]);
  });
});
