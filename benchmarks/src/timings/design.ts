import { blockSize } from '@nexusdi/bench-kit';

import type { Design } from '../schema.ts';

/** The design block a timing file records: counts from the run, the rest fixed. */
export function design(warmup: number, measured: number): Design {
  return {
    order: 'williams',
    warmup,
    measured,
    bootstrap: {
      resamples: 10000,
      block: blockSize(measured),
      prng: 'mulberry32',
    },
  };
}
