import { Nexus } from '@nexusdi/core';
import { profile } from '@nexusdi/devtools';
import { expect, it } from 'vitest';

import { OfflineMeridian } from '../src/ship/meridian';
import { bridgePlugins } from '../src/ship/plugins';

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
