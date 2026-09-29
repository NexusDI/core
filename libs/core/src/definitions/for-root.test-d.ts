import { describe, expectTypeOf, it } from 'vitest';

import { defineModule } from './define-module.js';
import { Token } from './token.js';

const OPTIONS = new Token<{ frequency: number }>('CommsOptions');
const LINK = new Token<{ band: string }>('Link');
const Comms = defineModule({ name: 'Comms', options: OPTIONS });

describe('forRoot', () => {
  it('checks the value against the options type', () => {
    Comms.forRoot({ frequency: 1 });
    // @ts-expect-error a string is not a number
    Comms.forRoot({ frequency: '1' });
  });
});

describe('forRootAsync', () => {
  it('types the factory parameters from deps', () => {
    Comms.forRootAsync({
      useFactory: (link) => {
        expectTypeOf(link).toEqualTypeOf<{ band: string }>();
        return { frequency: link.band.length };
      },
      deps: [LINK],
    });
    // @ts-expect-error the factory returns the wrong shape
    Comms.forRootAsync({ useFactory: async () => ({ band: 'x' }) });
  });

  it('has no with()', () => {
    // @ts-expect-error with() is gone
    Comms.with;
  });
});
