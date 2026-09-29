import { describe, expect, it } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { deferred, flush } from '../../test-support/deferred.js';
import { observer } from '../../test-support/observe.js';
import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import type { NexusPlugin, PluginContext } from './plugins.js';
import { Nexus } from './nexus.js';

interface ISystem {
  readonly name: string;
}

/** A class whose instances log their disposal, and throw from it when asked. */
function system(name: string, log: string[], disposerFails = false) {
  return class implements ISystem {
    readonly name = name;
    constructor(..._deps: unknown[]) {}
    [Symbol.asyncDispose](): Promise<void> {
      log.push(`${name} disposed`);
      if (disposerFails) throw new Error(`${name} disposer failed`);
      return Promise.resolve();
    }
  };
}

const HULL = new Token<ISystem>('Hull');
const SENSORS = new Token<ISystem>('Sensors');

describe('PluginContext.builtAsync', () => {
  async function contextOf(
    providers: readonly unknown[],
  ): Promise<{ ship: Nexus; context: PluginContext }> {
    let context: PluginContext | undefined;
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: providers as never,
        exports: [SENSORS],
      }),
      {
        plugins: [
          {
            name: 'tools',
            apiVersion: 1,
            setup: (c) => {
              context = c;
            },
          },
        ],
      },
    );
    if (context === undefined) throw new Error('setup did not run');
    return { ship, context };
  }

  it('reports false for a transient factory before and after a synchronous get()', async () => {
    const { ship, context } = await contextOf([
      provide(SENSORS, {
        useFactory: () => ({ name: 'Sensors' }),
        lifetime: 'transient',
      }),
    ]);
    expect(context.builtAsync('p0')).toBe(false);
    ship.get(SENSORS);
    expect(context.builtAsync('p0')).toBe(false);
  });

  it('reports true after a transient factory returned a thenable', async () => {
    const { ship, context } = await contextOf([
      provide(SENSORS, {
        useFactory: (() => Promise.resolve({ name: 'Sensors' })) as never,
        lifetime: 'transient',
      }),
    ]);
    expect(() => ship.get(SENSORS)).toThrow(
      expect.objectContaining({ code: 'NEXUS_ASYNC_TRANSIENT' }),
    );
    expect(context.builtAsync('p0')).toBe(true);
  });

  it('reports true on the root after a scope get() found a thenable', async () => {
    const { ship, context } = await contextOf([
      provide(SENSORS, {
        useFactory: (() => Promise.resolve({ name: 'Sensors' })) as never,
        lifetime: 'transient',
      }),
    ]);
    await using scope = await ship.createScope();
    expect(() => scope.get(SENSORS)).toThrow(
      expect.objectContaining({ code: 'NEXUS_ASYNC_TRANSIENT' }),
    );
    expect(context.builtAsync('p0')).toBe(true);
  });
});

