import { describe, expectTypeOf, it } from 'vitest';

import type { NexusPlugin, PluginContext } from '../index.js';

describe('NexusPlugin', () => {
  it('accepts a synchronous or an async setup', () => {
    const sync: NexusPlugin = { name: 'a', apiVersion: 1, setup: () => {} };
    const async: NexusPlugin = {
      name: 'b',
      apiVersion: 1,
      setup: async () => {},
    };
    expectTypeOf(sync).toEqualTypeOf<NexusPlugin>();
    expectTypeOf(async).toEqualTypeOf<NexusPlugin>();
    expectTypeOf<
      ReturnType<NonNullable<NexusPlugin['setup']>>
    >().toEqualTypeOf<void | PromiseLike<void>>();
    expectTypeOf<Parameters<NonNullable<NexusPlugin['setup']>>>().toEqualTypeOf<
      [PluginContext]
    >();
  });
});
