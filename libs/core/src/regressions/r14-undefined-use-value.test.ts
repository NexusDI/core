import { describe, expect, it } from 'vitest';

import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from '../runtime/nexus.js';

describe('R14', () => {
  it('accepts undefined as a useValue and resolves it', async () => {
    const CALLSIGN = new Token<string | undefined>('Callsign');
    const HAIL = new Token<string | undefined>('Hail');
    const ship = await Nexus.create(
      defineModule({
        name: 'Root',
        providers: [
          provide(CALLSIGN, { useValue: undefined }),
          { token: HAIL, useValue: undefined },
        ],
      }),
    );
    expect(ship.has(CALLSIGN)).toBe(true);
    expect(ship.get(CALLSIGN)).toBeUndefined();
    expect(ship.has(HAIL)).toBe(true);
    expect(ship.get(HAIL)).toBeUndefined();
  });
});
