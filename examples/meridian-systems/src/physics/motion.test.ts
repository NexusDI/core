import { describe, expect, it } from 'vitest';

import {
  driveDemand,
  HELM_SETTLE,
  HELM_TUNING,
  helmTorque,
  HULL,
  PLASMA_DRIVE,
  RCS_THRUSTERS,
  stepDrive,
  stepHelm,
  thrust,
  thrustersDemand,
  toRadians,
  wrap,
  type DriveRecord,
  type HelmRecord,
  type HelmSetpoints,
} from './motion';

const dt = 0.5;

const atRest: HelmRecord = Object.freeze({ attitude: 0, rate: 0, torque: 0 });
const drift: DriveRecord = Object.freeze({
  thrust: 0,
  massFlow: 0,
  acceleration: 0,
  velocity: 0,
  distance: 0,
});

/** One helm step that the router powered. */
function steer(
  helm: HelmRecord,
  setpoints: HelmSetpoints,
  step = dt,
): HelmRecord {
  return stepHelm(
    helm,
    setpoints,
    { dt: step, shed: false },
    RCS_THRUSTERS,
    HULL,
  );
}

/** What a turn from rest at 0 rad to `degrees` does, tick by tick. */
function turn(degrees: number, step = dt) {
  const setpoints = { heading: toRadians(degrees) };
  const sign = Math.sign(setpoints.heading);
  let helm = atRest;
  let within: number | null = null;
  let settled: number | null = null;
  let overshoot = 0;
  for (let tick = 1; tick <= 2000 && settled === null; tick++) {
    helm = steer(helm, setpoints, step);
    const error = wrap(setpoints.heading - helm.attitude);
    if (Math.sign(error) === -sign) {
      overshoot = Math.max(overshoot, Math.abs(error));
    }
    if (within === null && Math.abs(error) <= toRadians(1)) {
      within = tick * step;
    }
    if (
      helm.attitude === setpoints.heading &&
      helm.rate === 0 &&
      helm.torque === 0
    ) {
      settled = tick;
    }
  }
  return { within, settled, overshoot, helm, setpoints };
}

/** The fastest turn of `angle` rad from rest to rest at full torque, in s. */
function bangBang(angle: number): number {
  return 2 * Math.sqrt((angle * HULL.inertia) / RCS_THRUSTERS.maxTorque);
}

/** The unclamped PD torque, from the law's formula. */
function lawTorque(helm: HelmRecord, setpoints: HelmSetpoints): number {
  const { naturalFrequency: wn, damping } = HELM_TUNING;
  const error = wrap(setpoints.heading - helm.attitude);
  return HULL.inertia * (wn * wn * error - 2 * damping * wn * helm.rate);
}

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
});

describe('the angles', () => {
  it('wraps an angle to (−π, π]', () => {
    expect(wrap(Math.PI)).toBe(Math.PI);
    expect(wrap(-Math.PI)).toBe(Math.PI);
    expect(wrap(3 * Math.PI)).toBe(Math.PI);
    expect(wrap(-3 * Math.PI)).toBe(Math.PI);
    expect(wrap(2 * Math.PI)).toBe(0);
    expect(wrap(-3.1415926535897927)).toBe(-3.1415926535897927);
    expect(wrap(-3.1415926535897927)).toBeLessThanOrEqual(Math.PI);
  });

  it("converts the charts' degrees to radians", () => {
    expect(toRadians(42)).toBe(0.7330382858376184);
    expect(toRadians(117)).toBe(2.0420352248333655);
    expect(toRadians(203)).toBe(-2.7401669256310974);
    expect(toRadians(180)).toBe(Math.PI);
  });
});

