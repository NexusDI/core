import type { ErrorText, ErrorTextPack } from '@nexusdi/core';

import type { InterceptorError } from './interceptor-error.js';

/** interceptors() options: detail[0] names the rule, detail[1] what was received. */
const OPTIONS: Readonly<Record<string, string>> = {
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
  'exempt-entry': 'exempt takes tokens',
  'interceptor-token': 'interceptor() takes a Token or a class',
};

type Builder = (error: InterceptorError) => ErrorText;

/** The text of each NEXUS_INTERCEPTOR_INVALID reason the plugin reports or formats. */
const INVALID: Readonly<Record<string, Builder>> = {
  options: (e) => {
    const [rule = '', got] = e.detail;
    const named = e.token === null ? '' : ` (${e.token})`;
    if (rule === 'binding-map')
      return {
        message: `interceptors(): the binding${named} ${
          got === 'class' || got?.startsWith('methods') === true
            ? `has a ${got} that is not a list of tokens`
            : `has the key ${got}, and takes token, class and methods`
        }.`,
      };
    const text = Object.hasOwn(OPTIONS, rule) ? (OPTIONS[rule] ?? rule) : rule;
    return {
      message: `interceptors(): ${
        text.includes('$')
          ? text.replace('$', got ?? '')
          : `${text}${named}${got === undefined ? '' : `, and received ${got}`}`
      }.`,
    };
  },
  declaration: (e) => ({
    message: `${e.target}'s static interceptors is not { class?, methods? } (key ${e.detail[0]}).`,
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

/**
 * The text of the codes @nexusdi/interceptors reports at compile and
 * formats at call time. Register it with
 * `errors({ text: [interceptorsText] })`; without it those errors keep
 * core's one-line message and its docs link. Errors thrown where no
 * container formats them carry their own text.
 */
export const interceptorsText = {
  NEXUS_INTERCEPTOR_INVALID: (error: InterceptorError) =>
    error.reason !== null && Object.hasOwn(INVALID, error.reason)
      ? INVALID[error.reason]?.(error)
      : undefined,
  NEXUS_INTERCEPTOR_MISSING: (error: InterceptorError) => ({
    message: `${
      error.target === null
        ? error.method === null
          ? 'a global entry or binding'
          : `a binding for ${error.method}`
        : error.method === null
          ? error.target
          : `${error.target}.${error.method}`
    } uses the interceptor ${error.token}, which is not registered.`,
    fix: `add ${error.token} to interceptors({ register }).`,
  }),
  NEXUS_INTERCEPTOR_LIFETIME: (error: InterceptorError) => ({
    message: `the interceptor ${error.token} is ${error.detail[0]}, and interceptors are singletons.`,
    fix: 'remove its lifetime, and read request data from call.instance.',
  }),
  NEXUS_INTERCEPTORS_SHARED: () => ({
    message:
      'this interceptors() plugin is in use by a running container or an unfinished create.',
    fix: 'call interceptors() once per container.',
  }),
} satisfies ErrorTextPack;
