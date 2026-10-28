import type { AtmosphereReading } from '@nexusdi/meridian-systems';
import { describe, expect, it } from 'vitest';

import { FRAMEWORKS } from '../../test/support';
import { advance, manual, post, readShip, withShip } from './ship';

const throttle = { system: 'engineering', action: 'throttle', level: 0.01 };
const online = { system: 'life-support', action: 'online' };
const evacuate = {
  system: 'life-support',
  action: 'pump',
  compartment: 'airlock',
  mode: 'evacuate',
};

/** Posts `command` and checks that the desk queues it for `tick`. */
async function queue(url: string, command: object, tick: number) {
  const queued = await post(url, '/commands', command);
  expect(queued.status).toBe(202);
  expect(await queued.json()).toEqual({ tick });
}

/** Reads the analyzer of `compartment` with GET /compartments/:id/atmosphere. */
async function readAir(
  url: string,
  compartment: string,
): Promise<AtmosphereReading> {
  const read = await fetch(`${url}/compartments/${compartment}/atmosphere`);
  expect(read.status).toBe(200);
  return (await read.json()) as AtmosphereReading;
}

describe.each(FRAMEWORKS)('life support on %s', (framework) => {
  it('heats the habitat and pumps the airlock down', () =>
    withShip(framework, manual, async (url) => {
      await queue(url, throttle, 1);
      await queue(url, online, 1);

      // The habitat starts at 293 K, and the analyzer adds up to 0.05 K
      // of calibration noise.
      const cold = await readAir(url, 'habitat');
      expect(cold.tick).toBe(0);
      expect(cold.temperature).toBeGreaterThanOrEqual(292.95);
      expect(cold.temperature).toBeLessThanOrEqual(293.05);

      // At tick 600 the habitat heater draws 2,346.4006 W.
      await advance(url, 600, 600);
      const warm = await readAir(url, 'habitat');
      expect(warm.tick).toBe(600);
      expect(Math.abs(warm.temperature - 292.765)).toBeLessThan(0.1);
      const ship = await readShip(url);
      expect(ship.lifeSupport.heaters.habitat).toBe(2346.4006);

      // The pump moves the airlock's air into the habitat from tick 601.
      // At tick 720 the model gives 37,023 Pa in the airlock and
      // 107,590.6 Pa in the habitat, and the airlock's analyzer adds up to
      // 20 Pa of noise.
      await queue(url, evacuate, 601);
      await advance(url, 120, 720);
      const airlock = await readAir(url, 'airlock');
      expect(airlock.tick).toBe(720);
      expect(airlock.pressure).toBeGreaterThanOrEqual(36_950);
      expect(airlock.pressure).toBeLessThanOrEqual(37_100);
      // Without the transfer the habitat would read 101,192 Pa.
      const pumpedShip = await readShip(url);
      expect(pumpedShip.compartments.habitat.pressure).toBeGreaterThanOrEqual(
        107_000,
      );
      expect(pumpedShip.compartments.habitat.pressure).toBeLessThanOrEqual(
        108_000,
      );

      const galley = await fetch(`${url}/compartments/galley/atmosphere`);
      expect(galley.status).toBe(404);
      expect(await galley.json()).toMatchObject({
        code: 'MERIDIAN_UNKNOWN_COMPARTMENT',
        message:
          "No compartment is named 'galley'. The deck has bridge, habitat, reactor-bay and airlock.",
      });
    }));
});
