import { Nexus } from '@nexusdi/core';
import { nodeScopes } from '@nexusdi/node';
import { describe, it } from 'vitest';

import { createBridge } from '../../../src/entries/hono';
import { OfflineMeridian } from '../../../src/ship/meridian.module';
import { bridgePlugins } from '../../../src/ship/plugins';
import { growthCases, runGrowthCase } from '../../runtime/growth-cases';

describe('the simulation on workerd', () => {
  it.each(growthCases.map((each) => [each.name, each] as const))(
    '%s',
    async (_, each) => {
      // The ship and the bridge share one nodeScopes(), as
      // src/entries/worker.offline.ts builds them.
      const scopes = nodeScopes();
      await using ship = await Nexus.create(OfflineMeridian, {
        plugins: bridgePlugins({ scopes }),
      });
      const app = createBridge(ship, { scopes });
      await runGrowthCase('workerd', each, async (path, init) =>
        app.request(`https://bridge.test${path}`, init),
      );
    },
  );
});
