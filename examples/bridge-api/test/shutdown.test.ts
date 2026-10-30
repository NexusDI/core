import { type TraceEvent } from '@nexusdi/core';
import * as tools from '@nexusdi/devtools';
import { SHIP_STATE, SUBSPACE_LINK } from '@nexusdi/meridian-systems';
import { createTestingContainer } from '@nexusdi/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_RELAY_URL, meridian } from '../src/ship/meridian.module';
import { bridgePlugins } from '../src/ship/plugins';
import { FixedLink } from './doubles';

describe('the ship shutdown', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops the driver and the tick listeners, signs off with the relay, and then the reactor scrams', async () => {
    const events: TraceEvent[] = [];
    const ship = await createTestingContainer(
      meridian(DEFAULT_RELAY_URL, { sim: { seed: 7, dt: 0.5 }, mode: 'live' }),
    )
      .override(SUBSPACE_LINK, { useClass: FixedLink })
      .create({
        plugins: bridgePlugins({ trace: (event) => events.push(event), tools }),
      });
    const link = ship.get(SUBSPACE_LINK) as FixedLink;
    const state = ship.get(SHIP_STATE);
    state.queue({ reactor: { throttle: 1 } });
    vi.advanceTimersByTime(5_000);
    expect(state.snapshot().reactor.level).toBeGreaterThan(0);

    await ship[Symbol.asyncDispose]();

    const order = [
      'SimDriver',
      'MasterAlarm',
      'TelemetryFeed',
      'CommsArray',
      'ReactorCore',
    ];
    const disposed = events.flatMap((event) =>
      event.type === 'dispose:instance' && order.includes(event.token)
        ? [event.token]
        : [],
    );
    expect(disposed).toEqual(order);
    expect(link.signOffs).toHaveLength(1);
    expect(link.signOffs[0].output).toBeGreaterThan(0);
    expect(state.snapshot().reactor.level).toBe(0);
    expect(state.snapshot().setpoints.reactor.throttle).toBe(0);
  });
});
