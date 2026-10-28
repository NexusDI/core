import { describe, expect, it } from 'vitest';

import { HULL } from '../../physics/constants';

import type { HelmRecord, HelmSetpoints } from './contracts';
import {
  HELM_SETTLE,
  HELM_TUNING,
  helmTorque,
  RCS_THRUSTERS,
  stepHelm,
  thrustersDemand,
  toRadians,
  wrap,
} from './helm-model';

const dt = 0.5;

const atRest: HelmRecord = Object.freeze({ attitude: 0, rate: 0, torque: 0 });

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
    for (const record of [turning, shed, snapped]) {
      expect(Object.isFrozen(record)).toBe(true);
    }
  });
});
