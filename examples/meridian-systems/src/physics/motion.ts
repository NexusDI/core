import type { PowerLoad } from './power';

/** The hull's fixed figures. */
export interface HullRating {
  /** The ship's mass, in kg. */
  readonly mass: number;
  /** The moment of inertia about the yaw axis, in kg·m². */
  readonly inertia: number;
}

/** The main drive's fixed figures. */
export interface DriveRating {
  /** The share of the electric power that ends in the jet, η_d. */
  readonly efficiency: number;
  /** The exhaust velocity v_e, in m/s. */
  readonly exhaust: number;
  /** The drive's draw at full throttle, in W. */
  readonly power: number;
}

/** The attitude thrusters' fixed figures. */
export interface ThrusterRating {
  /** The torque limit τ_max, in N·m. */
  readonly maxTorque: number;
  /** The thrusters' draw at the torque limit, in W. */
  readonly power: number;
}

/** The Meridian's hull, from spec §5.8. */
export const HULL: HullRating = { mass: 4.0e6, inertia: 3.3e9 };

/** The Meridian's plasma drive, from spec §5.8. */
export const PLASMA_DRIVE: DriveRating = {
  efficiency: 0.6,
  exhaust: 50_000,
  power: 600e6,
};

/** The Meridian's reaction control thrusters, from spec §5.8. */
export const RCS_THRUSTERS: ThrusterRating = { maxTorque: 5e6, power: 20e6 };

/** The helm's PD law: the natural frequency ω_n in rad/s and the damping ratio ζ. */
export const HELM_TUNING = { naturalFrequency: 0.05, damping: 1 } as const;

/**
 * The helm holds the course once the error falls under `angle` rad and the
 * rate under `rate` rad/s at the start of a tick.
 */
export const HELM_SETTLE = { angle: 1e-6, rate: 1e-6 } as const;

/** The thrusters' place on the power router, spec §5.7. They put no power into the coolant loop. */
export const THRUSTERS_LOAD: Omit<PowerLoad, 'demand'> = {
  id: 'thrusters',
  priority: 4,
  heatShare: 0,
};

/** The main drive's place on the power router, spec §5.7. */
export const MAIN_DRIVE_LOAD: Omit<PowerLoad, 'demand'> = {
  id: 'main-drive',
  priority: 5,
  heatShare: 0.4,
};

/** The main drive at the end of a tick. */
export interface DriveRecord {
  /** In N. */
  readonly thrust: number;
  /** The propellant the drive spends, in kg/s. */
  readonly massFlow: number;
  /** Along the track, in m/s². */
  readonly acceleration: number;
  /** Along the track, in m/s. */
  readonly velocity: number;
  /** Along the track since tick 0, in m. */
  readonly distance: number;
}

/** What the crew set for the main drive. */
export interface DriveSetpoints {
  /** 0 to 1. */
  readonly throttle: number;
}

/** The ship's yaw at the end of a tick. */
export interface HelmRecord {
  /** The yaw angle θ, in rad, in (−π, π]. */
  readonly attitude: number;
  /** The yaw rate ω, in rad/s. */
  readonly rate: number;
  /** The torque the thrusters applied this tick, in N·m. */
  readonly torque: number;
}

/** What the crew set for the helm. */
export interface HelmSetpoints {
  /** The course θ_set the helm steers for, in rad, in (−π, π]. */
  readonly heading: number;
}

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

/** The drive's thrust at `power` W, `F = 2 · η_d · P_d / v_e`, in N. */
export function thrust(power: number, rating: DriveRating): number {
  return (2 * rating.efficiency * power) / rating.exhaust;
}

/** The power the main drive asks the router for, `throttle · P`, in W. */
export function driveDemand(
  setpoints: DriveSetpoints,
  rating: DriveRating,
): number {
  return setpoints.throttle * rating.power;
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
 * Steps the helm in phase 2 (spec §5.8).
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

/** Everything one drive step reads beside the record. */
interface DriveTick {
  /** The power the router allocated the main drive this tick, in W. */
  readonly power: number;
  /** The helm's attitude at the start of the tick, in rad. */
  readonly attitude: number;
  /** The course the helm steers for, in rad. */
  readonly course: number;
  /** Seconds. */
  readonly dt: number;
}

/**
 * Steps the main drive in phase 2 (spec §5.8).
 *
 * The drive pushes with the thrust of `power` and spends `ṁ = F / v_e`. The
 * ship gains `a = F · cos(attitude − course) / M` along the track, then
 * `v' = v + a · dt` and `s' = s + v' · dt`. With no thrust the step computes
 * no cosine and the ship coasts. The step returns the record it got at rest
 * with no thrust, and every record it builds is frozen.
 */
export function stepDrive(
  drive: DriveRecord,
  { power, attitude, course, dt }: DriveTick,
  rating: DriveRating,
  hull: HullRating,
): DriveRecord {
  const force = thrust(power, rating);
  if (
    force === 0 &&
    drive.thrust === 0 &&
    drive.acceleration === 0 &&
    drive.velocity === 0
  ) {
    return drive;
  }
  const acceleration =
    force === 0 ? 0 : (force * Math.cos(attitude - course)) / hull.mass;
  const velocity = drive.velocity + acceleration * dt;
  return Object.freeze({
    thrust: force,
    massFlow: force / rating.exhaust,
    acceleration,
    velocity,
    distance: drive.distance + velocity * dt,
  });
}
