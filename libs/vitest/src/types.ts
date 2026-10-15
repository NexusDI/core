import type { TestAPI } from 'vitest';

import type { Nexus, NexusRequest, Scope } from '@nexusdi/core';
import type {
  TestingContainerBuilder,
  TestingCreateOptions,
} from '@nexusdi/testing';

/** One change to the testing container's builder, such as an override. */
export type NexusSetupStep = (
  builder: TestingContainerBuilder,
) => TestingContainerBuilder;

/** The four fixtures, by name and type: the setup steps, the request, the testing container and a scope of it. */
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

/** The options of `nexusTest` and `nexusFixtures`: the file's setup step, the options of the build and the scope of the container fixture. */
export interface NexusFixturesOptions {
  /** The file's builder step; a suite replaces it with test.override('nexusSetup', [...]). */
  readonly setup?: NexusSetupStep;
  /** Passed to the builder's create(): plugins, onInit. */
  readonly create?: TestingCreateOptions;
  /** 'file' shares one container across a file's tests, for a slow onInit. Defaults to 'test'. */
  readonly containerScope?: 'test' | 'file';
}

/**
 * Vitest's fixture map for NexusFixtures, read from TestAPI so the published
 * types import only `vitest`. Neither Vitest 4.1 nor 5 exports the Fixtures
 * type from `vitest`, and 5 publishes no @vitest/runner. The last overload
 * of TestAPI's `override` is the one that is not generic: it takes
 * `Partial<Fixtures<T>>`, and Parameters reads that last overload. The
 * infer takes Fixtures<T> back out of the Partial alias, so test.extend
 * infers the fixture types from it as it does from Fixtures itself.
 */
type OverrideArg<T extends object> = Parameters<TestAPI<T>['override']>[0];
/** The fixture map `nexusFixtures` returns, which `test.extend` takes. */
export type NexusFixtureMap =
  OverrideArg<NexusFixtures> extends Partial<infer F> ? F : never;
