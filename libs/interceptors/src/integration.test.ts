import { defineModule, Nexus, provide, Token } from '@nexusdi/core';
import { errors, explain } from '@nexusdi/errors';
import { createTestingContainer } from '@nexusdi/testing';
import { describe, expect, it } from 'vitest';

import { findCode, rejected, thrown } from '../test-support/catch.js';
import {
  interceptor,
  interceptors,
  UseInterceptors,
  type CallContext,
  type Interceptor,
  type Next,
} from './index.js';

interface IGreeter {
  greet(name: string): string;
}
const GREETER = new Token<IGreeter>('Greeter');
const SHOUT = new Token<Interceptor>('Shout');

class ShoutInterceptor implements Interceptor {
  intercept(_call: CallContext, next: Next) {
    return String(next()).toUpperCase();
  }
}

@UseInterceptors(SHOUT)
class Greeter implements IGreeter {
  greet(name: string): string {
    return `hello ${name}`;
  }
}

const App = defineModule({
  name: 'App',
  providers: [provide(GREETER, { useClass: Greeter })],
  exports: [GREETER],
});
const plugin = () =>
  interceptors({
    register: [interceptor(SHOUT, { useClass: ShoutInterceptor })],
  });

describe('integration', () => {
  it('reads @UseInterceptors on a class built through useClass', async () => {
    await using ship = await Nexus.create(App, { plugins: [plugin()] });
    expect(ship.get(GREETER).greet('ada')).toBe('HELLO ADA');
  });

  it('lets @nexusdi/testing override an interceptor', async () => {
    const ship = await createTestingContainer(App)
      .override(SHOUT, { useValue: { intercept: (_call, next) => next() } })
      .create({ plugins: [plugin()] });
    await using _ = ship;
    expect(ship.get(GREETER).greet('ada')).toBe('hello ada');
  });

  it('keeps NEXUS_OVERRIDE_UNUSED for a token no module provides', async () => {
    const TYPO = new Token<Interceptor>('Typo');
    const error = await rejected(
      createTestingContainer(App)
        .override(TYPO, { useValue: { intercept: (_call, next) => next() } })
        .create({ plugins: [plugin()] }),
    );
    expect(findCode(error, 'NEXUS_OVERRIDE_UNUSED')).toBeDefined();
  });

  it('gets the full text of a check-time error from errors()', async () => {
    const TYPO = new Token<Interceptor>('Typo');
    const error = await rejected(
      Nexus.create(App, {
        plugins: [
          errors(),
          interceptors({
            register: [interceptor(SHOUT, { useClass: ShoutInterceptor })],
            global: [TYPO],
          }),
        ],
      }),
    );
    expect(findCode(error, 'NEXUS_INTERCEPTOR_MISSING')?.message).toBe(
      '[NEXUS_INTERCEPTOR_MISSING] a global entry or binding uses the interceptor Typo, which is not registered.\n  Fix: add Typo to interceptors({ register }).',
    );
  });

  it('gets the full text of an error raised outside a container from explain()', () => {
    const error = findCode(
      thrown(() => interceptors({ register: [] })),
      'NEXUS_INTERCEPTOR_INVALID',
    );
    expect(error?.message).toBe(
      '[NEXUS_INTERCEPTOR_INVALID] reason=options detail=register-empty. https://nexus.js.org/errors/NEXUS_INTERCEPTOR_INVALID',
    );
    expect(explain(error as never)?.message).toBe(
      'interceptors(): register must list an interceptor.',
    );
  });

  it('leaves a decorated class inert without the plugin', async () => {
    await using ship = await Nexus.create(App);
    expect(ship.get(GREETER).greet('ada')).toBe('hello ada');
  });
});
