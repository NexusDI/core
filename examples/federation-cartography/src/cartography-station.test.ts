import { isNexusError, Nexus } from '@nexusdi/core';
import { federation } from '@nexusdi/federation';
import {
  FAKE_HEADING,
  FakeShell,
  grantedLoad,
  STATION_GRANT,
} from '@nexusdi/federation-contracts/testing';
import { nexusTest } from '@nexusdi/vitest';
import { expect, test as base } from 'vitest';

import { CartographyStation, NAV_ROUTES } from './cartography-station.module';

/** A fresh shell per test with CartographyStation loaded under the grant, as the shell loads it. */
const test = nexusTest(base, FakeShell).extend<{ station: Nexus }>({
  station: async ({ nexus }, serve) => {
    await nexus.load(CartographyStation, STATION_GRANT);
    await serve(nexus);
  },
});

test('finds a sector through the contract charts', ({ station: nexus }) => {
  expect(nexus.get(NAV_ROUTES).find('Kepler-442b')).toBe(
    `Kepler-442b: heading ${FAKE_HEADING}`,
  );
});

test('passes Nexus.check with federation()', () => {
  expect(() =>
    Nexus.check(FakeShell, {
      plugins: [federation()],
      load: [grantedLoad(CartographyStation)],
    }),
  ).not.toThrow();
});

test('needs the grant: a load without it misses meridian/NavCharts', async ({
  nexus,
}) => {
  const error = await nexus.load(CartographyStation).then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  if (!isNexusError(error, 'NEXUS_BLUEPRINT_INVALID'))
    throw new Error('Expected NEXUS_BLUEPRINT_INVALID.');
  expect(error.errors).toEqual([
    expect.objectContaining({
      code: 'NEXUS_MISSING_PROVIDER',
      token: 'meridian/NavCharts',
    }),
  ]);
  await nexus.load(CartographyStation, STATION_GRANT);
  expect(nexus.get(NAV_ROUTES).find('Kepler-442b')).toBe(
    `Kepler-442b: heading ${FAKE_HEADING}`,
  );
});
