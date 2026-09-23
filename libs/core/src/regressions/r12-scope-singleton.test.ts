import { describe, expect, it } from 'vitest';

import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Nexus } from '../runtime/nexus.js';

describe('R12', () => {
  it('returns the root singleton from a scope', async () => {
    class ReactorCore {}
    class ShipComputer {
      constructor(readonly reactor: ReactorCore) {}
    }
    const ship = await Nexus.create(
      defineModule({
        name: 'Engineering',
        providers: [
          ReactorCore,
          provide(ShipComputer, { deps: [ReactorCore] }),
        ],
      }),
    );
    await using shuttle = await ship.createScope();
    expect(shuttle.get(ShipComputer)).toBe(ship.get(ShipComputer));
    expect(shuttle.get(ReactorCore)).toBe(ship.get(ReactorCore));
  });
});
