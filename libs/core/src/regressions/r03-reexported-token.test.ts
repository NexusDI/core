import { describe, expect, it } from 'vitest';

import { defineModule } from '../definitions/define-module.js';
import { provide } from '../definitions/provide.js';
import { Token } from '../definitions/token.js';
import { Nexus } from '../runtime/nexus.js';

describe('R03', () => {
  it("returns the provider's instance for a token re-exported through an imported module", async () => {
    const NAV_CHARTS = new Token<{ plot(): string }>('NavCharts');
    const charts = { plot: () => 'sector-7' };
    const Engineering = defineModule({
      name: 'Engineering',
      providers: [provide(NAV_CHARTS, { useValue: charts })],
      exports: [NAV_CHARTS],
    });
    const Tactical = defineModule({
      name: 'Tactical',
      imports: [Engineering],
      exports: [Engineering],
    });
    const Meridian = defineModule({ name: 'Meridian', imports: [Tactical] });

    const ship = await Nexus.create(Meridian);

    expect(ship.get(NAV_CHARTS)).toBe(charts);
    expect(ship.get(NAV_CHARTS)).not.toBe(NAV_CHARTS);
    expect(ship.get(NAV_CHARTS, { module: Tactical })).toBe(
      ship.get(NAV_CHARTS, { module: Engineering }),
    );
  });
});
