import { Nexus } from '@nexusdi/core';
import { describe, expect } from 'vitest';

import { meridianSystems } from '../src/meridian-systems.module';
import { TICK_LOOP } from '../src/simulation/contracts';
import { TELEMETRY, type TelemetrySink } from '../src/telemetry/contracts';

import { test } from './fixtures';

function recordingSink() {
  const frames: number[] = [];
  const closed: string[] = [];
  const sink: TelemetrySink = {
    // src/telemetry/snapshot-feed.test.ts covers the rounding.
    next: (frame) => frames.push(frame.tick),
    close: (reason) => closed.push(reason),
  };
  return { sink, frames, closed };
}

describe('Telemetry', () => {
  test('streams a frame at subscribe and after each tick', ({ nexus }) => {
    const { sink, frames } = recordingSink();
    nexus.get(TELEMETRY).subscribe(sink);
    nexus.get(TICK_LOOP).advance(2);
    expect(frames).toEqual([0, 1, 2]);
  });

  test('gives one feed for the container', ({ nexus }) => {
    expect(nexus.get(TELEMETRY)).toBe(nexus.get(TELEMETRY));
  });

  test('closes the open sinks when the container disposes', async () => {
    const ship = await Nexus.create(meridianSystems({ seed: 7, dt: 0.5 }));
    const { sink, closed } = recordingSink();
    ship.get(TELEMETRY).subscribe(sink);
    await ship[Symbol.asyncDispose]();
    expect(closed).toEqual(['ship offline']);
  });
});
