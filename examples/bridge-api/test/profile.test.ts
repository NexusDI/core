import { Nexus } from '@nexusdi/core';
import { profile } from '@nexusdi/devtools';
import { createTestingContainer } from '@nexusdi/testing';
import { expect, it } from 'vitest';

import { SUBSPACE_LINK } from '../src/ship/contracts';
import { Meridian, OfflineMeridian } from '../src/ship/meridian.module';
import { bridgePlugins } from '../src/ship/plugins';
import { FixedLink } from './doubles';

it('profiles the LifeSupportOptions factory as the async step of startup', async () => {
  const profiler = profile();
  const ship = await Nexus.create(OfflineMeridian, {
    plugins: [...bridgePlugins(), profiler],
  });
  await ship[Symbol.asyncDispose]();
  const report = profiler.report();
  expect(report.graph?.root).toBe('OfflineMeridian');
  const [create] = report.runs;
  expect(create).toMatchObject({ kind: 'create', ok: true });
  // readCalibration is async, so the container awaits the options before
  // LifeSupport's physics, power and analyzer build on them.
  const awaited = create.builds.filter((build) => build.async);
  expect(awaited).toEqual([
    expect.objectContaining({
      token: 'LifeSupportOptions',
      module: 'LifeSupport',
      lifetime: 'singleton',
      level: 0,
      failed: false,
    }),
  ]);
  expect(report.graph?.providers).toContainEqual(
    expect.objectContaining({
      token: 'LifeSupportOptions',
      module: 'LifeSupport',
      kind: 'factory',
    }),
  );
});

it('profiles the charts download of Meridian beside the LifeSupportOptions factory', async () => {
  const profiler = profile();
  const ship = await createTestingContainer(Meridian)
    .override(SUBSPACE_LINK, { useClass: FixedLink })
    .create({ plugins: [...bridgePlugins(), profiler] });
  await ship[Symbol.asyncDispose]();
  const report = profiler.report();
  expect(report.graph?.root).toBe('Meridian');
  const [create] = report.runs;
  expect(create).toMatchObject({ kind: 'create', ok: true });
  // NavCharts's factory takes SUBSPACE_LINK, so the container awaits the
  // charts download one level after it builds the link.
  const awaited = create.builds.filter((build) => build.async);
  expect(awaited).toEqual([
    expect.objectContaining({
      token: 'LifeSupportOptions',
      module: 'LifeSupport',
      lifetime: 'singleton',
      level: 0,
      failed: false,
    }),
    expect.objectContaining({
      token: 'NavCharts',
      module: 'Tactical',
      lifetime: 'singleton',
      level: 1,
      failed: false,
    }),
  ]);
  for (const [token, module] of [
    ['LifeSupportOptions', 'LifeSupport'],
    ['NavCharts', 'Tactical'],
  ]) {
    expect(report.graph?.providers).toContainEqual(
      expect.objectContaining({ token, module, kind: 'factory' }),
    );
  }
});
