import { Nexus } from '@nexusdi/core';
import { federation } from '@nexusdi/federation';
import {
  FAKE_HEADING,
  stationRoot,
} from '@nexusdi/federation-contracts/testing';
import { nexusTest } from '@nexusdi/vitest';
import { expect, test as base } from 'vitest';

import { CartographyStation, NAV_ROUTES } from './cartography-station.module';

const root = stationRoot(CartographyStation);
const test = nexusTest(base, root);

test('finds a sector through the contract charts', ({ nexus }) => {
  expect(nexus.get(NAV_ROUTES).find('Kepler-442b')).toBe(
    `Kepler-442b: heading ${FAKE_HEADING}`,
  );
});

test('passes Nexus.check with federation()', () => {
  expect(() => Nexus.check(root, { plugins: [federation()] })).not.toThrow();
});
