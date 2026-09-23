import { describe, expect, it } from 'vitest';

import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from '../runtime/nexus.js';

describe('R11', () => {
  it('keeps two providers for one class registered under two tokens, and one instance through useExisting', async () => {
    class ConsoleLogger {}
    const A = new Token<ConsoleLogger>('LoggerA');
    const B = new Token<ConsoleLogger>('LoggerB');
    const C = new Token<ConsoleLogger>('LoggerC');

    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(A, { useClass: ConsoleLogger }),
          provide(B, { useClass: ConsoleLogger }),
          provide(C, { useExisting: A }),
        ],
      }),
    );

    expect(ship.get(A)).not.toBe(ship.get(B));
    expect(ship.get(C)).toBe(ship.get(A));
  });
});
