import { describe, expect } from 'vitest';

import { TICK_LOOP } from '../src/simulation/contracts';
import { TELEMETRY } from '../src/telemetry/contracts';

import { test } from './fixtures';
import { RecordingTelemetrySink } from './support';

describe('Telemetry', () => {
  test('streams a frame at subscribe and after each tick', ({ nexus }) => {
    // src/telemetry/snapshot-feed.test.ts covers the rounding.
    const sink = new RecordingTelemetrySink();
    nexus.get(TELEMETRY).subscribe(sink);
    nexus.get(TICK_LOOP).advance(2);
    expect(sink.frames).toEqual([0, 1, 2]);
  });

  test('gives one feed for the container', ({ nexus }) => {
    expect(nexus.get(TELEMETRY)).toBe(nexus.get(TELEMETRY));
  });

  test('closes the open sinks when the container disposes', async ({
    nexus,
  }) => {
    const sink = new RecordingTelemetrySink();
    nexus.get(TELEMETRY).subscribe(sink);
    await nexus[Symbol.asyncDispose]();
    expect(sink.closed).toEqual(['ship offline']);
  });
});
