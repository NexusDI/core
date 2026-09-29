import { Token } from '@nexusdi/core';
import { describe, it } from 'vitest';

import { interceptor } from './options.js';
import type { Interceptor } from './types.js';

const AUDIT = new Token<Interceptor>('Audit');
const PREFIX = new Token<string>('Prefix');

class AuditInterceptor implements Interceptor {
  static deps = [PREFIX] as const;
  constructor(readonly prefix: string) {}
  intercept() {
    return undefined;
  }
}
class NotAnInterceptor {}

describe('interceptor()', () => {
  it('types its definition like provide()', () => {
    interceptor(AUDIT, { useClass: AuditInterceptor });
    interceptor(AUDIT, { useValue: { intercept: (_call, next) => next() } });
    interceptor(AUDIT, {
      deps: [PREFIX],
      useFactory: (prefix) => ({
        intercept: (_call, next) => (prefix ? next() : next()),
      }),
    });
    // @ts-expect-error the class does not implement Interceptor
    interceptor(AUDIT, { useClass: NotAnInterceptor });
  });
});
