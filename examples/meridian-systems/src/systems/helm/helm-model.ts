import type { HullRating } from '../../physics/constants';
import type { PowerLoad } from '../engineering/contracts';

import type { HelmRecord, HelmSetpoints, ThrusterRating } from './contracts';

/** The Meridian's reaction control thrusters. */
export const RCS_THRUSTERS: ThrusterRating = { maxTorque: 5e6, power: 20e6 };

/** The helm's PD law: the natural frequency ω_n in rad/s and the damping ratio ζ. */
export const HELM_TUNING = { naturalFrequency: 0.05, damping: 1 } as const;

/**
 * The helm holds the course once the error falls under `angle` rad and the
 * rate under `rate` rad/s at the start of a tick.
 */
export const HELM_SETTLE = { angle: 1e-6, rate: 1e-6 } as const;

/** The thrusters' place on the power router. They put no power into the coolant loop. */
export const THRUSTERS_LOAD: Omit<PowerLoad, 'demand'> = {
  id: 'thrusters',
  priority: 4,
  heatShare: 0,
};

const TURN = 2 * Math.PI;

/**
 * The angle `x` in (−π, π]. The step uses subtraction, multiplication,
 * division, `Math.ceil` and a compare, which ECMA-262 fixes bit for bit, so
 * every engine wraps to the same double. The rounding of the first step puts
 * the double just above −π one ulp above π, and the compare moves it back.
 */
export function wrap(x: number): number {
  const y = x - TURN * Math.ceil((x - Math.PI) / TURN);
  return y > Math.PI ? y - TURN : y;
}

/** The charts' heading `degrees` in rad, in (−π, π]. */
export function toRadians(degrees: number): number {
  return wrap((degrees * Math.PI) / 180);
}

/** True when `helm` holds the course within `HELM_SETTLE`. */
function settled(helm: HelmRecord, setpoints: HelmSetpoints): boolean {
  return (
    Math.abs(wrap(setpoints.heading - helm.attitude)) < HELM_SETTLE.angle &&
    Math.abs(helm.rate) < HELM_SETTLE.rate
  );
}

/**
 * The torque the PD law asks of the thrusters on a tick that starts from
 * `helm`, `I · (ω_n² · e − 2 · ζ · ω_n · ω)` with `e = wrap(θ_set − θ)`,
 * clamped to `±τ_max`, in N·m. A settled helm asks 0.
 */
export function helmTorque(
  helm: HelmRecord,
  setpoints: HelmSetpoints,
  thrusters: ThrusterRating,
  hull: HullRating,
): number {
  if (settled(helm, setpoints)) return 0;
  const { naturalFrequency: wn, damping } = HELM_TUNING;
  const error = wrap(setpoints.heading - helm.attitude);
  const torque =
    hull.inertia * (wn * wn * error - 2 * damping * wn * helm.rate);
  return Math.min(thrusters.maxTorque, Math.max(-thrusters.maxTorque, torque));
}

/**
 * The power the thrusters ask the router for on a tick that starts from
 * `helm`, `P · |τ| / τ_max`, in W. A settled helm asks 0 W.
 */
export function thrustersDemand(
  helm: HelmRecord,
  setpoints: HelmSetpoints,
  thrusters: ThrusterRating,
  hull: HullRating,
): number {
  return (
    (thrusters.power * Math.abs(helmTorque(helm, setpoints, thrusters, hull))) /
    thrusters.maxTorque
  );
}

/** Everything one helm step reads beside the record and the setpoints. */
interface HelmTick {
  /** Seconds. */
  readonly dt: number;
  /** True when the router shed the thrusters this tick. */
  readonly shed: boolean;
}

/**
 * Steps the helm in phase 2.
 *
 * A helm that starts the tick settled holds the course with no rate and no
 * torque. Any other helm turns by semi-implicit Euler: `ω' = ω + τ / I · dt`
 * and `θ' = wrap(θ + ω' · dt)`, with the torque of `helmTorque` and 0 N·m on
 * a tick the router shed the thrusters. The step returns the record it got
 * when it changes no field, and every record it builds is frozen.
 */
export function stepHelm(
  helm: HelmRecord,
  setpoints: HelmSetpoints,
  { dt, shed }: HelmTick,
  thrusters: ThrusterRating,
  hull: HullRating,
): HelmRecord {
  let next: HelmRecord;
  if (settled(helm, setpoints)) {
    next = { attitude: setpoints.heading, rate: 0, torque: 0 };
  } else {
    const torque = shed ? 0 : helmTorque(helm, setpoints, thrusters, hull);
    const rate = helm.rate + (torque / hull.inertia) * dt;
    next = { attitude: wrap(helm.attitude + rate * dt), rate, torque };
  }
  return next.attitude === helm.attitude &&
    next.rate === helm.rate &&
    next.torque === helm.torque
    ? helm
    : Object.freeze(next);
}
