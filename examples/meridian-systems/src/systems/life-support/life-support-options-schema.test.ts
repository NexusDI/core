import { defineModule, Nexus } from '@nexusdi/core';
import { describe, expect, it } from 'vitest';

import calibration from '../../../deck/sensors.calibration.json';
import { Simulation } from '../../simulation/simulation.module';

import type { LifeSupportOptions } from './contracts';
import { LIFE_SUPPORT_RATINGS } from './life-support-model';
import { LifeSupport } from './life-support.module';

const GOOD: LifeSupportOptions = {
  calibration,
  ratings: LIFE_SUPPORT_RATINGS,
};

/** What `Nexus.create` refuses with when `LifeSupport.forRoot(options)` fails its schema. */
async function refusal(options: unknown) {
  return Nexus.create(
    defineModule({
      name: 'Ship',
      imports: [
        Simulation.forRoot({ seed: 7, dt: 0.5 }),
        LifeSupport.forRoot(options as never),
      ],
    }),
  ).then(
    () => undefined,
    (refused: unknown) => refused,
  );
}

/** `GOOD` with `patch` merged into the object at `key`. */
const patched = (key: 'calibration' | 'ratings', patch: object) => ({
  ...GOOD,
  [key]: { ...GOOD[key], ...patch },
});

describe('the LifeSupport options schema', () => {
  it.each([
    ['calibration', { ...GOOD, calibration: 'file' }, ['calibration']],
    ['ratings', { calibration }, ['ratings']],
    [
      'a resolution of zero',
      patched('calibration', { resolution: { temperature: 0, pressure: 1 } }),
      ['calibration', 'resolution', 'temperature'],
    ],
    [
      'a resolution that is a string',
      patched('calibration', {
        resolution: { temperature: 0.01, pressure: '1' },
      }),
      ['calibration', 'resolution', 'pressure'],
    ],
    [
      'a negative noise',
      patched('calibration', {
        compartments: {
          bridge: { noise: { temperature: -1, pressure: 20, partial: 5 } },
        },
      }),
      ['calibration', 'compartments', 'bridge', 'noise', 'temperature'],
    ],
    [
      'a compartment with no noise',
      patched('calibration', { compartments: { bridge: {} } }),
      ['calibration', 'compartments', 'bridge', 'noise'],
    ],
    [
      'a heater gain that is NaN',
      patched('ratings', {
        heater: { ...LIFE_SUPPORT_RATINGS.heater, gain: Number.NaN },
      }),
      ['ratings', 'heater', 'gain'],
    ],
    [
      'a scrubber humidity above 1',
      patched('ratings', {
        scrubber: { ...LIFE_SUPPORT_RATINGS.scrubber, humidity: 1.5 },
      }),
      ['ratings', 'scrubber', 'humidity'],
    ],
    [
      'a pump efficiency above 1',
      patched('ratings', {
        pump: { ...LIFE_SUPPORT_RATINGS.pump, efficiency: 2 },
      }),
      ['ratings', 'pump', 'efficiency'],
    ],
    [
      'a missing vent',
      patched('ratings', { vent: undefined }),
      ['ratings', 'vent'],
    ],
    [
      'an unknown rating',
      patched('ratings', { turbine: { rate: 1 } }),
      ['ratings'],
    ],
  ])('refuses %s at create', async (_what, options, path) => {
    expect(await refusal(options)).toMatchObject({
      code: 'NEXUS_PROVIDER_FAILED',
      token: 'LifeSupportOptions',
      cause: {
        code: 'NEXUS_INVALID_MODULE_OPTIONS',
        module: 'LifeSupport',
        issues: [{ path }],
      },
    });
  });
});
