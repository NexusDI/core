import { describe, expect, it } from 'vitest';

import { FRAMEWORKS } from '../../test/support';
import { advance, manual, post, readShip, withShip } from './ship';

const throttle = { system: 'engineering', action: 'throttle', level: 0.01 };
const online = { system: 'life-support', action: 'online' };
const pump = (mode: string) => ({
  system: 'life-support',
  action: 'pump',
  compartment: 'airlock',
  mode,
});
const door = (action: string) => ({
  system: 'safety',
  action,
  door: 'habitat-airlock',
});
const suppress = (action: string) => ({
  system: 'safety',
  action,
  compartment: 'habitat',
});
const fix =
  'bring both sides within 5,000 Pa of each other with a pump or a vent, then open the door.';

/** Posts `command` and checks that the desk queues it for `tick`. */
async function queue(url: string, command: object, tick: number) {
  const queued = await post(url, '/commands', command);
  expect(queued.status).toBe(202);
  expect(await queued.json()).toEqual({ tick });
}

/**
 * Queues the reactor at 1 % and life support online for tick 1. A cold
 * reactor sheds life support.
 */
async function powerUp(url: string) {
  await queue(url, throttle, 1);
  await queue(url, online, 1);
}

/** Opens the habitat-airlock door and checks that the interlock refuses `difference`. */
async function refused(url: string, difference: string) {
  const answer = await post(url, '/commands', door('open'));
  expect(answer.status).toBe(409);
  expect(await answer.json()).toEqual({
    code: 'MERIDIAN_INTERLOCK',
    message: `The habitat-airlock door holds ${difference} Pa of difference, above the 5,000 Pa interlock.`,
    fix,
  });
}

describe.each(FRAMEWORKS)('safety on %s', (framework) => {
  it('opens the airlock door once the pump has evened the pressures', () =>
    withShip(framework, manual, async (url) => {
      await powerUp(url);
      await queue(url, pump('evacuate'), 1);

      // At tick 120 the airlock holds 37,095.6 Pa against the habitat's
      // 107,681.0 Pa.
      await advance(url, 120, 120);
      await refused(url, '70,585');
      await queue(url, pump('fill'), 121);

      await advance(url, 68, 188);
      await refused(url, '5,323');

      // At tick 189 the difference is 4,391 Pa, under the limit.
      await advance(url, 1, 189);
      const opened = await post(url, '/commands', door('open'));
      expect(opened.status).toBe(202);
      expect(await opened.json()).toEqual({
        tick: 190,
        flightLog: ['survey-7: opened habitat-airlock'],
      });
      await queue(url, pump('off'), 190);

      // At tick 209 the model gives 101,250.9 Pa in the habitat and
      // 101,172.4 Pa in the airlock.
      await advance(url, 20, 209);
      const ship = await readShip(url);
      expect(ship.setpoints.safety.doors['habitat-airlock']).toBe(true);
      const { habitat, airlock } = ship.compartments;
      expect(Math.abs(habitat.pressure - airlock.pressure)).toBeLessThan(200);
      expect(ship.safety.alarms).toEqual([]);

      const log = await fetch(`${url}/commands`);
      expect(log.status).toBe(200);
      expect(await log.json()).toContainEqual({
        tick: 190,
        change: {
          lifeSupport: { pumps: { airlock: 'off' } },
          safety: { doors: { 'habitat-airlock': true } },
        },
      });

      // The flight recorder wraps close as well, and the interlock does not.
      const closed = await fetch(`${url}/commands`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-mission-id': 'survey-9',
        },
        body: JSON.stringify(door('close')),
      });
      expect(closed.status).toBe(202);
      expect(await closed.json()).toEqual({
        tick: 210,
        flightLog: ['survey-9: closed habitat-airlock'],
      });
    }));

  it('lights a drill fire in the habitat and floods it out', () =>
    withShip(framework, manual, async (url) => {
      await powerUp(url);
      await queue(url, suppress('drill'), 1);

      // The drill lights the fire at 0.05 and its flag returns to false.
      await advance(url, 1, 1);
      const lit = await readShip(url);
      expect(lit.safety.fires.habitat).toBe(0.05);
      expect(lit.safety.alarms).toEqual([{ code: 'FIRE', subject: 'habitat' }]);
      expect(lit.setpoints.safety.drills.habitat).toBe(false);

      // The fire burns at 1 from tick 39.
      await advance(url, 59, 60);
      await queue(url, suppress('flood'), 61);

      // The valve closes at tick 80 and the fire goes out at tick 122. At
      // tick 130 the model gives 142,687.9 Pa in the habitat.
      await advance(url, 70, 130);
      const out = await readShip(url);
      expect(out.safety.fires.habitat).toBe(0);
      expect(out.safety.alarms).toEqual([]);
      expect(out.setpoints.safety.floods.habitat).toBe(false);
      expect(out.compartments.habitat.pressure).toBeGreaterThanOrEqual(142_000);
      expect(out.compartments.habitat.pressure).toBeLessThanOrEqual(143_500);
    }));
});
