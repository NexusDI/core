import type { Fixtures } from '@vitest/runner';

import type { ModuleRef, Nexus, NexusRequest, Scope } from '@nexusdi/core';
import {
  createTestingContainer,
  type TestingContainerBuilder,
  type TestingCreateOptions,
} from '@nexusdi/testing';

/** One change to the testing container's builder, such as an override. */
export type NexusSetupStep = (
  builder: TestingContainerBuilder,
) => TestingContainerBuilder;

export interface NexusFixtures {
  /** The builder steps, in order. An array, because Vitest runs a function value as a fixture. */
  nexusSetup: readonly NexusSetupStep[];
  /** The request REQUEST resolves to in nexusScope. */
  nexusRequest: NexusRequest | undefined;
  /** A testing container, built on first use and disposed after the test. */
  nexus: Nexus;
  /** A scope of nexus, built on first use and disposed before nexus. */
  nexusScope: Scope;
}

export interface NexusFixturesOptions {
  /** The file's builder step; a suite replaces it with test.override({ nexusSetup: [...] }). */
  readonly setup?: NexusSetupStep;
  /** Passed to the builder's create(): plugins, onInit. */
  readonly create?: TestingCreateOptions;
  /** 'file' shares one container across a file's tests, for a slow onInit. Defaults to 'test'. */
  readonly containerScope?: 'test' | 'file';
}

export function nexusFixtures(
  root: ModuleRef,
  options: NexusFixturesOptions = {},
): Fixtures<NexusFixtures> {
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
