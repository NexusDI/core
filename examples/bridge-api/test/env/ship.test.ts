import { COMMAND_DESK } from '@nexusdi/meridian-systems';
import { nodeScopes } from '@nexusdi/node';
import { describe, expect, it } from 'vitest';

import { shipFromEnv } from '../../src/env/ship';
import { FLIGHT_LOG, SIM_DRIVER } from '../../src/ship/contracts';

describe('shipFromEnv', () => {
  it('hands its scopes to the flight recorder', async () => {
    const scopes = nodeScopes();
    await using ship = await shipFromEnv(scopes, { SIM_MODE: 'manual' });
    await using scope = await ship.createScope({
      request: { mission: { id: 'survey-7', target: 'Kepler-442b' } },
    });
    scopes.run(scope, () =>
      ship
        .get(COMMAND_DESK)
        .submit({ system: 'safety', action: 'close', door: 'airlock-outer' }),
    );
    expect(scope.get(FLIGHT_LOG).entries()).toEqual([
      'survey-7: closed airlock-outer',
    ]);
  });

  it('reads the mode from the env it is given', async () => {
    await using ship = await shipFromEnv(undefined, { SIM_MODE: 'manual' });
    expect(ship.get(SIM_DRIVER).mode).toBe('manual');
  });
});
