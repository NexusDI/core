import './polyfill/symbol-metadata.js';

import { describeValue, isForeign } from '@nexusdi/core';

import { invalidAt } from './interceptor-error.js';
import {
  EXCLUDED_KEYS,
  isInterceptorToken,
  keyName,
  recordClass,
  recordMethod,
} from './metadata.js';
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
    if (isInterceptorToken(token)) continue;
    const received = isForeign(token)
      ? `${describeValue(token)} from another copy of @nexusdi/core`
      : describeValue(token);
    throw invalidAt(
      'declaration',
      { detail: [received] },
      `@UseInterceptors received ${received}, which is not a token.`,
    );
  }
  return (_target, context: Context) => {
    if (
      typeof context !== 'object' ||
      context === null ||
      typeof (context as { kind?: unknown }).kind !== 'string'
    ) {
      throw invalidAt(
        'legacy-decorators',
        {},
        '@UseInterceptors is a standard decorator, and ran as a legacy one.\n  Fix: remove experimentalDecorators from tsconfig, or use static interceptors.',
      );
    }
    if (context.kind === 'class') {
      recordClass(context.metadata, tokens);
      return;
    }
    if (context.kind !== 'method') {
      const kind = String((context as { kind: string }).kind);
      throw invalidAt(
        'bad-target',
        { detail: [kind] },
        `@UseInterceptors goes on a class or a method, and was placed on a ${kind}.`,
      );
    }
    const method = keyName(context.name);
    if (context.private)
      throw invalidAt(
        'private-method',
        { method },
        `@UseInterceptors cannot wrap the private method ${method}.`,
      );
    if (context.static)
      throw invalidAt(
        'static-method',
        { method },
        `@UseInterceptors cannot wrap the static method ${method}.`,
      );
    if (EXCLUDED_KEYS.has(context.name))
      throw invalidAt(
        'bad-target',
        { method },
        `${method} is never intercepted, since the container calls it.`,
      );
    recordMethod(context.metadata, context.name, tokens);
  };
}
