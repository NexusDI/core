import { Token, type ProviderView } from '@nexusdi/core';
import { describe, expect, it, vi } from 'vitest';

import { bindingsFor, chainFor } from './chain.js';
import type { Declarations } from './metadata.js';
import type { NormalBinding, NormalGlobal } from './options.js';
import type { Interceptor } from './types.js';

const G = new Token<Interceptor>('G');
const B = new Token<Interceptor>('B');
const C = new Token<Interceptor>('C');
const M = new Token<Interceptor>('M');
const PAYMENTS = new Token<unknown>('Payments');

const view = (token: unknown): ProviderView =>
  ({
    id: 'p0',
    token,
    written: token,
    name: 'Payments',
    module: 'm0',
    kind: 'class',
    lifetime: 'singleton',
    eager: true,
    implementation: null,
    rewrittenBy: null,
  }) as ProviderView;

const declarations = (
  classTokens: Token<Interceptor>[],
  methods: [string | symbol, Token<Interceptor>[]][],
): Declarations => ({
  classTokens,
  methods: new Map(methods),
  problems: [],
  any: true,
});

const binding = (
  token: unknown,
  cls: Token<Interceptor>[],
  methods: [string, Token<Interceptor>[]][] = [],
): NormalBinding => ({
  token: token as never,
  class: cls,
  methods: new Map(methods),
});

describe('chainFor', () => {
  it('orders global, bindings, class, then method', () => {
    const chain = chainFor(
      view(PAYMENTS),
      'charge',
      [{ use: G, when: undefined }],
      [binding(PAYMENTS, [B])],
      declarations([C], [['charge', [M]]]),
    );
    expect(chain).toEqual([G, B, C, M]);
  });

  it('runs a token once, at its outermost position', () => {
    const chain = chainFor(
      view(PAYMENTS),
      'charge',
      [{ use: G, when: undefined }],
      [],
      declarations([G, C], [['charge', [C, M]]]),
    );
    expect(chain).toEqual([G, C, M]);
  });

  it('asks when() with the provider and the method', () => {
    const when = vi.fn(
      ({ method }: { method: string | symbol }) => method !== 'health',
    );
    const global: NormalGlobal[] = [{ use: G, when }];
    const empty = declarations([], []);
    expect(chainFor(view(PAYMENTS), 'charge', global, [], empty)).toEqual([G]);
    expect(chainFor(view(PAYMENTS), 'health', global, [], empty)).toEqual([]);
    expect(when).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'health' }),
    );
  });

  it('applies only method-level lists to a symbol key', () => {
    const run = Symbol('run');
    const chain = chainFor(
      view(PAYMENTS),
      run,
      [{ use: G, when: undefined }],
      [binding(PAYMENTS, [B])],
      declarations([C], [[run, [M]]]),
    );
    expect(chain).toEqual([M]);
  });
});

describe('bindingsFor', () => {
  it('matches the canonical and the written token', () => {
    const written = new Token<unknown>('Written');
    const v = { ...view(PAYMENTS), written } as ProviderView;
    const bindings = [
      binding(PAYMENTS, [B]),
      binding(written, [C]),
      binding(new Token('Other'), [M]),
    ];
    expect(bindingsFor(v, bindings).map((b) => b.class[0])).toEqual([B, C]);
  });
});
