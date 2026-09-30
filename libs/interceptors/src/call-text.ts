import type { ErrorText } from '@nexusdi/core';

/** The fields a call-time fault names. */
interface CallFields {
  readonly token: string | null;
  readonly target: string | null;
  readonly method: string | null;
}

// The wording of the two faults a wrapped method raises at call time. The
// pack words them once the container formats them; before setup no
// formatter runs, so the proxy writes the same words into the error
// (extension principle spec section 2.5.1).

/** NEXUS_INTERCEPTOR_MISSING: a declaration, binding or global entry names an unregistered token. */
export const missingText = (e: CallFields): ErrorText => ({
  message: `${
    e.target === null
      ? e.method === null
        ? 'a global entry or binding'
        : `a binding for ${e.method}`
      : e.method === null
        ? e.target
        : `${e.target}.${e.method}`
  } uses the interceptor ${e.token}, which is not registered.`,
  fix: `add ${e.token} to interceptors({ register }).`,
});

/** NEXUS_INTERCEPTOR_INVALID with reason bad-next. */
export const badNextText = (e: CallFields): ErrorText => ({
  message: `${e.token} passed next() arguments that are not an array, in ${e.target}.${e.method}.`,
});
