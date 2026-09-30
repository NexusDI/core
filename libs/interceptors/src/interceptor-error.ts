import { errorBase } from '@nexusdi/core';

export type InterceptorErrorCode =
  | 'NEXUS_INTERCEPTOR_INVALID'
  | 'NEXUS_INTERCEPTOR_MISSING'
  | 'NEXUS_INTERCEPTOR_LIFETIME'
  | 'NEXUS_INTERCEPTOR_NOT_READY'
  | 'NEXUS_INTERCEPTORS_SHARED'
  | 'NEXUS_INTERCEPTORS_UNCHECKED';

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
  /** What else the fault names: the option at fault, the value received, the lifetime found, or the providers a global entry would skip. */
  readonly detail: readonly string[];
}

/**
 * A fault in how interceptors are declared, registered or called. An error
 * compile.check reports, or the plugin formats at call time, carries core's
 * one line of fields; `interceptorsText` from `@nexusdi/interceptors/text`
 * writes its full text. An error thrown where no container formats it
 * carries its full text.
 */
export class InterceptorError extends errorBase<
  InterceptorErrorCode,
  InterceptorFields
>((fields) => fields.code, 'InterceptorError') {}

const NONE = {
  reason: null,
  token: null,
  target: null,
  method: null,
  state: null,
  detail: [],
} as const;

/**
 * A fault whose text lives in interceptorsText: one compile.check reports,
 * or one the plugin formats through its context at call time.
 */
export type Fault = Partial<Omit<InterceptorFields, 'code'>> & {
  readonly code:
    | 'NEXUS_INTERCEPTOR_INVALID'
    | 'NEXUS_INTERCEPTOR_MISSING'
    | 'NEXUS_INTERCEPTOR_LIFETIME'
    | 'NEXUS_INTERCEPTORS_SHARED';
};

/** The error of a fault, with core's one line and no text of its own. */
export function errorOf(fault: Fault): InterceptorError {
  return new InterceptorError({ ...NONE, ...fault });
}

// The errors below are thrown where no container formatter runs (spec
// section 2.5.1): at decorator evaluation, from the construct hook, whose
// throw core wraps as a cause, and from a call before setup or after
// disposal. Each carries its own text.

export const notReady = (
  target: string,
  method: string,
  state: 'building' | 'disposed',
): InterceptorError =>
  new InterceptorError(
    { ...NONE, code: 'NEXUS_INTERCEPTOR_NOT_READY', target, method, state },
    {
      text:
        state === 'building'
          ? `${target}.${method} was called before its interceptors were built.\n  Fix: call it from onInit, or inject it with lazy().`
          : `${target}.${method} was called after its container was disposed.`,
    },
  );

export const unchecked = (target: string): InterceptorError =>
  new InterceptorError(
    { ...NONE, code: 'NEXUS_INTERCEPTORS_UNCHECKED', target },
    {
      text: `${target} was built from a provider that no compile.check of this interceptors() plugin saw, so its interceptors are unknown.\n  Fix: install @nexusdi/interceptors at the version of @nexusdi/core, and let only the container call the plugin's hooks.`,
    },
  );

export const sharedAtBuild = (): InterceptorError =>
  new InterceptorError(
    { ...NONE, code: 'NEXUS_INTERCEPTORS_SHARED' },
    {
      text: 'this interceptors() plugin is in use by a running container or an unfinished create.\n  Fix: call interceptors() once per container.',
    },
  );

/** A NEXUS_INTERCEPTOR_INVALID thrown with its text; `text` is the message body. */
export const invalidAt = (
  reason: InvalidReason,
  fields: Partial<Omit<InterceptorFields, 'code' | 'reason'>>,
  text: string,
): InterceptorError =>
  new InterceptorError(
    { ...NONE, ...fields, code: 'NEXUS_INTERCEPTOR_INVALID', reason },
    { text },
  );

declare module '@nexusdi/core' {
  interface NexusErrorByCode {
    NEXUS_INTERCEPTOR_INVALID: InterceptorError;
    NEXUS_INTERCEPTOR_MISSING: InterceptorError;
    NEXUS_INTERCEPTOR_LIFETIME: InterceptorError;
    NEXUS_INTERCEPTOR_NOT_READY: InterceptorError;
    NEXUS_INTERCEPTORS_SHARED: InterceptorError;
    NEXUS_INTERCEPTORS_UNCHECKED: InterceptorError;
  }
}
