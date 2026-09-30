import { Token } from '@nexusdi/core';
import { describe, it } from 'vitest';

import { interceptor } from './options.js';
import type { Interceptor, InterceptorsOptions } from './types.js';

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

describe('InterceptorsOptions', () => {
  it('takes injection tokens in exempt', () => {
    const options: InterceptorsOptions = {
      register: [AuditInterceptor],
      global: [AUDIT],
      exempt: [PREFIX, AuditInterceptor],
    };
    const bad: InterceptorsOptions = {
      register: [AuditInterceptor],
      // @ts-expect-error exempt takes tokens
      exempt: ['Prefix'],
    };
    return [options, bad];
  });
});
