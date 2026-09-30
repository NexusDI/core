import type { ErrorText, NexusError } from '@nexusdi/core';

/**
 * The fields of @nexusdi/interceptors' InterceptorError, read by shape so
 * this package does not depend on that one.
 */
export interface InterceptorFields extends NexusError {
  readonly reason: string | null;
  readonly token: string | null;
  readonly target: string | null;
  readonly method: string | null;
  readonly state: 'building' | 'disposed' | null;
  readonly detail: readonly string[];
}

type Builder = (error: InterceptorFields) => ErrorText;

/** interceptors() options: detail[0] names the rule, detail[1] what was received. */
const OPTIONS: Record<string, string> = {
  'not-object': 'options must be an object',
  'not-array': '$ must be an array',
  'register-empty': 'register must list an interceptor',
  'register-entry': 'register takes classes and interceptor() entries',
  'register-twice': 'an interceptor is registered twice',
  'global-entry': 'a global entry is a token or { use, when }',
  'global-use': "a global entry's use must be a token",
  'global-when': "a global entry's when must be a function",
  binding: 'a binding is { token, class?, methods? }',
  'binding-token': "a binding's token must be a Token or a class",
  'binding-map': '$',
  'exempt-entry': 'exempt takes tokens',
  'interceptor-token': 'interceptor() takes a Token or a class',
};

const INVALID: Record<string, Builder> = {
  options: (e) => {
    const [rule = '', got] = e.detail;
    const text = OPTIONS[rule] ?? rule;
    const named = e.token === null ? '' : ` (${e.token})`;
    if (rule === 'binding-map')
      return {
        message: `interceptors(): the binding${named} ${
          got === 'class' || got?.startsWith('methods') === true
            ? `has a ${got} that is not a list of tokens`
            : `has the key ${got}, and takes token, class and methods`
        }.`,
      };
    return {
      message: `interceptors(): ${
        text.includes('$')
          ? text.replace('$', got ?? '')
          : `${text}${named}${got === undefined ? '' : `, and received ${got}`}`
      }.`,
    };
  },
  declaration: (e) => ({
    message:
      e.target === null
        ? `@UseInterceptors received ${e.detail[0]}, which is not a token.`
        : `${e.target}'s static interceptors is not { class?, methods? } (key ${e.detail[0]}).`,
    fix: 'the name static interceptors is reserved; rename a field that uses it for anything else.',
  }),
  'unknown-method': (e) => ({
    message: `${e.target} has interceptors for ${e.method}, which is not a method on its prototype chain.`,
    fix: 'correct the name, or declare an arrow-function field as a method.',
  }),
  'two-forms': (e) => ({
    message: `${e.target} uses both static interceptors and @UseInterceptors.`,
    fix: 'keep one form.',
  }),
  'private-method': (e) => ({
    message: `@UseInterceptors cannot wrap the private method ${e.method}.`,
  }),
  'static-method': (e) => ({
    message: `@UseInterceptors cannot wrap the static method ${e.method}.`,
  }),
  'bad-target': (e) => ({
    message:
      e.target !== null
        ? `${e.target} is a frozen function, so its method ${e.method} cannot be wrapped.`
        : e.method !== null
          ? `${e.method} is never intercepted, since the container calls it.`
          : `@UseInterceptors goes on a class or a method, and was placed on a ${e.detail[0]}.`,
  }),
  'legacy-decorators': () => ({
    message:
      '@UseInterceptors is a standard decorator, and ran as a legacy one.',
    fix: 'remove experimentalDecorators from tsconfig, or use static interceptors.',
  }),
  'no-intercept': (e) => ({
    message: `the interceptor ${e.token} has no intercept(call, next) method.`,
  }),
  'bad-next': (e) => ({
    message: `${e.token} passed next() arguments that are not an array, in ${e.target}.${e.method}.`,
  }),
  'unexempted-dep': (e) => ({
    message: `${e.token} depends on ${e.target}, which exempt does not list. Exempting it makes global entries skip ${e.detail.join(', ')}.`,
    fix: `add ${e.target} to interceptors({ exempt }), or move it into providers.`,
  }),
  'unused-exempt': (e) => ({
    message: `exempt lists ${e.target}, which no interceptor depends on directly${e.detail.length === 0 ? '' : `; ${e.detail.join(', ')} covers it`}.`,
    fix: `remove ${e.target} from exempt.`,
  }),
  'self-intercept': (e) => ({
    message: `${e.target} names ${e.token} in a class list, and ${e.token} depends on ${e.target}, so ${e.token} would run inside itself.`,
    fix: `list ${e.token} only for methods of ${e.target} it never calls.`,
  }),
};

/** The text of each @nexusdi/interceptors code. */
export const INTERCEPTOR_BUILDERS: Record<
  | 'NEXUS_INTERCEPTOR_INVALID'
  | 'NEXUS_INTERCEPTOR_MISSING'
  | 'NEXUS_INTERCEPTOR_LIFETIME'
  | 'NEXUS_INTERCEPTOR_NOT_READY'
  | 'NEXUS_INTERCEPTORS_SHARED',
  Builder
> = {
  NEXUS_INTERCEPTOR_INVALID: (e) =>
    INVALID[e.reason ?? '']?.(e) ?? {
      message: e.message.slice(e.code.length + 3),
    },
  NEXUS_INTERCEPTOR_MISSING: (e) => ({
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
  }),
  NEXUS_INTERCEPTOR_LIFETIME: (e) => ({
    message: `the interceptor ${e.token} is ${e.detail[0]}, and interceptors are singletons.`,
    fix: 'remove its lifetime, and read request data from call.instance.',
  }),
  NEXUS_INTERCEPTOR_NOT_READY: (e) =>
    e.state === 'building'
      ? {
          message: `${e.target}.${e.method} was called before its interceptors were built.`,
          fix: 'call it from onInit, or inject it with lazy().',
        }
      : {
          message: `${e.target}.${e.method} was called after its container was disposed.`,
        },
  NEXUS_INTERCEPTORS_SHARED: () => ({
    message:
      'this interceptors() plugin is in use by a running container or an unfinished create.',
    fix: 'call interceptors() once per container.',
  }),
};
