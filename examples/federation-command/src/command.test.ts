import { Nexus, defineModule, provide } from '@nexusdi/core';
import { federation } from '@nexusdi/federation';
import { NAV_CHARTS, type INavCharts } from '@nexusdi/federation-contracts';
import { createTestingContainer } from '@nexusdi/testing';
import { describe, expect, it } from 'vitest';

import { BRIDGE, Bridge } from './bridge';
import { Command } from './command.module';

const fakeCharts: INavCharts = { plot: (to) => ({ to, heading: 42 }) };

/** What the shell's Tactical gives a loaded remote: a global NAV_CHARTS. */
const Tactical = defineModule({
  name: 'Tactical',
  providers: [provide(NAV_CHARTS, { useValue: fakeCharts })],
  exports: [NAV_CHARTS],
  global: true,
});

const Meridian = defineModule({
  name: 'Meridian',
  imports: [Tactical, Command],
});

describe('Command', () => {
  it('builds Bridge, whose @Inject accessor reads the contract charts', async () => {
    await using ship = await createTestingContainer(Meridian).create();
    const bridge = ship.get(BRIDGE);
    expect(bridge).toBeInstanceOf(Bridge);
    expect(bridge.course('Kepler-442b')).toBe(
      'course to Kepler-442b, heading 42',
    );
  });

  it('passes Nexus.check with federation()', () => {
    expect(() =>
      Nexus.check(Meridian, { plugins: [federation()] }),
    ).not.toThrow();
  });
});
