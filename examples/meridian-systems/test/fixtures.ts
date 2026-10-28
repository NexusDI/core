import type { ModuleRef } from '@nexusdi/core';
import { type NexusFixturesOptions, nexusTest } from '@nexusdi/vitest';
import { test as base } from 'vitest';

import { SIM_OPTIONS } from '../src/simulation/contracts';

import { ProbeSystems, shipUnderTest } from './ship-under-test';
import { SHIP_OPTIONS } from './support';

/**
 * A test over a testing container of `root` with SIM_OPTIONS set to
 * SHIP_OPTIONS. `create` takes the plugins of the build.
 */
export function shipTest(
  root: ModuleRef,
  create?: NexusFixturesOptions['create'],
) {
  return nexusTest(base, root, {
    create,
    setup: (builder) =>
      builder.override(SIM_OPTIONS, { useValue: SHIP_OPTIONS }),
  });
}

/** A test over the simulation and the telemetry with the probe systems beside them. */
export const test = shipTest(shipUnderTest(ProbeSystems));
