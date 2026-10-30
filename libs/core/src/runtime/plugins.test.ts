import { describe, expect, it, vi } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { reportMiss } from '../../test-support/third-party-trace.js';
import { defineModule } from '../definitions/define-module.js';
import { MissingDepsError } from '../errors/index.js';
import { Nexus } from './nexus.js';
import {
  NEXUS_PLUGIN_API,
  SUPPORTED_PLUGIN_APIS,
  registerPlugins,
  type NexusPlugin,
  type PluginContext,
} from './plugins.js';

const Root = defineModule({ name: 'Root' });
const plugin = <T extends object>(name: string, extra: T = {} as T) => ({
  name,
  apiVersion: 1,
  ...extra,
});

describe('registerPlugins', () => {
  it('lists every supported plugin API version in ascending order, frozen, with NEXUS_PLUGIN_API among them', () => {
    expect([...SUPPORTED_PLUGIN_APIS]).toEqual(
      [...SUPPORTED_PLUGIN_APIS].sort((a, b) => a - b),
    );
    expect(Object.isFrozen(SUPPORTED_PLUGIN_APIS)).toBe(true);
    expect(SUPPORTED_PLUGIN_APIS).toContain(NEXUS_PLUGIN_API);
  });

  it('accepts undefined and an empty array', () => {
    expect(registerPlugins(undefined).observe).toEqual([]);
    expect(registerPlugins([]).setup).toEqual([]);
  });

  it('reads each hook once, as an own property, in plugin order', () => {
    const inherited = Object.create({ observe: () => undefined }) as object;
    Object.assign(inherited, { name: 'inherited', apiVersion: 1 });
    const set = registerPlugins([
      plugin('a', { observe: () => undefined }),
      inherited,
      plugin('b', { observe: () => undefined }),
    ]);
    expect(set.observe.map((hook) => hook.plugin)).toEqual(['a', 'b']);
  });

  it('calls a hook with the plugin as this', () => {
    const owner = plugin('a', {
      seen: [] as unknown[],
      observe(this: { seen: unknown[] }, event: unknown) {
        this.seen.push(event);
      },
    });
    registerPlugins([owner]).observe[0]?.call({ type: 'x' } as never);
    expect(owner.seen).toEqual([{ type: 'x' }]);
  });

  it('reads a hook getter exactly once', () => {
    let reads = 0;
    const owner: Record<string, unknown> = { name: 'a', apiVersion: 1 };
    Object.defineProperty(owner, 'observe', {
      enumerable: true,
      get() {
        reads++;
        return () => undefined;
      },
    });
    registerPlugins([owner]);
    expect(reads).toBe(1);
  });

  it('collects a plugin module alongside its function hooks', () => {
    const Extra = defineModule({ name: 'Extra' });
    const set = registerPlugins([plugin('a', { modules: [Extra] })]);
    expect(set.modules).toEqual([Extra]);
  });
});

