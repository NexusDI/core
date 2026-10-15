import type { ModuleRef } from '@nexusdi/core';
import { createTestingContainer } from '@nexusdi/testing';

import type {
  NexusFixtureMap,
  NexusFixtures,
  NexusFixturesOptions,
  NexusSetupStep,
} from './types.js';

export type {
  NexusFixtureMap,
  NexusFixtures,
  NexusFixturesOptions,
  NexusSetupStep,
};

/**
 * Returns the NexusDI fixture map for `test.extend`: a testing container of
 * `root` built through the setup steps, and a scope of it, each built on
 * first use and disposed when the test, or the file, ends.
 */
export function nexusFixtures(
  root: ModuleRef,
  options: NexusFixturesOptions = {},
): NexusFixtureMap {
  const scope = options.containerScope ?? 'test';
  const steps: readonly NexusSetupStep[] =
    options.setup === undefined ? [] : [options.setup];
  return {
    nexusSetup: [steps, { scope }],
    // The package compiles against core's empty NexusRequest, which a
    // function satisfies, so Vitest's Fixture type takes only a factory here.
    // eslint-disable-next-line no-empty-pattern -- Vitest reads a fixture's dependencies from its first parameter, which must be a destructuring pattern
    nexusRequest: [async ({}, use) => use(undefined), { scope: 'test' }],
    nexus: [
      async ({ nexusSetup }, use) => {
        const builder = nexusSetup.reduce(
          (current, step) => step(current),
          createTestingContainer(root),
        );
        await using ship = await builder.create(options.create);
        await use(ship);
      },
      { scope },
    ],
    nexusScope: async ({ nexus, nexusRequest }, use) => {
      await using scope = await nexus.createScope({ request: nexusRequest });
      await use(scope);
    },
  };
}
