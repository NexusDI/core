import { Token } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { findCode, thrown } from '../test-support/catch.js';
import { interceptor, normalizeOptions } from './options.js';
import type { CallContext, Interceptor, Next } from './types.js';

const AUDIT = new Token<Interceptor>('Audit');
const PAYMENTS = new Token<unknown>('Payments');

class LoggingInterceptor implements Interceptor {
  intercept(_call: CallContext, next: Next) {
    return next();
  }
}

const invalidReason = (fn: () => unknown) =>
  findCode(thrown(fn), 'NEXUS_INTERCEPTOR_INVALID')?.reason;

describe('normalizeOptions', () => {
  it('registers classes and interceptor() entries', () => {
    const audit = interceptor(AUDIT, { useClass: LoggingInterceptor });
    const options = normalizeOptions({ register: [LoggingInterceptor, audit] });
    expect(options.registered.map((r) => r.token)).toEqual([
      LoggingInterceptor,
      AUDIT,
    ]);
    expect(options.registered[0]?.provider).toBe(LoggingInterceptor);
    expect(options.registered[1]?.provider).toBe(audit.provider);
  });

  it('normalises global entries and bindings', () => {
    const when = () => true;
    const options = normalizeOptions({
      register: [LoggingInterceptor],
      global: [LoggingInterceptor, { use: AUDIT, when }],
      bindings: [{ token: PAYMENTS, methods: { charge: [AUDIT] } }],
    });
    expect(options.global).toEqual([
      { use: LoggingInterceptor, when: undefined },
      { use: AUDIT, when },
    ]);
    expect(options.bindings[0]?.token).toBe(PAYMENTS);
    expect(options.bindings[0]?.methods.get('charge')).toEqual([AUDIT]);
  });

  it('rejects bad options with reason options', () => {
    expect(invalidReason(() => normalizeOptions(undefined))).toBe('options');
    expect(invalidReason(() => normalizeOptions({}))).toBe('options');
    expect(invalidReason(() => normalizeOptions({ register: [] }))).toBe(
      'options',
    );
    expect(invalidReason(() => normalizeOptions({ register: [{}] }))).toBe(
      'options',
    );
    expect(
      invalidReason(() =>
        normalizeOptions({
          register: [LoggingInterceptor, LoggingInterceptor],
        }),
      ),
    ).toBe('options');
    expect(
      invalidReason(() =>
        normalizeOptions({ register: [LoggingInterceptor], global: ['x'] }),
      ),
    ).toBe('options');
    expect(
      invalidReason(() =>
        normalizeOptions({
          register: [LoggingInterceptor],
          global: [{ use: AUDIT, when: 1 }],
        }),
      ),
    ).toBe('options');
    expect(
      invalidReason(() =>
        normalizeOptions({
          register: [LoggingInterceptor],
          bindings: [{ token: 'x' }],
        }),
      ),
    ).toBe('options');
    expect(
      invalidReason(() =>
        normalizeOptions({
          register: [LoggingInterceptor],
          bindings: [{ token: PAYMENTS, class: 'x' }],
        }),
      ),
    ).toBe('options');
  });

  it('names the rule each bad option breaks in detail', () => {
    const detail = (options: unknown) =>
      findCode(
        thrown(() => normalizeOptions(options)),
        'NEXUS_INTERCEPTOR_INVALID',
      )?.detail;
    const register = [LoggingInterceptor];
    expect(detail(undefined)).toEqual(['not-object']);
    expect(detail({ register: [] })).toEqual(['register-empty']);
    expect(detail({ register, global: 'x' })).toEqual(['not-array', 'global']);
    expect(detail({ register, exempt: ['x'] })).toEqual(['exempt-entry', 'x']);
    expect(
      detail({ register, bindings: [{ token: PAYMENTS, method: {} }] }),
    ).toEqual(['binding-map', 'method']);
  });

  it('keeps exempt tokens', () => {
    expect(
      normalizeOptions({ register: [LoggingInterceptor], exempt: [PAYMENTS] })
        .exempt,
    ).toEqual([PAYMENTS]);
  });

  it('rejects a forged entry that interceptor() did not make', () => {
    expect(
      invalidReason(() =>
        normalizeOptions({
          register: [{ token: AUDIT, provider: LoggingInterceptor }],
        }),
      ),
    ).toBe('options');
  });
});

describe('interceptor', () => {
  it('rejects a token that is not a Token or a class', () => {
    expect(
      invalidReason(() =>
        interceptor('Audit' as never, { useClass: LoggingInterceptor }),
      ),
    ).toBe('options');
  });
});
