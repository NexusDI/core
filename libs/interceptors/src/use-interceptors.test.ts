import { defineModule, Nexus, provide, Token } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { findCode, rejected, thrown } from '../test-support/catch.js';
import { declarationsOf } from './metadata.js';
import { interceptor } from './options.js';
import { interceptors } from './plugin.js';
import type { Interceptor } from './types.js';
import { UseInterceptors } from './use-interceptors.js';

const A = new Token<Interceptor>('A');
const B = new Token<Interceptor>('B');
const C = new Token<Interceptor>('C');

interface IPayments {
  charge(): void;
}
interface IRunner {
  run(): void;
}
const PAYMENTS = new Token<IPayments>('Payments');

/** A plugin whose interceptors A, B and C each write their own name to `log`. */
const logging = (log: string[]) =>
  interceptors({
    register: (
      [
        ['A', A],
        ['B', B],
        ['C', C],
      ] as const
    ).map(([name, token]) =>
      interceptor(token, {
        useFactory: (): Interceptor => ({
          intercept: (_call, next) => {
            log.push(name);
            return next();
          },
        }),
        deps: [],
      }),
    ),
  });

describe('UseInterceptors', () => {
  it('runs the class interceptors, then the method ones, top decorator outermost and each token once', async () => {
    const log: string[] = [];
    @UseInterceptors(A)
    @UseInterceptors(B)
    class PaymentService implements IPayments {
      @UseInterceptors(C)
      @UseInterceptors(A)
      charge() {
        log.push('charge');
      }
    }
    await using ship = await Nexus.create(
      defineModule({
        name: 'Billing',
        providers: [provide(PAYMENTS, { useClass: PaymentService })],
      }),
      { plugins: [logging(log)] },
    );

    ship.get(PAYMENTS).charge();
    expect(log).toEqual(['A', 'B', 'C', 'charge']);
  });

  it('fails create for a class that also declares static interceptors', async () => {
    @UseInterceptors(A)
    class Twice implements IPayments {
      static interceptors = { class: [B] };
      charge() {}
    }
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'Billing',
          providers: [provide(PAYMENTS, { useClass: Twice })],
        }),
        { plugins: [logging([])] },
      ),
    );

    expect(findCode(error, 'NEXUS_INTERCEPTOR_INVALID')).toMatchObject({
      reason: 'two-forms',
      target: 'Twice',
    });
  });

  it('intercepts a subclass with the base decorator and its own, and the base with its own alone', async () => {
    const log: string[] = [];
    const BASE = new Token<IRunner>('Base');
    const DERIVED = new Token<IRunner>('Derived');
    @UseInterceptors(A)
    class Base implements IRunner {
      run() {
        log.push('run');
      }
    }
    @UseInterceptors(B)
    class Derived extends Base {}
    await using ship = await Nexus.create(
      defineModule({
        name: 'Billing',
        providers: [
          provide(BASE, { useClass: Base }),
          provide(DERIVED, { useClass: Derived }),
        ],
      }),
      { plugins: [logging(log)] },
    );

    ship.get(BASE).run();
    ship.get(DERIVED).run();
    expect(log).toEqual(['A', 'run', 'A', 'B', 'run']);
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

describe('declarationsOf', () => {
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
});
