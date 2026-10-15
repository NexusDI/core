import { expectTypeOf, test as base } from 'vitest';

import {
  defineModule,
  type Nexus,
  type NexusRequest,
  type Scope,
} from '@nexusdi/core';
import type { TestingContainerBuilder } from '@nexusdi/testing';

import {
  nexusFixtures,
  type NexusFixtureMap,
  type NexusFixtures,
  type NexusSetupStep,
} from './index.js';

const Meridian = defineModule({ name: 'Meridian' });
const test = base.extend(nexusFixtures(Meridian));

test('returns the fixture map that test.extend takes, typed through vitest', () => {
  expectTypeOf(nexusFixtures(Meridian)).toEqualTypeOf<NexusFixtureMap>();
  expectTypeOf<keyof NexusFixtureMap>().toEqualTypeOf<keyof NexusFixtures>();
});

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

test('a setup step maps a builder to a builder', () => {
  expectTypeOf<NexusSetupStep>().toEqualTypeOf<
    (builder: TestingContainerBuilder) => TestingContainerBuilder
  >();
});

test('test.override(name, value) types a setup step and a request', () => {
  test.override('nexusSetup', [
    (builder) => {
      expectTypeOf(builder).toEqualTypeOf<TestingContainerBuilder>();
      return builder;
    },
  ]);
  const survey = { mission: { id: 'survey-7', target: 'Kepler-442b' } };
  test.override('nexusRequest', survey);
});
