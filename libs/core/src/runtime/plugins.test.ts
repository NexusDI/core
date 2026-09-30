import { describe, expect, it } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { defineModule } from '../definitions/define-module.js';
import { MissingDepsError } from '../errors/index.js';
import { Nexus } from './nexus.js';
import {
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

  it('returns a value that is not a NexusError as is', async () => {
    const context = await contextWith(formatter());
    const thrown = new Error('coolant leak');
    expect(context.format(thrown)).toBe(thrown);
    expect(thrown.message).toBe('coolant leak');
    expect(context.format('breach')).toBe('breach');
  });
});
