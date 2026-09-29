import { defineModule, Nexus, provide, Token } from '@nexusdi/core';
import { afterEach, describe, expect, it } from 'vitest';

import { interceptor, interceptors, type Interceptor } from '../index.js';

const AUDIT = new Token<Interceptor>('Audit');
const SERVICE = new Token<{ run(): string }>('Service');

describe('SEC-013 a polluted Object.prototype attaches no interceptor', () => {
  const polluted = ['interceptors', 'class', 'methods'] as const;
  afterEach(() => {
    for (const key of polluted)
      delete (Object.prototype as Record<string, unknown>)[key];
  });

  it('ignores inherited interceptors, class and methods keys', async () => {
    const calls: string[] = [];
    Object.defineProperty(Object.prototype, 'interceptors', {
      value: { class: [AUDIT] },
      configurable: true,
      writable: true,
    });
    Object.defineProperty(Object.prototype, 'class', {
      value: [AUDIT],
      configurable: true,
      writable: true,
    });
    Object.defineProperty(Object.prototype, 'methods', {
      value: { run: [AUDIT] },
      configurable: true,
      writable: true,
    });
    class Service {
      run() {
        return 'ran';
      }
    }
    await using ship = await Nexus.create(
      defineModule({
        name: 'App',
        providers: [provide(SERVICE, { useClass: Service })],
        exports: [SERVICE],
      }),
      {
        plugins: [
          interceptors({
            register: [
              interceptor(AUDIT, {
                useValue: {
                  intercept: (_c, next) => (calls.push('audit'), next()),
                },
              }),
            ],
          }),
        ],
      },
    );
    expect(ship.get(SERVICE).run()).toBe('ran');
    expect(calls).toEqual([]);
  });
});