describe('the helm', () => {
  it('turns 180° within 1° at 164.5 s at dt 0.5 with no overshoot and no sooner than 86.3 s', () => {
    const fastest =
      bangBang(Math.PI) -
      Math.sqrt((2 * toRadians(1) * HULL.inertia) / RCS_THRUSTERS.maxTorque);
    expect(fastest).toBeCloseTo(86.27, 2);
    const { within, overshoot } = turn(180);
    expect(within).toBe(164.5);
    expect(within).toBeGreaterThanOrEqual(fastest);
    expect(overshoot).toBe(0);
  });

  it('turns 180° within 1° at 167 s at dt 1 and settles at 408 s', () => {
    const { within, settled, overshoot } = turn(180, 1);
    expect(within).toBe(167);
    expect(settled).toBe(408);
    expect(overshoot).toBe(0);
  });

  it('settles the 180° turn at tick 786 and no sooner than 91.1 s', () => {
    expect(bangBang(Math.PI)).toBeCloseTo(91.07, 2);
    const { settled, helm } = turn(180);
    expect(settled).toBe(786);
    expect((settled ?? 0) * dt).toBeGreaterThanOrEqual(bangBang(Math.PI));
    expect(helm).toEqual({ attitude: Math.PI, rate: 0, torque: 0 });
  });

  it('saturates at 5,000,000 N·m and asks 20,000,000 W at e = π', () => {
    const setpoints = { heading: Math.PI };
    const { naturalFrequency } = HELM_TUNING;
    expect(HULL.inertia * naturalFrequency ** 2 * Math.PI).toBeCloseTo(
      25_918_139,
      0,
    );
    expect(helmTorque(atRest, setpoints, RCS_THRUSTERS, HULL)).toBe(5_000_000);
    expect(thrustersDemand(atRest, setpoints, RCS_THRUSTERS, HULL)).toBe(
      20_000_000,
    );
    expect(steer(atRest, { heading: -3 }).torque).toBe(-5_000_000);
  });

  it('follows the linear law inside the band', () => {
    const helm = Object.freeze({ attitude: 0.2, rate: 0.001, torque: 0 });
    const setpoints = { heading: 0.3 };
    const torque = lawTorque(helm, setpoints);
    expect(torque).toBeCloseTo(495_000, 6);
    expect(helmTorque(helm, setpoints, RCS_THRUSTERS, HULL)).toBe(torque);
    const rate = helm.rate + (torque / HULL.inertia) * dt;
    expect(steer(helm, setpoints)).toEqual({
      attitude: helm.attitude + rate * dt,
      rate,
      torque,
    });
    expect(thrustersDemand(helm, setpoints, RCS_THRUSTERS, HULL)).toBe(
      (RCS_THRUSTERS.power * torque) / RCS_THRUSTERS.maxTorque,
    );
  });

  it('applies no torque on a shed tick', () => {
    const helm = Object.freeze({ attitude: 0.1, rate: 0.01, torque: 5e6 });
    const next = stepHelm(
      helm,
      { heading: 1 },
      { dt, shed: true },
      RCS_THRUSTERS,
      HULL,
    );
    expect(next).toEqual({ attitude: 0.1 + 0.01 * dt, rate: 0.01, torque: 0 });
  });

  it('returns the record it got on a shed tick at rest', () => {
    expect(
      stepHelm(atRest, { heading: 1 }, { dt, shed: true }, RCS_THRUSTERS, HULL),
    ).toBe(atRest);
  });

  it('snaps a 42° turn at tick 687 and returns the record it got on the next step', () => {
    const setpoints = { heading: toRadians(42) };
    let helm = atRest;
    for (let tick = 1; tick < 687; tick++) helm = steer(helm, setpoints);
    const gap = Math.abs(setpoints.heading - helm.attitude);
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(HELM_SETTLE.angle);
    expect(gap).toBeCloseTo(9.94e-7, 9);
    expect(Math.abs(helm.rate)).toBeLessThan(HELM_SETTLE.rate);
    const snapped = steer(helm, setpoints);
    expect(snapped).toEqual({
      attitude: setpoints.heading,
      rate: 0,
      torque: 0,
    });
    expect(snapped.attitude - setpoints.heading).toBe(0);
    expect(steer(snapped, setpoints)).toBe(snapped);
    expect(turn(42).settled).toBe(687);
  });

  it('asks 0 W once settled', () => {
    const near = { attitude: 0.5 - 5e-7, rate: 5e-7, torque: 0 };
    expect(helmTorque(near, { heading: 0.5 }, RCS_THRUSTERS, HULL)).toBe(0);
    expect(thrustersDemand(near, { heading: 0.5 }, RCS_THRUSTERS, HULL)).toBe(
      0,
    );
    const spinning = { attitude: 0.5, rate: 2e-6, torque: 0 };
    expect(
      helmTorque(spinning, { heading: 0.5 }, RCS_THRUSTERS, HULL),
    ).toBeCloseTo(-660, 6);
    expect(steer(spinning, { heading: 0.5 }).rate).not.toBe(0);
  });

  it('freezes every record a step builds', () => {
    const turning = steer(atRest, { heading: 1 });
    const shed = stepHelm(
      turning,
      { heading: 1 },
      { dt, shed: true },
      RCS_THRUSTERS,
      HULL,
    );
    const snapped = steer(
      { attitude: 1 - 1e-7, rate: 1e-7, torque: 0 },
      { heading: 1 },
    );
    for (const record of [turning, shed, snapped, burn(1), burn(1, burn(1))]) {
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
