import { Nexus, type TraceEvent } from '@nexusdi/core';
import * as tools from '@nexusdi/devtools';
import { SHIP_STATE } from '@nexusdi/meridian-systems';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { offlineMeridian } from '../src/ship/meridian.module';
import { bridgePlugins } from '../src/ship/plugins';

describe('the ship shutdown', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops the driver and the tick listeners before the reactor scrams', async () => {
    const events: TraceEvent[] = [];
    const ship = await Nexus.create(
      offlineMeridian({ sim: { seed: 7, dt: 0.5 }, mode: 'live' }),
      {
        plugins: bridgePlugins({ trace: (event) => events.push(event), tools }),
      },
    );
    const state = ship.get(SHIP_STATE);
    state.queue({ reactor: { throttle: 1 } });
    vi.advanceTimersByTime(5_000);
    expect(state.snapshot().reactor.level).toBeGreaterThan(0);

    await ship[Symbol.asyncDispose]();

    const order = ['SimDriver', 'MasterAlarm', 'TelemetryFeed', 'ReactorCore'];
    const disposed = events.flatMap((event) =>
      event.type === 'dispose:instance' && order.includes(event.token)
        ? [event.token]
        : [],
    );
    expect(disposed).toEqual(order);
    expect(state.snapshot().reactor.level).toBe(0);
    expect(state.snapshot().setpoints.reactor.throttle).toBe(0);
  });
});
