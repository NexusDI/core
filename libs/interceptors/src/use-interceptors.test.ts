import { Token } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { findCode, thrown } from '../test-support/catch.js';
import { declarationsOf } from './metadata.js';
import type { Interceptor } from './types.js';
import { UseInterceptors } from './use-interceptors.js';

const A = new Token<Interceptor>('A');
const B = new Token<Interceptor>('B');
const C = new Token<Interceptor>('C');

describe('UseInterceptors', () => {
  it('records class and method interceptors, top decorator outermost', () => {
    @UseInterceptors(A)
    @UseInterceptors(B)
    class PaymentService {
      @UseInterceptors(C)
      @UseInterceptors(A)
      charge() {}
    }
    const d = declarationsOf(PaymentService);
    expect(d.classTokens).toEqual([A, B]);
    expect(d.methods.get('charge')).toEqual([C, A]);
  });

  it('reports both forms on one class', () => {
    @UseInterceptors(A)
    class Twice {
      static interceptors = { class: [B] };
    }
    expect(declarationsOf(Twice).problems).toEqual([
      { reason: 'two-forms', target: 'Twice' },
    ]);
  });

  it('keeps a subclass decorator off the base class', () => {
    @UseInterceptors(A)
    class Base {}
    @UseInterceptors(B)
    class Derived extends Base {}
    expect(declarationsOf(Base).classTokens).toEqual([A]);
    expect(declarationsOf(Derived).classTokens).toEqual([A, B]);
  });

  it('rejects a private method, a static method and a lifecycle method', () => {
    const cases: [() => unknown, string][] = [
      [
        () => {
          class P {
            @UseInterceptors(A) #secret() {}
            static probe(p: P) {
              p.#secret();
            }
          }
          return P;
        },
        'private-method',
      ],
      [
        () => {
          class S {
            @UseInterceptors(A) static make() {}
          }
          return S;
        },
        'static-method',
      ],
      [
        () => {
          class L {
            @UseInterceptors(A) onInit() {}
          }
          return L;
        },
        'bad-target',
      ],
    ];
    for (const [define, reason] of cases) {
      expect(
        findCode(thrown(define), 'NEXUS_INTERCEPTOR_INVALID'),
      ).toMatchObject({ reason });
    }
  });

  it('rejects a legacy decorator call', () => {
    const decorate = UseInterceptors(A) as (...args: unknown[]) => void;
    class Legacy {}
    expect(
      findCode(
        thrown(() => decorate(Legacy)),
        'NEXUS_INTERCEPTOR_INVALID',
      ),
    ).toMatchObject({
      reason: 'legacy-decorators',
    });
  });

  it('rejects a value that is not a token', () => {
    expect(
      findCode(
        thrown(() => UseInterceptors('A' as never)),
        'NEXUS_INTERCEPTOR_INVALID',
      ),
    ).toMatchObject({ reason: 'declaration' });
  });
});
