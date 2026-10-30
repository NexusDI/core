import {
  SHIP_STATE,
  SUBSPACE_LINK,
  TICK_LOOP,
} from '@nexusdi/meridian-systems';
import { createTestingContainer } from '@nexusdi/testing';
import { expect, it } from 'vitest';

import { COMMS_LOG } from '../../src/ship/contracts';
import { Meridian } from '../../src/ship/meridian.module';
import { bridgePlugins } from '../../src/ship/plugins';
import { FailingLink } from '../doubles';

it('the retry interceptor on SUBSPACE_LINK calls next() again until the relay takes the sign-off, and the comms log counts the attempts', async () => {
  const link = new FailingLink(2);
  const ship = await createTestingContainer(Meridian)
    // The plugin wraps class and factory instances, so the double comes from a factory.
    .override(SUBSPACE_LINK, { useFactory: () => link })
    .create({
      plugins: bridgePlugins({ retry: { attempts: 3, delayMs: 0 } }),
    });
  // The reactor puts out power for the sign-off only at a throttle, after some ticks.
  ship.get(SHIP_STATE).queue({ reactor: { throttle: 1 } });
  ship.get(TICK_LOOP).advance(20);
  const log = ship.get(COMMS_LOG);
  await ship[Symbol.asyncDispose]();

  expect(link.calls).toBe(3);
  expect(link.signOffs).toHaveLength(1);
  expect(log.entries).toEqual([
    'link signOff attempt 1 failed',
    'link signOff attempt 2 failed',
    'link signOff answered on attempt 3',
  ]);
});
