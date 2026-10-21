import { Nexus } from '@nexusdi/core';
import { describe, it } from 'vitest';

import { createBridge } from '../../../src/hono';
import { OfflineMeridian } from '../../../src/ship/meridian';
import { growthCases } from '../../runtime/growth-cases';

describe('the simulation on workerd', () => {
  it.each(growthCases.map((each) => [each.name, each] as const))(
    '%s',
    async (_, each) => {
      await using ship = await Nexus.create(OfflineMeridian);
      const app = createBridge(ship);
      await each.run(async (path, init) =>
        app.request(`https://bridge.test${path}`, init),
      );
    },
  );
});
