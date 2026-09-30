import { describe, expect, it } from 'vitest';

import { compareVersions, newerPins } from './competitor-releases.ts';

const pins = [{ package: 'awilix', version: '13.0.5' }];

describe('newerPins', () => {
  it('opens nothing when the pin is the latest', () => {
    expect(newerPins(pins, { awilix: '13.0.5' })).toEqual([]);
  });
  it('titles one issue for a newer release', () => {
    expect(newerPins(pins, { awilix: '13.1.0' })).toEqual([
      {
        package: 'awilix',
        version: '13.1.0',
        title: 'benchmarks: awilix 13.1.0 released',
      },
    ]);
  });
  it('ignores an older latest, which is a registry rollback', () => {
    expect(newerPins(pins, { awilix: '13.0.4' })).toEqual([]);
  });
});

describe('compareVersions', () => {
  it('orders by number, not text', () => {
    expect(compareVersions('4.10.0', '4.9.9')).toBe(1);
  });
  it('sorts a prerelease before its release', () => {
    expect(compareVersions('0.4.0-rc.1', '0.4.0')).toBe(-1);
  });
});
