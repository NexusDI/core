import { Token } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import type { Fault } from './interceptor-error.js';
import { interceptor, parseOptions, type NormalOptions } from './options.js';
import type { CallContext, Interceptor, Next } from './types.js';

const AUDIT = new Token<Interceptor>('Audit');
const PAYMENTS = new Token<unknown>('Payments');

class LoggingInterceptor implements Interceptor {
  intercept(_call: CallContext, next: Next) {
    return next();
  }
}

/** The options, or a thrown error naming the faults. */
const normalizeOptions = (options: unknown): NormalOptions => {
  const parsed = parseOptions(options);
  if (Array.isArray(parsed)) throw new Error(JSON.stringify(parsed));
  return parsed;
};

/** Every fault of `options`; empty when they are valid. */
const faultsOf = (options: unknown): Fault[] => {
  const parsed = parseOptions(options);
  return Array.isArray(parsed) ? parsed : [];
};

const invalidReason = (options: unknown) => faultsOf(options)[0]?.reason;

describe('parseOptions', () => {
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

  it('turns bad options into faults with reason options', () => {
    const register = [LoggingInterceptor];
    for (const options of [
      undefined,
      {},
      { register: [] },
      { register: [{}] },
      { register: [LoggingInterceptor, LoggingInterceptor] },
      { register, global: ['x'] },
      { register, global: [{ use: AUDIT, when: 1 }] },
      { register, bindings: [{ token: 'x' }] },
      { register, bindings: [{ token: PAYMENTS, class: 'x' }] },
    ])
      expect(invalidReason(options)).toBe('options');
  });

  it('names the rule each bad option breaks in detail', () => {
    const detail = (options: unknown) => faultsOf(options)[0]?.detail;
    const register = [LoggingInterceptor];
    expect(detail(undefined)).toEqual(['not-object']);
    expect(detail({ register: [] })).toEqual(['register-empty']);
    expect(detail({ register, global: 'x' })).toEqual(['not-array', 'global']);
    expect(detail({ register, exempt: ['x'] })).toEqual([
      'exempt-entry',
      'the string "x"',
    ]);
    expect(
      detail({ register, bindings: [{ token: PAYMENTS, method: {} }] }),
    ).toEqual(['binding-map', 'method']);
  });

  it('collects every fault of the options', () => {
    expect(
      faultsOf({
        register: 'x',
        global: [1],
        exempt: [null],
      }).map((fault) => fault.detail),
    ).toEqual([
      ['not-array', 'register'],
      ['global-entry', 'the number 1'],
      ['exempt-entry', 'null'],
    ]);
  });

  it('keeps exempt tokens', () => {
    expect(
      normalizeOptions({ register: [LoggingInterceptor], exempt: [PAYMENTS] })
        .exempt,
    ).toEqual([PAYMENTS]);
  });

  it('rejects a forged entry that interceptor() did not make', () => {
    expect(
      invalidReason({
        register: [{ token: AUDIT, provider: LoggingInterceptor }],
      }),
    ).toBe('options');
  });
});

describe('interceptor', () => {
  it('turns a token that is not a Token or a class into a fault of the options that register it', () => {
    const entry = interceptor('Audit' as never, {
      useClass: LoggingInterceptor,
    });
    expect(faultsOf({ register: [entry] })).toEqual([
      {
        code: 'NEXUS_INTERCEPTOR_INVALID',
        reason: 'options',
        detail: ['interceptor-token', 'the string "Audit"'],
      },
    ]);
  });
});
