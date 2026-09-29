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
      throw invalid(
        'declaration',
        {},
        `@UseInterceptors received ${String(token)}, which is not a Token or a class.`,
      );
  }
  return (_target, context: Context) => {
    if (
      typeof context !== 'object' ||
      context === null ||
      typeof (context as { kind?: unknown }).kind !== 'string'
    ) {
      throw invalid(
        'legacy-decorators',
        {},
        '@UseInterceptors was called as a legacy decorator, and it is a standard (TC39) decorator.\n  Fix: remove experimentalDecorators from tsconfig, or use static interceptors.',
      );
    }
    if (context.kind === 'class') {
      recordClass(context.metadata, tokens);
      return;
    }
    if (context.kind !== 'method')
      throw invalid(
        'bad-target',
        {},
        `@UseInterceptors applies to a class or a method, not a ${String((context as { kind: string }).kind)}.`,
      );
    const method = keyName(context.name);
    if (context.private)
      throw invalid(
        'private-method',
        { method },
        `@UseInterceptors cannot wrap the private method ${method}; a proxy never sees it.`,
      );
    if (context.static)
      throw invalid(
        'static-method',
        { method },
        `@UseInterceptors cannot wrap the static method ${method}; the container builds instances.`,
      );
    if (EXCLUDED_KEYS.has(context.name))
      throw invalid(
        'bad-target',
        { method },
        `${method} is never intercepted: the container calls it itself.`,
      );
    recordMethod(context.metadata, context.name, tokens);
  };
}
