import { Nexus } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import { meridianSystems } from '../src/meridian-systems.module';
import { COMMAND_DESK } from '../src/simulation/commands';
import { TICK_LOOP } from '../src/simulation/contracts';
import { ATMOSPHERE_PROBE } from '../src/systems/life-support/contracts';
import {
  BLAST_DOORS,
  FIRE_SUPPRESSION,
  MASTER_ALARM,
} from '../src/systems/safety/contracts';

const options = { seed: 7, dt: 0.5 };

describe('Safety', () => {
  it('passes the check', () => {
    expect(() => Nexus.check(meridianSystems(options))).not.toThrow();
  });

  it('shows the root its panels, its master alarm and the probe it reads', async () => {
    await using ship = await Nexus.create(meridianSystems(options));
    expect(ship.get(BLAST_DOORS)).toBeDefined();
    expect(ship.get(FIRE_SUPPRESSION)).toBeDefined();
    expect(ship.get(MASTER_ALARM).active()).toEqual([]);
    expect(ship.get(ATMOSPHERE_PROBE)).toBeDefined();
  });

  it('answers a safety command through the desk and opens the door on the next tick', async () => {
    await using ship = await Nexus.create(meridianSystems(options));
    const answer = ship.get(COMMAND_DESK).submit({
      system: 'safety',
      action: 'open',
      door: 'bridge-habitat',
    });
    expect(answer).toEqual({ tick: 1 });
    const next = ship.get(TICK_LOOP).advance(1);
    expect(next.setpoints.safety.doors['bridge-habitat']).toBe(true);
  });
});
