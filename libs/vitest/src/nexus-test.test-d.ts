import { expectTypeOf, test as base } from 'vitest';

import {
  defineModule,
  type Nexus,
  type NexusRequest,
  type Scope,
} from '@nexusdi/core';
import type { TestingContainerBuilder } from '@nexusdi/testing';

import { nexusTest, type NexusSetupStep } from './index.js';

const Meridian = defineModule({ name: 'Meridian' });
const test = nexusTest(base, Meridian);

test('types the fixtures in a test callback', ({
  nexus,
  nexusScope,
  nexusRequest,
  nexusSetup,
}) => {
  expectTypeOf(nexus).toEqualTypeOf<Nexus>();
  expectTypeOf(nexusScope).toEqualTypeOf<Scope>();
  expectTypeOf(nexusRequest).toEqualTypeOf<NexusRequest | undefined>();
  expectTypeOf(nexusSetup).toEqualTypeOf<readonly NexusSetupStep[]>();
});

test('override types a request and a setup step with a typed builder', () => {
  const survey = { mission: { id: 'survey-7', target: 'Kepler-442b' } };
  test.override('nexusRequest', survey);
  test.override('nexusSetup', [
    (builder) => {
      expectTypeOf(builder).toEqualTypeOf<TestingContainerBuilder>();
      return builder;
    },
  ]);
});

const extended = test.extend<{ extra: string }>({
  // Vitest reads a fixture's dependencies from its first parameter, which
  // must be a destructuring pattern.
  // eslint-disable-next-line no-empty-pattern
  extra: async ({}, use) => use('docked'),
});

extended('composes with a further extend', ({ nexus, extra }) => {
  expectTypeOf(nexus).toEqualTypeOf<Nexus>();
  expectTypeOf(extra).toEqualTypeOf<string>();
});