describe('Nexus.create', () => {
  it('rejects plugins that are not an array', async () => {
    const error = await rejected(
      Nexus.create(Root, { plugins: 'devtools' as never }),
    );
    expect(error).toMatchObject({
      code: 'NEXUS_BLUEPRINT_INVALID',
      errors: [
        {
          code: 'NEXUS_PLUGIN_INVALID',
          plugin: 'plugins',
          reason: 'not-an-array',
        },
      ],
    });
  });

  it('names a hole, undefined and a repeated plugin by index', async () => {
    const twice = plugin('twice');
    // eslint-disable-next-line no-sparse-arrays
    const plugins = [plugin('a'), , undefined, twice, twice] as never;
    const error = await rejected(Nexus.create(Root, { plugins }));
    expect(error).toMatchObject({
      errors: [
        { plugin: 'plugins[1]', reason: 'not-an-object' },
        { plugin: 'plugins[2]', reason: 'not-an-object' },
        { plugin: 'twice', reason: 'duplicate-name' },
      ],
    });
  });

  it('rejects a plugin without a name and a hook of the wrong type', async () => {
    const error = await rejected(
      Nexus.create(Root, {
        plugins: [
          { apiVersion: 1 },
          plugin('bad', { observe: 1, onInit: true, compile: 2 }),
        ] as never,
      }),
    );
    expect(error).toMatchObject({
      errors: [
        { plugin: 'plugins[0]', reason: 'no-name' },
        { plugin: 'bad', reason: 'bad-hook', detail: ['observe'] },
        { plugin: 'bad', reason: 'bad-on-init' },
        { plugin: 'bad', reason: 'bad-compile' },
      ],
    });
  });

  it('rejects a plugin whose compile is an array', async () => {
    const error = await rejected(
      Nexus.create(Root, {
        plugins: [plugin('bad', { compile: [] })] as never,
      }),
    );
    expect(error).toMatchObject({
      errors: [{ plugin: 'bad', reason: 'bad-compile' }],
    });
  });

  it('rejects a plugin whose modules is not an array', async () => {
    const error = await rejected(
      Nexus.create(Root, {
        plugins: [plugin('bad', { modules: Root })] as never,
      }),
    );
    expect(error).toMatchObject({
      errors: [{ plugin: 'bad', reason: 'bad-modules' }],
    });
  });

  it('rejects an apiVersion this core does not support', async () => {
    const error = await rejected(
      Nexus.create(Root, { plugins: [{ name: 'future', apiVersion: 2 }] }),
    );
    expect(error).toMatchObject({
      errors: [
        {
          code: 'NEXUS_PLUGIN_VERSION',
          plugin: 'future',
          apiVersion: '2',
          supported: [1],
        },
      ],
    });
  });

  it('names a non-number apiVersion the way the value reads', async () => {
    const fields: unknown[] = [];
    for (const apiVersion of [0, undefined, '1']) {
      const error = await rejected(
        Nexus.create(Root, {
          plugins: [{ name: 'odd', apiVersion }] as never,
        }),
      );
      fields.push(
        (error as unknown as { errors: { apiVersion: string }[] }).errors[0]
          .apiVersion,
      );
    }
    expect(fields).toEqual(['0', 'undefined', 'the string "1"']);
  });

  it('never calls a hook of a plugin it rejects for its version', async () => {
    const calls: string[] = [];
    const future = {
      name: 'future',
      apiVersion: 2,
      formatError: () => void calls.push('formatError'),
      setup: () => void calls.push('setup'),
      compile: { check: () => void calls.push('check') },
      observe: () => void calls.push('observe'),
    };
    const formatted: unknown[] = [];
    const formatter = plugin('formatter', {
      formatError: (error: unknown) => {
        formatted.push(error);
        return { message: 'Version refused.', fix: 'Update it.' };
      },
    });
    const error = await rejected(
      Nexus.create(Root, { plugins: [future, formatter] as never }),
    );
    expect(calls).toEqual([]);
    expect(formatted.length).toBeGreaterThan(0);
    expect((error as Error).message).toContain('Version refused.');
  });

  it('throws NEXUS_PLUGIN_VERSION from Nexus.check', () => {
    let thrown: unknown;
    try {
      Nexus.check(Root, { plugins: [{ name: 'future', apiVersion: 2 }] });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      code: 'NEXUS_BLUEPRINT_INVALID',
      errors: [{ code: 'NEXUS_PLUGIN_VERSION', plugin: 'future' }],
    });
  });

  it('builds nothing when a plugin is invalid', async () => {
    let built = 0;
    class Reactor {
      constructor() {
        built++;
      }
    }
    await rejected(
      Nexus.create(defineModule({ name: 'Root', providers: [Reactor] }), {
        plugins: [{ apiVersion: 1 }] as never,
      }),
    );
    expect(built).toBe(0);
  });
});

