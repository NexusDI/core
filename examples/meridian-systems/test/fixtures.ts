import { nexusTest } from '@nexusdi/vitest';
import { test as base } from 'vitest';

import { SIM_OPTIONS } from '../src/simulation/contracts';
import { ShipUnderTest } from './ship-under-test';

export const test = nexusTest(base, ShipUnderTest, {
  setup: (builder) =>
    builder.override(SIM_OPTIONS, { useValue: { seed: 7, dt: 0.5 } }),
});
