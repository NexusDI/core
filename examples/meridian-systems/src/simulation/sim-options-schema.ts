import type { StandardSchemaV1 } from '@nexusdi/core';

import type { SimOptions } from './contracts';

const UINT32_MAX = 0xffff_ffff;

const shown = (value: unknown) =>
  typeof value === 'string' ? JSON.stringify(value) : String(value);

/**
 * Checks the options `Simulation.forRoot()` takes. The container runs it at
 * create and rejects with `NEXUS_PROVIDER_FAILED`, whose cause is
 * `NEXUS_INVALID_MODULE_OPTIONS`. The cause's issues name each refused
 * field, its value and the accepted range. `SeededRandom` reads
 * the seed with `>>> 0`, so a fraction or a seed outside the uint32 range
 * would run as another seed (1.5 as 1, -1 as 4294967295).
 */
export const SIM_OPTIONS_SCHEMA: StandardSchemaV1<unknown, SimOptions> = {
  '~standard': {
    version: 1,
    vendor: 'meridian-systems',
    validate(value) {
      if (typeof value !== 'object' || value === null) {
        return {
          issues: [
            { message: `expected an object { seed, dt }, got ${shown(value)}` },
          ],
        };
      }
      const { seed, dt } = value as Record<string, unknown>;
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
      return issues.length > 0
        ? { issues }
        : { value: { seed, dt } as SimOptions };
    },
  },
};
