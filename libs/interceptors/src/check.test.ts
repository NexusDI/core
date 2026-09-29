import { defineModule, Nexus, provide, Token } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { findCode, rejected, thrown } from '../test-support/catch.js';
import { interceptor } from './options.js';
import { interceptors } from './plugin.js';
import type { CallContext, Interceptor, Next } from './types.js';

const AUDIT = new Token<Interceptor>('Audit');
const OTHER = new Token<Interceptor>('Other');
const SERVICE = new Token<object>('Service');

class Pass implements Interceptor {
  intercept(_call: CallContext, next: Next) {
    return next();
  }
}

const app = (cls: new () => object) =>
  defineModule({
    name: 'App',
    providers: [provide(SERVICE, { useClass: cls })],
  });

const errorsOf = (error: unknown): string[] =>
  ((error as { errors?: { code: string }[] }).errors ?? []).map((e) => e.code);

describe('compile.check', () => {
  it('reports a declared interceptor that is not registered, with target and method', async () => {
    class Service {
      static interceptors = { methods: { run: [OTHER] } };
      run() {}
    }
    const error = await rejected(
      Nexus.create(app(Service), {
        plugins: [
          interceptors({ register: [interceptor(AUDIT, { useClass: Pass })] }),
        ],
      }),
    );
    expect(findCode(error, 'NEXUS_INTERCEPTOR_MISSING')).toMatchObject({
      token: 'Other',
      target: 'Service',
      method: 'run',
    });
  });

  it('reports unregistered global and binding tokens', async () => {
    class Service {}
    const error = await rejected(
      Nexus.create(app(Service), {
        plugins: [
          interceptors({
            register: [interceptor(AUDIT, { useClass: Pass })],
            global: [OTHER],
            bindings: [{ token: SERVICE, class: [OTHER] }],
          }),
        ],
      }),
    );
    expect(
      errorsOf(error).filter((c) => c === 'NEXUS_INTERCEPTOR_MISSING'),
    ).toHaveLength(2);
  });

  it('reports a method name that is not a method', async () => {
    class Service {
      static interceptors = { methods: { missing: [AUDIT] } };
    }
    const error = await rejected(
      Nexus.create(app(Service), {
        plugins: [
          interceptors({ register: [interceptor(AUDIT, { useClass: Pass })] }),
        ],
      }),
    );
    expect(findCode(error, 'NEXUS_INTERCEPTOR_INVALID')).toMatchObject({
      reason: 'unknown-method',
      method: 'missing',
    });
  });

  it('reports a malformed declaration and two forms', async () => {
    class Broken {
      static interceptors = { class: 'nope' };
    }
    const error = await rejected(
      Nexus.create(app(Broken), {
        plugins: [
          interceptors({ register: [interceptor(AUDIT, { useClass: Pass })] }),
        ],
      }),
    );
    expect(findCode(error, 'NEXUS_INTERCEPTOR_INVALID')).toMatchObject({
      reason: 'declaration',
      target: 'Broken',
    });
  });

  it('reports a transient interceptor', async () => {
    class Service {}
    const error = await rejected(
      Nexus.create(app(Service), {
        plugins: [
          interceptors({
            register: [
              interceptor(AUDIT, { useClass: Pass, lifetime: 'transient' }),
            ],
          }),
        ],
      }),
    );
    expect(findCode(error, 'NEXUS_INTERCEPTOR_LIFETIME')).toMatchObject({
      token: 'Audit',
    });
  });

  it('reports a scoped interceptor next to core lifetime error', async () => {
    class Service {}
    const error = await rejected(
      Nexus.create(app(Service), {
        plugins: [
          interceptors({
            register: [
              interceptor(AUDIT, { useClass: Pass, lifetime: 'scoped' }),
            ],
          }),
        ],
      }),
    );
    expect(errorsOf(error)).toEqual(
      expect.arrayContaining([
        'NEXUS_LIFETIME_VIOLATION',
        'NEXUS_INTERCEPTOR_LIFETIME',
      ]),
    );
  });

  it('reports through Nexus.check with no build', () => {
    class Service {
      static interceptors = { class: [OTHER] };
    }
    const error = thrown(() =>
      Nexus.check(app(Service), {
        plugins: [
          interceptors({ register: [interceptor(AUDIT, { useClass: Pass })] }),
        ],
      }),
    );
    expect(findCode(error, 'NEXUS_INTERCEPTOR_MISSING')).toBeDefined();
  });

  it('reports a class once when two modules provide it', async () => {
    class Service {
      static interceptors = { class: [OTHER] };
    }
    const TWO = new Token<object>('Two');
    const error = await rejected(
      Nexus.create(
        defineModule({
          name: 'App',
          providers: [
            provide(SERVICE, { useClass: Service }),
            provide(TWO, { useClass: Service }),
          ],
        }),
        {
          plugins: [
            interceptors({
              register: [interceptor(AUDIT, { useClass: Pass })],
            }),
          ],
        },
      ),
    );
    expect(
      errorsOf(error).filter((c) => c === 'NEXUS_INTERCEPTOR_MISSING'),
    ).toHaveLength(1);
  });
});
