import { describe, expect, it } from 'vitest';

import { rejected } from '../../test-support/catch.js';
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
      disposalErrors: [],
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
