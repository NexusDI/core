import { describe, expect, it, vi } from 'vitest';

import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from '../runtime/nexus.js';

describe('R02', () => {
  it('resolves a diamond of factory providers and builds the shared root once', async () => {
    const BASE = new Token<{ id: number }>('Base');
    const LEFT = new Token<{ base: object }>('Left');
    const RIGHT = new Token<{ base: object }>('Right');
    const TOP = new Token<{ left: object; right: object }>('Top');
    const base = vi.fn(async () => ({ id: 7 }));
    const Diamond = defineModule({
      name: 'Diamond',
      providers: [
        provide(TOP, {
          useFactory: async (left, right) => ({ left, right }),
          deps: [LEFT, RIGHT],
        }),
        provide(LEFT, { useFactory: async (b) => ({ base: b }), deps: [BASE] }),
        provide(RIGHT, {
          useFactory: async (b) => ({ base: b }),
          deps: [BASE],
        }),
        provide(BASE, { useFactory: base, deps: [] }),
      ],
    });

    const ship = await Nexus.create(Diamond);
    const top = ship.get(TOP);

    expect(base).toHaveBeenCalledOnce();
    expect(top.left).toEqual({ base: ship.get(BASE) });
    expect((top.left as { base: object }).base).toBe(
      (top.right as { base: object }).base,
    );
  });
});