describe('setup', () => {
  /** A plugin that logs its setup and dispose, and fails its setup when asked. */
  function plugin(
    name: string,
    log: string[],
    hooks: { setup?: 'ok' | 'throws'; dispose?: 'ok' | 'throws' },
  ): NexusPlugin {
    return {
      name,
      apiVersion: 1,
      ...(hooks.setup === undefined
        ? {}
        : {
            setup: () => {
              log.push(`setup ${name}`);
              if (hooks.setup === 'throws') throw new Error(`${name} failed`);
            },
          }),
      ...(hooks.dispose === undefined
        ? {}
        : {
            dispose: () => {
              log.push(`dispose ${name}`);
              if (hooks.dispose === 'throws')
                throw new Error(`${name} dispose failed`);
            },
          }),
    };
  }
  const Empty = defineModule({ name: 'Root' });

  it('runs dispose only for the plugins before the one whose setup failed', async () => {
    const log: string[] = [];
    const error = await rejected(
      Nexus.create(Empty, {
        plugins: [
          plugin('A', log, { setup: 'ok', dispose: 'ok' }),
          plugin('B', log, { setup: 'throws', dispose: 'ok' }),
          plugin('C', log, { setup: 'ok', dispose: 'ok' }),
        ],
      }),
    );
    expect(error).toMatchObject({
      code: 'NEXUS_PLUGIN_FAILED',
      plugin: 'B',
      hook: 'setup',
      cause: { message: 'B failed' },
    });
    expect(log).toEqual(['setup A', 'setup B', 'dispose A']);
  });

  it('includes plugins with no setup hook, in reverse order', async () => {
    const log: string[] = [];
    await rejected(
      Nexus.create(Empty, {
        plugins: [
          plugin('X', log, { dispose: 'ok' }),
          plugin('A', log, { setup: 'ok', dispose: 'ok' }),
          plugin('B', log, { setup: 'throws' }),
        ],
      }),
    );
    expect(log).toEqual(['setup A', 'setup B', 'dispose A', 'dispose X']);
  });

  it('disposes every instance before the plugins, with no dispose event', async () => {
    const log: string[] = [];
    await rejected(
      Nexus.create(
        defineModule({
          name: 'Root',
          providers: [provide(HULL, { useClass: system('Hull', log) })],
        }),
        {
          plugins: [
            observer((e) => {
              if (e.type === 'dispose:instance') log.push(`event ${e.token}`);
              if (e.type === 'dispose') log.push('event dispose');
            }),
            plugin('A', log, { setup: 'ok', dispose: 'ok' }),
            plugin('B', log, { setup: 'throws' }),
          ],
        },
      ),
    );
    expect(log).toEqual([
      'setup A',
      'setup B',
      'Hull disposed',
      'event Hull',
      'dispose A',
    ]);
  });

  it('disposes in reverse creation order and lists disposer errors before plugin dispose errors', async () => {
    const log: string[] = [];
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            provide(HULL, { useClass: system('Hull', log, true) }),
            provide(SENSORS, {
              useClass: system('Sensors', log),
              deps: [HULL],
            }),
          ],
        }),
        {
          plugins: [
            plugin('A', log, { setup: 'ok', dispose: 'throws' }),
            plugin('B', log, { setup: 'throws' }),
          ],
        },
      ),
    );
    expect(log).toEqual([
      'setup A',
      'setup B',
      'Sensors disposed',
      'Hull disposed',
      'dispose A',
    ]);
    expect(error).toMatchObject({
      disposalErrors: [
        expect.objectContaining({ message: 'Hull disposer failed' }),
        expect.objectContaining({ message: 'A dispose failed' }),
      ],
    });
  });

  it('rejects only after a plugin dispose promise settles', async () => {
    const flushed = deferred();
    let settled = false;
    const creating = Nexus.create(Empty, {
      plugins: [
        {
          name: 'A',
          apiVersion: 1,
          setup: () => undefined,
          dispose: () => flushed.promise,
        },
        {
          name: 'B',
          apiVersion: 1,
          setup: () => {
            throw new Error('B failed');
          },
        },
      ],
    }).catch((error: unknown) => {
      settled = true;
      return error;
    });
    await flush();
    expect(settled).toBe(false);
    flushed.resolve();
    expect(await creating).toMatchObject({ plugin: 'B', hook: 'setup' });
  });

  it('never runs dispose again for a container a plugin kept', async () => {
    const log: string[] = [];
    let kept: Nexus | undefined;
    await rejected(
      Nexus.create(Empty, {
        plugins: [
          {
            name: 'A',
            apiVersion: 1,
            setup: (context) => {
              kept = context.container;
            },
            dispose: () => void log.push('dispose A'),
          },
          plugin('B', log, { setup: 'throws' }),
        ],
      }),
    );
    await kept?.[Symbol.asyncDispose]();
    expect(log).toEqual(['setup B', 'dispose A']);
  });

  it('runs no plugin dispose when a build fails', async () => {
    const log: string[] = [];
    await rejected(
      Nexus.create(
        defineModule({
          name: 'Root',
          providers: [
            provide(HULL, {
              useFactory: () => {
                throw new Error('breach');
              },
            }),
          ],
        }),
        { plugins: [plugin('A', log, { setup: 'ok', dispose: 'ok' })] },
      ),
    );
    expect(log).toEqual([]);
  });

  it('runs no plugin dispose when the first plugin setup fails', async () => {
    const log: string[] = [];
    await rejected(
      Nexus.create(Empty, {
        plugins: [
          plugin('A', log, { setup: 'throws', dispose: 'ok' }),
          plugin('B', log, { dispose: 'ok' }),
        ],
      }),
    );
    expect(log).toEqual(['setup A']);
  });

  it('awaits an async setup before the next plugin setup', async () => {
    const log: string[] = [];
    const warmup = deferred();
    let done = false;
    const creating = Nexus.create(Empty, {
      plugins: [
        {
          name: 'A',
          apiVersion: 1,
          setup: async () => {
            await warmup.promise;
            log.push('A ready');
          },
        },
        { name: 'B', apiVersion: 1, setup: () => void log.push('B') },
      ],
    }).then((ship) => {
      done = true;
      return ship;
    });
    await flush();
    expect(log).toEqual([]);
    expect(done).toBe(false);
    warmup.resolve();
    await creating;
    expect(log).toEqual(['A ready', 'B']);
  });

  it('treats a rejected setup as a setup failure', async () => {
    const log: string[] = [];
    const reason = new Error('exporter unreachable');
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Root',
          providers: [provide(HULL, { useClass: system('Hull', log) })],
        }),
        {
          plugins: [
            { name: 'A', apiVersion: 1, setup: () => Promise.reject(reason) },
          ],
        },
      ),
    );
    expect(error).toMatchObject({
      code: 'NEXUS_PLUGIN_FAILED',
      plugin: 'A',
      hook: 'setup',
    });
    expect((error as { cause: unknown }).cause).toBe(reason);
    expect(log).toEqual(['Hull disposed']);
  });

  it('awaits a custom thenable', async () => {
    const log: string[] = [];
    await Nexus.create(Empty, {
      plugins: [
        {
          name: 'A',
          apiVersion: 1,
          setup: () =>
            ({
              then(resolve: () => void) {
                log.push('A then');
                resolve();
              },
            }) as unknown as PromiseLike<void>,
        },
        { name: 'B', apiVersion: 1, setup: () => void log.push('B') },
      ],
    });
    expect(log).toEqual(['A then', 'B']);
  });

  it('makes a disposal that starts during setup wait for the running setup', async () => {
    const log: string[] = [];
    const bRunning = deferred();
    const bRelease = deferred();
    let kept: Nexus | undefined;
    const creating = Nexus.create(
      defineModule({
        name: 'Root',
        providers: [provide(HULL, { useClass: system('Hull', log) })],
      }),
      {
        plugins: [
          {
            name: 'A',
            apiVersion: 1,
            setup: (context) => {
              kept = context.container;
            },
            dispose: () => void log.push('dispose A'),
          },
          {
            name: 'B',
            apiVersion: 1,
            setup: async () => {
              bRunning.resolve();
              await bRelease.promise;
              log.push('B settled');
            },
            dispose: () => void log.push('dispose B'),
          },
          plugin('C', log, { setup: 'ok', dispose: 'ok' }),
        ],
      },
    );
    await bRunning.promise;
    const disposal = kept?.[Symbol.asyncDispose]();
    await flush();
    expect(log).toEqual([]);
    bRelease.resolve();
    expect(await rejected(creating)).toMatchObject({ code: 'NEXUS_DISPOSED' });
    await disposal;
    expect(log).toEqual([
      'B settled',
      'Hull disposed',
      'dispose B',
      'dispose A',
    ]);
  });

  it('stops at a synchronous setup that disposes its container', async () => {
    const log: string[] = [];
    let disposal: Promise<void> | undefined;
    const creating = Nexus.create(Empty, {
      plugins: [
        {
          name: 'A',
          apiVersion: 1,
          setup: (context) => {
            disposal = context.container[Symbol.asyncDispose]();
          },
          dispose: () => void log.push('dispose A'),
        },
        plugin('B', log, { setup: 'ok', dispose: 'ok' }),
      ],
    });
    expect(await rejected(creating)).toMatchObject({ code: 'NEXUS_DISPOSED' });
    await disposal;
    expect(log).toEqual(['dispose A']);
  });

  it('releases once when a setup throws after it started disposal', async () => {
    const log: string[] = [];
    let disposal: Promise<void> | undefined;
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Root',
          providers: [provide(HULL, { useClass: system('Hull', log) })],
        }),
        {
          plugins: [
            {
              name: 'A',
              apiVersion: 1,
              setup: (context) => {
                disposal = context.container[Symbol.asyncDispose]();
                throw new Error('A failed');
              },
              dispose: () => void log.push('dispose A'),
            },
          ],
        },
      ),
    );
    await disposal;
    expect(error).toMatchObject({
      code: 'NEXUS_PLUGIN_FAILED',
      plugin: 'A',
      hook: 'setup',
      disposalErrors: [],
    });
    expect(log).toEqual(['Hull disposed']);
  });
});
