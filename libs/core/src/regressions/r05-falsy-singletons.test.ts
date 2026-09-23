import { describe, expect, it, vi } from 'vitest';

import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from '../runtime/nexus.js';

describe('R05', () => {
  it("builds a singleton whose value is 0, '', false, null or undefined exactly once", async () => {
    const values = [0, '', false, null, undefined] as const;
    const cases = values.map((value, i) => ({
      token: new Token<unknown>(`Falsy${i}`),
      factory: vi.fn(() => value),
      value,
    }));
    const ship = await Nexus.create(
      defineModule({
        name: 'Falsy',
        providers: cases.map(({ token, factory }) =>
          provide(token, { useFactory: factory, deps: [] }),
        ),
      }),
    );

    for (const { token, factory, value } of cases) {
      expect(ship.get(token)).toBe(value);
      expect(ship.get(token)).toBe(value);
      expect(factory).toHaveBeenCalledOnce();
    }
  });
});
