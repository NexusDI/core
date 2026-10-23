import { Nexus } from '@nexusdi/core';
import { StarCharts } from '@nexusdi/meridian-systems/charts';
import { describe, expect, it } from 'vitest';

import { NAV_CHARTS } from '../app/bridge/contracts';
import { Tactical } from '../app/bridge/tactical';

describe("the console's Tactical", () => {
  it("binds NAV_CHARTS to the library's StarCharts over the bundled table", async () => {
    await using ship = await Nexus.create(Tactical);
    const charts = ship.get(NAV_CHARTS);
    expect(charts).toBeInstanceOf(StarCharts);
    expect(charts.plot('Kepler-442b')).toEqual({
      to: 'Kepler-442b',
      heading: 42,
    });
    expect(charts.has('constructor')).toBe(false);
  });
});