describe('PluginContext.format', () => {
  const missingDeps = (text?: string) =>
    new MissingDepsError(
      {
        token: 'WarpDrive',
        module: 'Engineering',
        arity: 2,
        useClass: null,
        bare: true,
      },
      text === undefined ? undefined : { text },
    );

  async function contextWith(
    ...after: readonly NexusPlugin[]
  ): Promise<PluginContext> {
    let context: PluginContext | undefined;
    await Nexus.create(Root, {
      plugins: [
        plugin('raiser', {
          setup: (c: PluginContext) => {
            context = c;
          },
        }),
        ...after,
      ],
    });
    if (context === undefined) throw new Error('setup did not run');
    return context;
  }

  const formatter = (calls: unknown[] = []): NexusPlugin =>
    plugin('formatter', {
      formatError: (error: unknown) => {
        calls.push(error);
        return { message: 'The warp drive needs deps.', fix: 'List them.' };
      },
    });

  it('returns the same error with the text of a formatError plugin registered after it', async () => {
    const context = await contextWith(formatter());
    const error = missingDeps();
    expect(context.format(error)).toBe(error);
    expect(error.message).toBe(
      '[NEXUS_MISSING_DEPS] The warp drive needs deps.\n  Fix: List them.',
    );
  });

  it('returns the error unchanged without a formatError hook', async () => {
    const context = await contextWith();
    const error = missingDeps();
    const line = error.message;
    expect(context.format(error)).toBe(error);
    expect(error.message).toBe(line);
    expect(line).not.toContain('\n');
  });

  it('keeps the text of an error built with its own text', async () => {
    const context = await contextWith(formatter());
    const error = missingDeps('Warp drive offline.');
    context.format(error);
    expect(error.message).toBe('[NEXUS_MISSING_DEPS] Warp drive offline.');
  });

  it('formats an error once', async () => {
    const calls: unknown[] = [];
    const context = await contextWith(formatter(calls));
    const error = missingDeps();
    context.format(context.format(error));
    expect(calls).toEqual([error]);
  });

  it('formats an error after the container is disposed', async () => {
    let context: PluginContext | undefined;
    const ship = await Nexus.create(Root, {
      plugins: [
        plugin('raiser', {
          setup: (c: PluginContext) => {
            context = c;
          },
        }),
        formatter(),
      ],
    });
    await ship[Symbol.asyncDispose]();
    const error = missingDeps();
    expect(context?.format(error)).toBe(error);
    expect(error.message).toBe(
      '[NEXUS_MISSING_DEPS] The warp drive needs deps.\n  Fix: List them.',
    );
  });

  it('returns a value that is not a NexusError as is', async () => {
    const context = await contextWith(formatter());
    const thrown = new Error('coolant leak');
    expect(context.format(thrown)).toBe(thrown);
    expect(thrown.message).toBe('coolant leak');
    expect(context.format('breach')).toBe('breach');
  });
});

describe('PluginContext.emit', () => {
  async function contextWith(
    ...after: readonly NexusPlugin[]
  ): Promise<PluginContext> {
    let context: PluginContext | undefined;
    await Nexus.create(Root, {
      plugins: [
        plugin('cache', {
          setup: (c: PluginContext) => {
            context = c;
          },
        }),
        ...after,
      ],
    });
    if (context === undefined) throw new Error('setup did not run');
    return context;
  }

  it('hands the event to every observe hook in plugin order', async () => {
    const seen: string[] = [];
    const record =
      (name: string) =>
      (event: { type: string; key?: string }): void => {
        if (event.type === '@acme/cache/miss')
          seen.push(`${name} ${event.key}`);
      };
    const context = await contextWith(
      plugin('first', { observe: record('first') }),
      plugin('second', { observe: record('second') }),
    );
    reportMiss(context, 'warp-core');
    expect(seen).toEqual(['first warp-core', 'second warp-core']);
  });

  it('never calls make without an observer', async () => {
    const context = await contextWith();
    const make = vi.fn(() => ({
      type: '@acme/cache/miss' as const,
      key: 'warp-core',
      durationMs: 0,
    }));
    context.emit(make);
    expect(make).not.toHaveBeenCalled();
  });

  it("throws an observer's exception to the caller of emit", async () => {
    const leak = new Error('coolant leak');
    const context = await contextWith(
      plugin('observer', {
        observe: (event: { type: string }) => {
          if (event.type === '@acme/cache/miss') throw leak;
        },
      }),
    );
    let thrown: unknown;
    try {
      reportMiss(context, 'warp-core');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBe(leak);
  });

  it('hands the event to every observe hook after the container is disposed', async () => {
    const seen: string[] = [];
    let context: PluginContext | undefined;
    const ship = await Nexus.create(Root, {
      plugins: [
        plugin('cache', {
          setup: (c: PluginContext) => {
            context = c;
          },
        }),
        plugin('observer', {
          observe: (event: { type: string; key?: string }) => {
            if (event.type === '@acme/cache/miss') seen.push(`${event.key}`);
          },
        }),
      ],
    });
    await ship[Symbol.asyncDispose]();
    if (context === undefined) throw new Error('setup did not run');
    reportMiss(context, 'warp-core');
    expect(seen).toEqual(['warp-core']);
  });
});
