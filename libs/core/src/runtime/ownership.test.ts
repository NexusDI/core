import { describe, expect, it } from 'vitest';

import { Ownership, isObject } from './ownership.js';

describe('Ownership', () => {
  it('claims an object once', () => {
    const ownership = new Ownership();
    const reactor = {};
    expect(ownership.claim(reactor)).toBe(true);
    expect(ownership.claim(reactor)).toBe(false);
  });

  it('never claims a useValue object or a primitive', () => {
    const ownership = new Ownership();
    const value = {};
    ownership.registerValue(value);
    expect(ownership.claim(value)).toBe(false);
    expect(ownership.claim(0)).toBe(false);
    expect(ownership.claim(undefined)).toBe(false);
  });

  it('claims an object for onInit once and never a useValue object', () => {
    const ownership = new Ownership();
    const computer = {};
    const value = {};
    ownership.registerValue(value);
    expect(ownership.claimInit(computer)).toBe(true);
    expect(ownership.claimInit(computer)).toBe(false);
    expect(ownership.claimInit(value)).toBe(false);
  });

  it('remembers which objects were disposed', () => {
    const ownership = new Ownership();
    const reactor = {};
    ownership.claim(reactor);
    ownership.markDisposed(reactor);
    expect(ownership.isDisposed(reactor)).toBe(true);
    expect(ownership.isDisposed({})).toBe(false);
  });
});

describe('isObject', () => {
  it('accepts objects and functions', () => {
    expect([
      isObject({}),
      isObject(() => 1),
      isObject(null),
      isObject('x'),
    ]).toEqual([true, true, false, false]);
  });
});
