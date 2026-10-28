import * as z from 'zod/mini';

import { shown } from '../../options-schema';

/** The refusal text of a field: what it accepts, then the value it got. */
const refusing = (accepted: string) => (issue: { readonly input?: unknown }) =>
  `expected ${accepted}, got ${shown(issue.input)}`;

const POSITIVE = refusing('a positive finite number');
const NON_NEGATIVE = refusing('a finite number of zero or more');
const FRACTION = refusing('a number from 0 to 1');

const positive = () =>
  z.number({ error: POSITIVE }).check(z.positive({ error: POSITIVE }));

const nonNegative = () =>
  z
    .number({ error: NON_NEGATIVE })
    .check(z.minimum(0, { error: NON_NEGATIVE }));

const fraction = () =>
  z
    .number({ error: FRACTION })
    .check(
      z.minimum(0, { error: FRACTION }),
      z.maximum(1, { error: FRACTION }),
    );

const NOISE = z.strictObject({
  temperature: nonNegative(),
  pressure: nonNegative(),
  partial: nonNegative(),
});

/** The shape of `deck/sensors.calibration.json`. */
const SENSOR_CALIBRATION = z.strictObject({
  resolution: z.strictObject({
    temperature: positive(),
    pressure: positive(),
  }),
  compartments: z.record(z.string(), z.strictObject({ noise: NOISE })),
});

const RATINGS = z.strictObject({
  heater: z.strictObject({ gain: positive(), max: positive() }),
  scrubber: z.strictObject({
    flow: positive(),
    power: positive(),
    humidity: fraction(),
  }),
  electrolyser: z.strictObject({
    gain: positive(),
    max: positive(),
    energy: positive(),
    setpoint: positive(),
  }),
  pump: z.strictObject({
    rate: positive(),
    base: nonNegative(),
    efficiency: fraction(),
    maxRise: positive(),
  }),
  vent: z.strictObject({ area: positive() }),
});

/**
 * The options `LifeSupport.forRoot()` and `LifeSupport.forRootAsync()` take,
 * checked on the value `forRoot()` gets and on the factory's result. The
 * container runs it at create and rejects with
 * `NEXUS_PROVIDER_FAILED`, whose cause is `NEXUS_INVALID_MODULE_OPTIONS`.
 * Every rating and noise figure is finite and in the range its law divides
 * or scales by, since a NaN or a zero gain would run as a silent wrong
 * atmosphere. A key outside the shape is refused.
 */
export const LIFE_SUPPORT_OPTIONS_SCHEMA = z.strictObject({
  calibration: SENSOR_CALIBRATION,
  ratings: RATINGS,
});
