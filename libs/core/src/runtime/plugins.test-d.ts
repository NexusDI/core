import { describe, expectTypeOf, it } from 'vitest';

import type { AnyToken } from '../definitions/guards.js';
import type {
  BlueprintView,
  CompileContext,
  NexusPlugin,
  PluginContext,
  ProviderEntry,
  ProviderRewrite,
} from '../index.js';

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

describe('ProviderRewrite', () => {
  it('takes a string label on the with form and rejects any other', () => {
    expectTypeOf<{
      with: ProviderEntry;
      label: string;
    }>().toExtend<ProviderRewrite>();
    expectTypeOf<{
      with: ProviderEntry;
      label: number;
    }>().not.toExtend<ProviderRewrite>();
  });
});

describe('canonical', () => {
  it('maps a token to a token on a compile context and a view', () => {
    expectTypeOf<CompileContext['canonical']>().toEqualTypeOf<
      (token: AnyToken) => AnyToken
    >();
    expectTypeOf<BlueprintView['canonical']>().toEqualTypeOf<
      (token: AnyToken) => AnyToken
    >();
  });
});
