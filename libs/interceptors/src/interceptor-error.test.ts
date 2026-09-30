import { isNexusError, NexusError, Token } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import {
  InterceptorError,
  invalid,
  lifetime,
  missing,
  notReady,
  shared,
} from './interceptor-error.js';
import { keyName, nameOf } from './names.js';

describe('InterceptorError', () => {
  it('carries the code and every field', () => {
    const error = missing(new Token('Audit'), 'PaymentService', 'charge');
    expect(error).toBeInstanceOf(InterceptorError);
    expect(error).toBeInstanceOf(NexusError);
    expect(isNexusError(error, 'NEXUS_INTERCEPTOR_MISSING')).toBe(true);
    expect(error).toMatchObject({
      code: 'NEXUS_INTERCEPTOR_MISSING',
      reason: null,
      token: 'Audit',
      target: 'PaymentService',
      method: 'charge',
      state: null,
      detail: [],
    });
  });

  it("writes core's one line of fields and the docs link", () => {
    expect(
      missing(new Token('Audit'), 'PaymentService', 'charge').message,
    ).toBe(
      '[NEXUS_INTERCEPTOR_MISSING] token=Audit target=PaymentService method=charge. https://nexus.js.org/errors/NEXUS_INTERCEPTOR_MISSING',
    );
    expect(
      invalid('options', { detail: ['not-array', 'global'] }).message,
    ).toBe(
      '[NEXUS_INTERCEPTOR_INVALID] reason=options detail=not-array,global. https://nexus.js.org/errors/NEXUS_INTERCEPTOR_INVALID',
    );
  });

  it('builds each code', () => {
    expect(invalid('options').code).toBe('NEXUS_INTERCEPTOR_INVALID');
    expect(invalid('options').reason).toBe('options');
    expect(lifetime(new Token('Audit'), 'scoped').code).toBe(
      'NEXUS_INTERCEPTOR_LIFETIME',
    );
    expect(notReady('PaymentService', 'charge', 'disposed')).toMatchObject({
      code: 'NEXUS_INTERCEPTOR_NOT_READY',
      state: 'disposed',
    });
    expect(shared().code).toBe('NEXUS_INTERCEPTORS_SHARED');
  });
});

describe('nameOf', () => {
  it('names a token by its description and a class by its name', () => {
    class AuditInterceptor {}
    expect(nameOf(new Token('Audit'))).toBe('Audit');
    expect(nameOf(AuditInterceptor)).toBe('AuditInterceptor');
    expect(nameOf(class {})).toBe('(anonymous class)');
    expect(keyName(Symbol('run'))).toBe('[Symbol(run)]');
    expect(keyName('charge')).toBe('charge');
  });
});
