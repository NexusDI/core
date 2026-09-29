import { errorBase } from '@nexusdi/core';

import { nameOf } from './names.js';

export type InterceptorErrorCode =
  | 'NEXUS_INTERCEPTOR_INVALID'
  | 'NEXUS_INTERCEPTOR_MISSING'
  | 'NEXUS_INTERCEPTOR_LIFETIME'
  | 'NEXUS_INTERCEPTOR_NOT_READY'
  | 'NEXUS_INTERCEPTORS_SHARED';

export type InvalidReason =
  | 'options'
  | 'declaration'
  | 'unknown-method'
  | 'two-forms'
  | 'private-method'
  | 'static-method'
  | 'bad-target'
  | 'legacy-decorators'
  | 'no-intercept';

interface InterceptorFields {
  readonly code: InterceptorErrorCode;
  /** Why NEXUS_INTERCEPTOR_INVALID fired; null for the other codes. */
  readonly reason: InvalidReason | null;
  /** The interceptor token's name, or null. */
  readonly token: string | null;
  /** The provider or class the fault is on, or null. */
  readonly target: string | null;
  /** The method name, or null. */
  readonly method: string | null;
  /** For NEXUS_INTERCEPTOR_NOT_READY: whether the container is still building or disposed. */
  readonly state: 'building' | 'disposed' | null;
}

/** A fault in how interceptors are declared, registered or called. */
export class InterceptorError extends errorBase<
  InterceptorErrorCode,
  InterceptorFields
>((fields) => fields.code, 'InterceptorError') {}

const EMPTY = {
  reason: null,
  token: null,
  target: null,
  method: null,
  state: null,
};

export function invalid(
  reason: InvalidReason,
  fields: Partial<Pick<InterceptorFields, 'token' | 'target' | 'method'>>,
  text: string,
): InterceptorError {
  return new InterceptorError(
    { ...EMPTY, ...fields, code: 'NEXUS_INTERCEPTOR_INVALID', reason },
    { text },
  );
}

export function missing(
  token: unknown,
  target: string | null,
  method: string | null,
): InterceptorError {
  const name = nameOf(token);
  const where =
    target === null
      ? 'a global entry or binding'
      : method === null
        ? target
        : `${target}.${method}`;
  return new InterceptorError(
    {
      ...EMPTY,
      code: 'NEXUS_INTERCEPTOR_MISSING',
      token: name,
      target,
      method,
    },
    {
      text: `${where} uses the interceptor ${name}, which is not registered.\n  Fix: add ${name} to interceptors({ register }).`,
    },
  );
}

export function lifetime(token: unknown, found: string): InterceptorError {
  const name = nameOf(token);
  return new InterceptorError(
    { ...EMPTY, code: 'NEXUS_INTERCEPTOR_LIFETIME', token: name },
    {
      text: `the interceptor ${name} is ${found}, and interceptors are singletons.\n  Fix: remove its lifetime option, and read request data from call.instance or nodeScopes().current().`,
    },
  );
}

export function notReady(
  target: string,
  method: string,
  state: 'building' | 'disposed',
): InterceptorError {
  const text =
    state === 'building'
      ? `${target}.${method} was called before its interceptors were built.\n  Fix: call it from onInit, or inject lazy() of the service in the constructor that calls it.`
      : `${target}.${method} was called after its container was disposed.`;
  return new InterceptorError(
    { ...EMPTY, code: 'NEXUS_INTERCEPTOR_NOT_READY', target, method, state },
    { text },
  );
}

export function shared(): InterceptorError {
  return new InterceptorError(
    { ...EMPTY, code: 'NEXUS_INTERCEPTORS_SHARED' },
    {
      text: 'this interceptors() plugin is already registered in a container that is not disposed.\n  Fix: call interceptors() once per container.',
    },
  );
}

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    NEXUS_INTERCEPTOR_INVALID: InterceptorError;
    NEXUS_INTERCEPTOR_MISSING: InterceptorError;
    NEXUS_INTERCEPTOR_LIFETIME: InterceptorError;
    NEXUS_INTERCEPTOR_NOT_READY: InterceptorError;
    NEXUS_INTERCEPTORS_SHARED: InterceptorError;
  }
}
