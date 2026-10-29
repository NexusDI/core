import type { StandardSchemaV1 } from '@nexusdi/core';

import { optionsSchema, shown } from '../options-schema';

import type { IShipFiles, SimOptions } from './contracts';

const UINT32_MAX = 0xffff_ffff;

/**
 * Checks the options `Simulation.forRoot()` takes. The container runs it at
 * create and rejects with `NEXUS_PROVIDER_FAILED`, whose cause is
 * `NEXUS_INVALID_MODULE_OPTIONS`. The cause's issues name each refused
 * field, its value and the accepted range. `SeededRandom` reads
 * the seed with `>>> 0`, so a fraction or a seed outside the uint32 range
 * would run as another seed (1.5 as 1, -1 as 4294967295).
 */
export const SIM_OPTIONS_SCHEMA: StandardSchemaV1<unknown, SimOptions> =
  optionsSchema(
    '{ seed, dt, files? }',
    ({ seed, dt, files }) => {
      const issues: StandardSchemaV1.Issue[] = [];
      if (
        typeof seed !== 'number' ||
        !Number.isInteger(seed) ||
        seed < 0 ||
        seed > UINT32_MAX
      ) {
        issues.push({
          path: ['seed'],
          message: `expected a whole number from 0 to ${UINT32_MAX} (uint32), got ${shown(seed)}`,
        });
      }
      if (typeof dt !== 'number' || !Number.isFinite(dt) || dt <= 0) {
        issues.push({
          path: ['dt'],
          message: `expected a positive finite number of ship seconds, got ${shown(dt)}`,
        });
      }
      if (files !== undefined && !isShipFiles(files)) {
        issues.push({
          path: ['files'],
          message: `expected an object with a read(name) method, got ${shown(files)}`,
        });
      }
      return issues;
    },
    ({ seed, dt, files }) =>
      (files === undefined ? { seed, dt } : { seed, dt, files }) as SimOptions,
  );

/** True when `value` has the `read` method of `IShipFiles`. */
function isShipFiles(value: unknown): value is IShipFiles {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { read?: unknown }).read === 'function'
  );
}
