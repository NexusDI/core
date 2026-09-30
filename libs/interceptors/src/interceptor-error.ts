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
  | 'no-intercept'
  | 'bad-next'
  | 'unexempted-dep'
  | 'unused-exempt'
  | 'self-intercept';

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
  /** What else the fault names: the option at fault, the value received, or the providers a global entry would skip. */
  readonly detail: readonly string[];
}

/**
 * A fault in how interceptors are declared, registered or called. Its
 * message is core's one line of fields; `errors()` from @nexusdi/errors
 * writes the full text.
 */
export class InterceptorError extends errorBase<
  InterceptorErrorCode,
  InterceptorFields
>((fields) => fields.code, 'InterceptorError') {}

type Given = Partial<Omit<InterceptorFields, 'code'>>;

const raise = (code: InterceptorErrorCode, fields: Given): InterceptorError =>
  new InterceptorError({
    code,
    reason: null,
    token: null,
    target: null,
    method: null,
    state: null,
    detail: [],
    ...fields,
  });

export const invalid = (
  reason: InvalidReason,
  fields: Given = {},
): InterceptorError =>
  raise('NEXUS_INTERCEPTOR_INVALID', { ...fields, reason });

export const missing = (
  token: unknown,
  target: string | null,
  method: string | null,
): InterceptorError =>
  raise('NEXUS_INTERCEPTOR_MISSING', { token: nameOf(token), target, method });

export const lifetime = (token: unknown, found: string): InterceptorError =>
  raise('NEXUS_INTERCEPTOR_LIFETIME', {
    token: nameOf(token),
    detail: [found],
  });

export const notReady = (
  target: string,
  method: string,
  state: 'building' | 'disposed',
): InterceptorError =>
  raise('NEXUS_INTERCEPTOR_NOT_READY', { target, method, state });

export const shared = (): InterceptorError =>
  raise('NEXUS_INTERCEPTORS_SHARED', {});

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    NEXUS_INTERCEPTOR_INVALID: InterceptorError;
    NEXUS_INTERCEPTOR_MISSING: InterceptorError;
    NEXUS_INTERCEPTOR_LIFETIME: InterceptorError;
    NEXUS_INTERCEPTOR_NOT_READY: InterceptorError;
    NEXUS_INTERCEPTORS_SHARED: InterceptorError;
  }
}
