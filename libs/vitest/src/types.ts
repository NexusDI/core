import type { Nexus, NexusRequest, Scope } from '@nexusdi/core';
import type {
  TestingContainerBuilder,
  TestingCreateOptions,
} from '@nexusdi/testing';

// The fixture types, apart from fixtures.ts: nexus-test.ts reaches them
// without the @vitest/runner type that nexusFixtures' signature needs,
// which Vitest 5 no longer publishes.

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
