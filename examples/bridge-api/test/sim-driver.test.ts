import { Nexus } from '@nexusdi/core';
import { SHIP_STATE } from '@nexusdi/meridian-systems';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SIM_DRIVER } from '../src/ship/contracts';
import { offlineMeridian } from '../src/ship/meridian';

const sim = { seed: 7, dt: 0.5 };

describe('SimDriver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('advances a live ship one tick per dt of wall time', async () => {
    await using ship = await Nexus.create(
      offlineMeridian({ sim, mode: 'live' }),
    );
    const state = ship.get(SHIP_STATE);
    expect(state.snapshot().tick).toBe(0);
    vi.advanceTimersByTime(500);
    expect(state.snapshot().tick).toBe(1);
    vi.advanceTimersByTime(1500);
    expect(state.snapshot().tick).toBe(4);
  });

  it('starts no timer on a manual ship and advances it by hand', async () => {
    await using ship = await Nexus.create(
      offlineMeridian({ sim, mode: 'manual' }),
    );
    expect(vi.getTimerCount()).toBe(0);
    const driver = ship.get(SIM_DRIVER);
    expect(driver.mode).toBe('manual');
    expect(driver.advance(3).tick).toBe(3);
    expect(ship.get(SHIP_STATE).snapshot().tick).toBe(3);
  });

  it('clears the live timer when the ship is disposed', async () => {
    const ship = await Nexus.create(offlineMeridian({ sim, mode: 'live' }));
    expect(vi.getTimerCount()).toBe(1);
    await ship[Symbol.asyncDispose]();
    expect(vi.getTimerCount()).toBe(0);
  });
});
