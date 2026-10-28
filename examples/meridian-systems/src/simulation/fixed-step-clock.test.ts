import { describe, expect, it } from 'vitest';

import { FixedStepClock } from './fixed-step-clock';

describe('FixedStepClock', () => {
  it('starts at tick 0 and time 0', () => {
    const clock = new FixedStepClock({ dt: 0.5 });
    expect(clock.dt).toBe(0.5);
    expect(clock.tick).toBe(0);
    expect(clock.time).toBe(0);
  });

  it('returns the new tick from advance()', () => {
    const clock = new FixedStepClock({ dt: 0.5 });
    expect(clock.advance()).toBe(1);
    expect(clock.advance()).toBe(2);
    expect(clock.tick).toBe(2);
  });

  it('reads exactly 300 s after 600 ticks of 0.5 s', () => {
    const clock = new FixedStepClock({ dt: 0.5 });
    for (let i = 0; i < 600; i++) clock.advance();
    expect(clock.time).toBe(300);
  });

  it('computes the time as tick * dt', () => {
    const clock = new FixedStepClock({ dt: 0.1 });
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      clock.advance();
      sum += 0.1;
    }
    expect(sum).not.toBe(1);
    expect(clock.time).toBe(10 * 0.1);
  });
});
