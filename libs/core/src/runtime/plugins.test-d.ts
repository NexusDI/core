import { describe, expectTypeOf, it } from 'vitest';

import type { AnyToken } from '../definitions/guards.js';
import type {
  BlueprintView,
  CompileContext,
  EdgeView,
  NexusPlugin,
  PluginContext,
  ProviderEntry,
  ProviderRewrite,
  ProviderView,
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

describe('written', () => {
  it('holds a token on a provider view and an edge view, and the edge has no token', () => {
    expectTypeOf<ProviderView['written']>().toEqualTypeOf<AnyToken>();
    expectTypeOf<EdgeView['written']>().toEqualTypeOf<AnyToken>();
    expectTypeOf<
      'token' extends keyof EdgeView ? true : false
    >().toEqualTypeOf<false>();
  });
});
