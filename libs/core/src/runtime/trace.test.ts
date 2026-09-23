import { afterEach, describe, expect, it, vi } from 'vitest';

import { Tracer } from './trace.js';

describe('Tracer', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads no clock and builds no event without a sink', () => {
    const clock = vi.spyOn(performance, 'now');
    const make = vi.fn();
    const tracer = new Tracer(undefined);
    expect(tracer.now()).toBe(0);
    tracer.emit(make);
    expect(clock).not.toHaveBeenCalled();
    expect(make).not.toHaveBeenCalled();
  });

  it('hands every event to the sink', () => {
    const events: unknown[] = [];
    const tracer = new Tracer((event) => events.push(event));
    tracer.emit(() => ({
      type: 'dispose',
      disposed: 1,
      errors: 0,
      durationMs: 2,
    }));
    expect(events).toEqual([
      { type: 'dispose', disposed: 1, errors: 0, durationMs: 2 },
    ]);
  });
});
