import { Token } from '@nexusdi/core';
import { describe, expectTypeOf, it } from 'vitest';

import type { Interceptor, InterceptorMap, MethodKey } from './types.js';

const AUDIT = new Token<Interceptor>('Audit');

class PaymentService {
  static interceptors = {
    class: [AUDIT],
    methods: { charge: [AUDIT] },
  } satisfies InterceptorMap<PaymentService>;

  readonly currency = 'EUR';
  async charge(amount: number): Promise<number> {
    return amount;
  }
  refund(): void {}
}

describe('InterceptorMap', () => {
  it('keys methods by the class method names', () => {
    expectTypeOf<MethodKey<PaymentService>>().toEqualTypeOf<
      'charge' | 'refund'
    >();
  });

  it('rejects a key that is not a method', () => {
    const bad = {
      // @ts-expect-error currency is a field
      methods: { currency: [AUDIT] },
    } satisfies InterceptorMap<PaymentService>;
    void bad;
  });

  it('accepts any key when the class is unknown', () => {
    expectTypeOf<MethodKey<unknown>>().toEqualTypeOf<string | symbol>();
  });

  it('keeps the static form usable', () => {
    void PaymentService.interceptors;
  });
});
