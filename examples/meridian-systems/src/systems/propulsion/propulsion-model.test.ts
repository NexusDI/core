import { describe, expect, it } from 'vitest';

import { HULL } from '../../physics/constants';

import type { DriveRecord } from './contracts';
import {
  driveDemand,
  PLASMA_DRIVE,
  stepDrive,
  thrust,
} from './propulsion-model';

const dt = 0.5;

const drift: DriveRecord = Object.freeze({
  thrust: 0,
  massFlow: 0,
  acceleration: 0,
  velocity: 0,
  distance: 0,
});

/** `drive` after `ticks` burns at 600 MW along the course. */
function burn(ticks: number, drive = drift): DriveRecord {
  let next = drive;
  for (let tick = 0; tick < ticks; tick++) {
    next = stepDrive(
      next,
      { power: 600e6, attitude: 0, course: 0, dt },
      PLASMA_DRIVE,
      HULL,
    );
  }
  return next;
}

describe('the main drive', () => {
  it('thrusts 14,400 N at 600 MW and burns 0.288 kg/s', () => {
    expect(thrust(600e6, PLASMA_DRIVE)).toBe(14_400);
    const drive = burn(1);
    expect(drive.thrust).toBe(14_400);
    expect(drive.massFlow).toBe(0.288);
    expect(0.5 * drive.massFlow * PLASMA_DRIVE.exhaust ** 2).toBe(
      PLASMA_DRIVE.efficiency * 600e6,
    );
    expect(driveDemand({ throttle: 1 }, PLASMA_DRIVE)).toBe(600e6);
    expect(driveDemand({ throttle: 0.5 }, PLASMA_DRIVE)).toBe(300e6);
  });

  it('accelerates an aligned ship at 0.0036 m/s²', () => {
    expect(burn(1).acceleration).toBe(0.0036);
  });

  it('scales an off-axis burn by the cosine of the angle', () => {
    const drive = stepDrive(
      drift,
      { power: 600e6, attitude: 0.9, course: 0.4, dt },
      PLASMA_DRIVE,
      HULL,
    );
    expect(drive.acceleration).toBe((14_400 * Math.cos(0.5)) / HULL.mass);
    expect(drive.thrust).toBe(14_400);
  });

  it('returns the drive record it got at rest with no power', () => {
    expect(
      stepDrive(
        drift,
        { power: 0, attitude: 1, course: 0, dt },
        PLASMA_DRIVE,
        HULL,
      ),
    ).toBe(drift);
  });

  it('gives v 0.0018 and s 0.0009 after one aligned tick', () => {
    const drive = burn(1);
    expect(drive.velocity).toBe(0.0018);
    expect(drive.distance).toBe(0.0009);
  });

  it('gives v 0.72 and s 72.18 after 400 aligned ticks', () => {
    const drive = burn(400);
    expect(Math.abs(drive.velocity - 0.72)).toBeLessThan(1e-12);
    expect(Math.abs(drive.distance - 72.18)).toBeLessThan(1e-12);
  });

  it('coasts with no thrust', () => {
    const moving = burn(400);
    const coast = stepDrive(
      moving,
      { power: 0, attitude: 2, course: 0, dt },
      PLASMA_DRIVE,
      HULL,
    );
    expect(coast).toEqual({
      thrust: 0,
      massFlow: 0,
      acceleration: 0,
      velocity: moving.velocity,
      distance: moving.distance + moving.velocity * dt,
    });
  });

  it('freezes every record a step builds', () => {
    for (const record of [burn(1), burn(1, burn(1))]) {
      expect(Object.isFrozen(record)).toBe(true);
    }
    const coast = stepDrive(
      burn(1),
      { power: 0, attitude: 0, course: 0, dt },
      PLASMA_DRIVE,
      HULL,
    );
    expect(Object.isFrozen(coast)).toBe(true);
  });
});
