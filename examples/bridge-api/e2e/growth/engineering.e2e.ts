import { describe, expect, it } from 'vitest';

import { FRAMEWORKS } from '../../test/support';
import { advance, manual, post, readShip, withShip } from './ship';

const throttle = { system: 'engineering', action: 'throttle', level: 1 };
const raise = { system: 'engineering', action: 'shields', raised: true };

describe.each(FRAMEWORKS)('engineering on %s', (framework) => {
  it('raises the shields once the reactor output fits them', () =>
    withShip(framework, manual, async (url) => {
      const throttled = await post(url, '/commands', throttle);
      expect(throttled.status).toBe(202);
      expect(await throttled.json()).toEqual({ tick: 1 });

      // The reactor ramps 0.01 a tick from tick 1, so tick 16 runs at
      // level 0.16 and 193.6 MW of the 1.21 GW full output.
      await advance(url, 16, 16);
      const refused = await post(url, '/commands', raise);
      expect(refused.status).toBe(409);
      expect(await refused.json()).toMatchObject({
        code: 'MERIDIAN_POWER_BUDGET',
        message:
          'The shields load needs 200 MW, and the router has 193.6 MW free beside the loads above it.',
      });

      // Level 0.17 gives 205.7 MW, enough for the grid's 200 MW.
      await advance(url, 1, 17);
      const raised = await post(url, '/commands', raise);
      expect(raised.status).toBe(202);
      expect(await raised.json()).toEqual({ tick: 18 });

      await advance(url, 1, 18);
      const ship = await readShip(url);
      expect(ship.reactor.level).toBe(0.18);
      expect(ship.power.loads).toContainEqual(
        expect.objectContaining({ id: 'shields', allocated: 2e8 }),
      );

      // The refused raise was never queued, so the log holds two entries.
      const log = await fetch(`${url}/commands`);
      expect(log.status).toBe(200);
      expect(await log.json()).toEqual([
        { tick: 1, change: { reactor: { throttle: 1 } } },
        { tick: 18, change: { shields: { raised: true } } },
      ]);
    }));
});
