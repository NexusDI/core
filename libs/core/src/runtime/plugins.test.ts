import { describe, expect, it } from 'vitest';

import { rejected } from '../../test-support/catch.js';
import { defineModule } from '../definitions/define-module.js';
import { Nexus } from './nexus.js';
import { registerPlugins } from './plugins.js';

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
