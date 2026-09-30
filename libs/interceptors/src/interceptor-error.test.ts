import { isNexusError, NexusError } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import {
  errorOf,
  InterceptorError,
  invalidAt,
  notReady,
  sharedAtBuild,
  unchecked,
} from './interceptor-error.js';
import { keyName } from './metadata.js';

describe('InterceptorError', () => {
  it('carries the code and every field of a fault', () => {
    const error = errorOf({
      code: 'NEXUS_INTERCEPTOR_MISSING',
      token: 'Audit',
      target: 'PaymentService',
      method: 'charge',
    });
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

  it("writes core's one line of fields and the docs link for a fault", () => {
    expect(
      errorOf({
        code: 'NEXUS_INTERCEPTOR_INVALID',
        reason: 'options',
        detail: ['not-array', 'global'],
      }).message,
    ).toBe(
      '[NEXUS_INTERCEPTOR_INVALID] reason=options detail=not-array,global. https://nexus.js.org/errors/NEXUS_INTERCEPTOR_INVALID',
    );
  });

  it('writes the text of an error thrown where no container formats it', () => {
    expect(notReady('PaymentService', 'charge', 'building')).toMatchObject({
      code: 'NEXUS_INTERCEPTOR_NOT_READY',
      state: 'building',
      message:
        '[NEXUS_INTERCEPTOR_NOT_READY] PaymentService.charge was called before its interceptors were built.\n  Fix: call it from onInit, or inject it with lazy().',
    });
    expect(notReady('PaymentService', 'charge', 'disposed').message).toBe(
      '[NEXUS_INTERCEPTOR_NOT_READY] PaymentService.charge was called after its container was disposed.',
    );
    expect(unchecked('PaymentService')).toMatchObject({
      code: 'NEXUS_INTERCEPTORS_UNCHECKED',
      target: 'PaymentService',
    });
    expect(unchecked('PaymentService').message).toMatch(
      /^\[NEXUS_INTERCEPTORS_UNCHECKED\] PaymentService was built from a provider that no compile\.check/,
    );
    expect(sharedAtBuild().message).toBe(
      '[NEXUS_INTERCEPTORS_SHARED] this interceptors() plugin is in use by a running container or an unfinished create.\n  Fix: call interceptors() once per container.',
    );
    expect(
      invalidAt('static-method', { method: 'charge' }, 'the text.'),
    ).toMatchObject({
      code: 'NEXUS_INTERCEPTOR_INVALID',
      reason: 'static-method',
      method: 'charge',
      message: '[NEXUS_INTERCEPTOR_INVALID] the text.',
    });
  });
});

describe('keyName', () => {
  it('writes a symbol key in brackets and a string key as is', () => {
    expect(keyName(Symbol('run'))).toBe('[Symbol(run)]');
    expect(keyName('charge')).toBe('charge');
  });
});
