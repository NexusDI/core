import { Nexus } from '@nexusdi/core';
import { federation } from '@nexusdi/federation';
import {
  COMMAND_LINK,
  NAV_CHARTS,
  TELEMETRY_FEED,
  type TelemetryReading,
} from '@nexusdi/federation-contracts';
import type { ShipReading } from '@nexusdi/meridian-systems';
import { describe, expect, expectTypeOf, it } from 'vitest';

import { Meridian } from './meridian';
import { createShip } from './ship';
import { Tactical } from './tactical';

describe('the shell', () => {
  it('passes Nexus.check with federation()', () => {
    expect(() =>
      Nexus.check(Meridian, { plugins: [federation()] }),
    ).not.toThrow();
  });

  it('makes Tactical global, so a loaded remote sees its tokens', () => {
    expect(Tactical.global).toBe(true);
  });

  it("exports the contract's NAV_CHARTS from Tactical", () => {
    expect(Tactical.exports).toContain(NAV_CHARTS);
  });

  it("exports the contract's TELEMETRY_FEED from Tactical", () => {
    expect(Tactical.exports).toContain(TELEMETRY_FEED);
  });

  it("exports the contract's COMMAND_LINK from Tactical", () => {
    expect(Tactical.exports).toContain(COMMAND_LINK);
  });

  it('reads a ship reading as the telemetry reading the stations show', () => {
    expectTypeOf<ShipReading>().toExtend<TelemetryReading>();
  });

  it('plots Kepler-442b at heading 42', async () => {
    await using ship = await createShip();
    expect(ship.get(NAV_CHARTS).plot('Kepler-442b')).toEqual({
      to: 'Kepler-442b',
      heading: 42,
    });
  });
});
