import type { TestAPI } from 'vitest';

import type { ModuleRef } from '@nexusdi/core';

import {
  nexusFixtures,
  type NexusFixtures,
  type NexusFixturesOptions,
} from './fixtures.js';

/**
 * `base` with the NexusDI fixtures (nexusSetup, nexusRequest, nexus,
 * nexusScope) over a testing container of `root`.
 *
 * Typed by the `TestAPI` that Vitest 4 and 5 both export, so it needs no
 * type from `@vitest/runner`, which Vitest 5 no longer publishes.
 *
 * @example
 * ```ts
 * export const test = nexusTest(base, Meridian, { setup });
 * ```
 */
export function nexusTest<C extends object>(
  base: TestAPI<C>,
  root: ModuleRef,
  options?: NexusFixturesOptions,
): TestAPI<C & NexusFixtures> {
  return base.extend(
    nexusFixtures(root, options) as never,
  ) as unknown as TestAPI<C & NexusFixtures>;
}
