import { Token } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { declarationsOf, parseMap } from './metadata.js';
import type { Interceptor, InterceptorMap } from './types.js';

const A = new Token<Interceptor>('A');
const B = new Token<Interceptor>('B');
const C = new Token<Interceptor>('C');

describe('parseMap', () => {
  it('reads class and method lists', () => {
    const run = Symbol('run');
    const parsed = parseMap({
      class: [A],
      methods: { charge: [B], [run]: [C] },
    });
    expect(parsed).toEqual({
      class: [A],
      methods: new Map<string | symbol, unknown>([
        ['charge', [B]],
        [run, [C]],
      ]),
    });
  });

  it('names the key at fault in a malformed map', () => {
    expect(parseMap(null)).toBe('class');
    expect(parseMap([A])).toBe('class');
    expect(parseMap({ class: A })).toBe('class');
    expect(parseMap({ class: ['A'] })).toBe('class');
    expect(parseMap({ methods: 'charge' })).toBe('methods');
    expect(parseMap({ methods: { charge: B } })).toBe('methods.charge');
  });

  it('names an unknown key, such as a misspelt methods', () => {
    expect(parseMap({ method: { charge: [B] } })).toBe('method');
    expect(parseMap({ token: A, class: [B] })).toBe('token');
    expect(parseMap({ token: A, class: [B] }, ['token'])).toEqual({
      class: [B],
      methods: new Map(),
    });
  });
});

describe('declarationsOf', () => {
  it('reads the static form', () => {
    class PaymentService {
      static interceptors = { class: [A], methods: { charge: [B] } };
      charge() {}
    }
    const d = declarationsOf(PaymentService);
    expect(d.classTokens).toEqual([A]);
    expect(d.methods.get('charge')).toEqual([B]);
    expect(d.problems).toEqual([]);
    expect(d.any).toBe(true);
  });

  it('accumulates class lists base first, and lets a subclass replace a method list', () => {
    class Base {
      static interceptors: InterceptorMap = {
        class: [A],
        methods: { charge: [B], refund: [B] },
      };
      charge() {}
      refund() {}
    }
    class Derived extends Base {
      static override interceptors = { class: [C], methods: { charge: [C] } };
    }
    const d = declarationsOf(Derived);
    expect(d.classTokens).toEqual([A, C]);
    expect(d.methods.get('charge')).toEqual([C]);
    expect(d.methods.get('refund')).toEqual([B]);
  });

  it('inherits a base declaration into a subclass that declares nothing', () => {
    class Base {
      static interceptors = { class: [A] };
    }
    class Derived extends Base {}
    expect(declarationsOf(Derived).classTokens).toEqual([A]);
  });

  it('reports a malformed static form', () => {
    class Broken {
      static interceptors = { class: 'A' };
    }
    expect(declarationsOf(Broken).problems).toEqual([
      { reason: 'declaration', target: 'Broken', key: 'class' },
    ]);
  });

  it('reports nothing for a plain class', () => {
    class Plain {}
    expect(declarationsOf(Plain)).toMatchObject({ any: false, problems: [] });
  });
});
