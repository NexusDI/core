import type { StandardSchemaV1 } from '../src/definitions/standard-schema.js';

/** A hand-written Standard Schema validator: `frequency` must be a number; `band` defaults to 'S'. */
export function frequencySchema(): StandardSchemaV1<
  unknown,
  { frequency: number; band?: string }
> {
  return {
    '~standard': {
      version: 1,
      vendor: 'nexusdi-test',
      validate: (value) => {
        const input = value as { frequency?: unknown; band?: unknown } | null;
        if (typeof input?.frequency !== 'number') {
          return {
            issues: [{ message: 'expected a number', path: ['frequency'] }],
          };
        }
        return {
          value: {
            frequency: input.frequency,
            band: typeof input.band === 'string' ? input.band : 'S',
          },
        };
      },
    },
  };
}
