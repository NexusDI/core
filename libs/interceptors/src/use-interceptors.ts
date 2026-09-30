import './polyfill/symbol-metadata.js';

import { invalid } from './interceptor-error.js';
import {
  EXCLUDED_KEYS,
  isInterceptorToken,
  recordClass,
  recordMethod,
} from './metadata.js';
import { keyName } from './names.js';
import type { InterceptorToken } from './types.js';

/** A value as an error names it, without calling its own toString. */
const describe = (value: unknown): string =>
  typeof value === 'object' && value !== null
    ? 'an object'
    : typeof value === 'symbol'
      ? value.toString()
      : String(value);

type Context = ClassDecoratorContext | ClassMethodDecoratorContext;

/* eslint-disable @typescript-eslint/no-explicit-any -- a decorator context is generic in its class and method, and `any` accepts every one */
type AnyContext =
  ClassDecoratorContext<any> | ClassMethodDecoratorContext<any, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Attaches interceptors to a class (every method) or to one method. Stacked
 * decorators run top to bottom, outermost first.
 */
export function UseInterceptors(
  ...tokens: InterceptorToken[]
): (target: unknown, context: AnyContext) => void {
  for (const token of tokens) {
    if (!isInterceptorToken(token))
      throw invalid('declaration', { detail: [describe(token as unknown)] });
  }
  return (_target, context: Context) => {
    if (
      typeof context !== 'object' ||
      context === null ||
      typeof (context as { kind?: unknown }).kind !== 'string'
    ) {
      throw invalid('legacy-decorators');
    }
    if (context.kind === 'class') {
      recordClass(context.metadata, tokens);
      return;
    }
    if (context.kind !== 'method')
      throw invalid('bad-target', {
        detail: [String((context as { kind: string }).kind)],
      });
    const method = keyName(context.name);
    if (context.private) throw invalid('private-method', { method });
    if (context.static) throw invalid('static-method', { method });
    if (EXCLUDED_KEYS.has(context.name))
      throw invalid('bad-target', { method });
    recordMethod(context.metadata, context.name, tokens);
  };
}
