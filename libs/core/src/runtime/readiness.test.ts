import { describe, expect, it } from 'vitest';

import { Slots } from './readiness.js';

describe('Slots', () => {
  it('holds an in-flight promise that is built but not settled', () => {
    const slots = new Slots();
    const pending = Promise.resolve(1);
    slots.begin('p0', pending);
    expect(slots.has('p0')).toBe(true);
    expect(slots.isSettled('p0')).toBe(false);
    expect(slots.value('p0')).toBe(pending);
  });

  it('keeps a falsy settled value distinguishable from an empty slot', () => {
    const slots = new Slots();
    slots.settle('p0', undefined);
    slots.settle('p1', 0);
    expect(slots.has('p0')).toBe(true);
    expect(slots.isSettled('p0')).toBe(true);
    expect(slots.value('p1')).toBe(0);
    expect(slots.has('p2')).toBe(false);
  });

  it('marks readiness apart from settling', () => {
    const slots = new Slots();
    slots.settle('p0', {});
    expect(slots.isReady('p0')).toBe(false);
    slots.markReady('p0');
    expect(slots.isReady('p0')).toBe(true);
  });

  it('forgets every trace of an abandoned provider', () => {
    const slots = new Slots();
    slots.settle('p0', {});
    slots.markReady('p0');
    slots.abandon('p0');
    expect([
      slots.has('p0'),
      slots.isSettled('p0'),
      slots.isReady('p0'),
    ]).toEqual([false, false, false]);
  });
});
