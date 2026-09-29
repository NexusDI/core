import { describe, it } from 'vitest';

import { defineModule } from './define-module.js';
import { provide } from './provide.js';
import { Token } from './token.js';

const CHARTS = new Token<string>('Charts');
class Client {}
class AsyncInit {
  async onInit() {}
}

describe('provide', () => {
  it('accepts eager: false on a sync singleton and a sync scoped factory', () => {
    provide(Client, { eager: false });
    provide(CHARTS, {
      useFactory: () => 'x',
      lifetime: 'scoped',
      eager: false,
    });
  });

  it('rejects eager: false where the build must be awaited', () => {
    // @ts-expect-error an async factory cannot wait for its first get()
    provide(CHARTS, { useFactory: async () => 'x', eager: false });
    // @ts-expect-error an async onInit cannot wait for its first get()
    provide(AsyncInit, { eager: false });
    // @ts-expect-error a transient has no eager
    provide(Client, { lifetime: 'transient', eager: false });
  });
});

describe('defineModule', () => {
  it('accepts eager: false on a sync literal', () => {
    defineModule({
      name: 'Data',
      providers: [
        { token: Client, eager: false },
        { token: CHARTS, useFactory: () => 'x', eager: false },
        {
          token: CHARTS,
          useFactory: () => 'x',
          lifetime: 'scoped',
          eager: false,
        },
      ],
    });
  });

  it('rejects eager: false on a literal whose build must be awaited', () => {
    defineModule({
      name: 'Data',
      providers: [
        // @ts-expect-error an async factory cannot wait for its first get()
        { token: CHARTS, useFactory: async () => 'x', eager: false },
      ],
    });
    defineModule({
      name: 'Data',
      // @ts-expect-error an async onInit cannot wait for its first get()
      providers: [{ token: AsyncInit, eager: false }],
    });
    defineModule({
      name: 'Data',
      providers: [
        // @ts-expect-error a transient has no eager
        { token: Client, lifetime: 'transient', eager: false },
      ],
    });
  });
});
